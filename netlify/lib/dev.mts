// Developer tools: free API keys with usage counts, and webhooks that are told the moment a light changes.
//   apikey/<sha256 of key>          { name, email, use, createdAt, revoked? }
//   usage/<keyHash>/<yyyy-mm-dd>    { count }
//   hook/<keyHash>/<hookId>         { url, secret, events, createdAt, fails, disabled, lastStatus, lastAt }
import { readAll, shownLight, store, vuDate, type Nakamal } from "./data.mts";

export const KEY_HEADER = "x-api-key";
export const MAX_HOOKS = 3;
export const HOOK_EVENTS = ["light.changed", "special.created"];
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export const newSecret = (bytes = 24) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const siteUrl = () => (Netlify.env.get("URL") || "https://killimlightvanuatu.com").replace(/\/$/, "");

export type ApiKey = { name: string; email: string; use: string; createdAt: number; revoked?: boolean };
// The key a request carries (header, or ?key= for quick tests). null = anonymous; "bad" = unknown or revoked.
export async function keyOf(req: Request): Promise<{ hash: string; key: ApiKey } | null | "bad"> {
  const raw = req.headers.get(KEY_HEADER) || new URL(req.url).searchParams.get("key");
  if (!raw) return null;
  if (!/^kl_[a-f0-9]{40}$/.test(raw)) return "bad";
  const hash = await sha256(raw);
  const key = (await store().get("apikey/" + hash, { type: "json" })) as ApiKey | null;
  return key && !key.revoked ? { hash, key } : "bad";
}
export async function countUse(hash: string) {
  const k = `usage/${hash}/${vuDate()}`, s = store();
  const cur = ((await s.get(k, { type: "json" })) as { count: number } | null) || { count: 0 };
  await s.setJSON(k, { count: cur.count + 1 });
}
export async function usageOf(hash: string, days = 30) {
  const all = await readAll<{ count: number }>(`usage/${hash}/`);
  return Array.from({ length: days }, (_, i) => { const d = vuDate(Date.now() - (days - 1 - i) * 864e5); return { day: d, count: all.get(d)?.count || 0 }; });
}

// Webhook addresses must be public https sites (not this server's own network).
export function hookUrlProblem(u: string) {
  let url: URL;
  try { url = new URL(u); } catch { return "That isn't a web address."; }
  if (url.protocol !== "https:") return "Use an https:// address.";
  const h = url.hostname.toLowerCase();
  if (/^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || /\.(local|internal|localhost|lan|home|corp|invalid|test)$/.test(h) || !h.includes("."))
    return "Use a public website address (a name like api.example.com, not an IP address or local name).";
  if (url.username || url.password) return "Don't put a username or password in the address.";
  return null;
}

// What developers get about a nakamal in webhooks: public facts only, never the owner.
export function publicNakamal(n: Nakamal) {
  return {
    id: n.id, name: n.name, area: n.area, lat: n.lat, lng: n.lng, status: shownLight(n), light: n.light,
    lightUpdatedAt: n.lightAt ? new Date(n.lightAt).toISOString() : null, note: n.note || null, closeTime: n.closeTime || null,
    url: `${siteUrl()}/n/${encodeURIComponent(n.id)}`,
  };
}

async function sign(secret: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "sha256=" + hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
}
type Hook = { url: string; secret: string; events: string[]; createdAt: number; fails: number; disabled?: boolean; lastStatus?: number; lastAt?: number };
export async function deliver(key: string, h: Hook, event: string, data: unknown) {
  const body = JSON.stringify({ event, at: new Date().toISOString(), data });
  let status = 0;
  try {
    const r = await fetch(h.url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json", "user-agent": "KillimLight-Webhook/1", "x-killim-event": event, "x-killim-signature": await sign(h.secret, body) },
      body,
    });
    status = r.status;
  } catch { status = 0; }
  const ok = status >= 200 && status < 300;
  const fails = ok ? 0 : (h.fails || 0) + 1;
  // Ten failures in a row: switch the hook off so a dead server isn't called forever.
  await store().setJSON(key, { ...h, fails, lastStatus: status, lastAt: Date.now(), disabled: h.disabled || fails >= 10 });
  return status;
}
export async function fireWebhooks(event: string, data: unknown) {
  const hooks = await readAll<Hook>("hook/");
  await Promise.allSettled([...hooks].filter(([, h]) => h && !h.disabled && h.events.includes(event)).map(([k, h]) => deliver("hook/" + k, h, event, data)));
}
