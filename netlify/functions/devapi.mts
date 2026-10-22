// Developer keys and webhooks (all free):
//   POST   /api/v1/keys                  { name, email, use }        -> { key }  (shown once; we only keep a fingerprint)
//   GET    /api/v1/keys/me               x-api-key                   -> name, usage for 30 days, webhooks
//   POST   /api/v1/webhooks              x-api-key { url, events }   -> { id, secret }  (secret signs every delivery)
//   DELETE /api/v1/webhooks/<id>         x-api-key
//   POST   /api/v1/webhooks/<id>/test    x-api-key                   -> sends a test delivery now
import type { Config } from "@netlify/functions";
import { clean, readAll, store } from "../lib/data.mts";
import { deliver, HOOK_EVENTS, hookUrlProblem, keyOf, KEY_HEADER, MAX_HOOKS, newSecret, sha256, siteUrl, usageOf } from "../lib/dev.mts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "content-type, " + KEY_HEADER };
const out = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
const err = (error: string, status = 400) => out({ error }, status);

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const s = store();

  if (path === "/api/v1/keys" && req.method === "POST") {
    let b: any; try { b = await req.json(); } catch { return err("Send JSON."); }
    const name = clean(b?.name, 60), email = clean(b?.email, 120), use = clean(b?.use, 200);
    if (name.length < 2) return err("Tell us your app or website name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter an email so we can tell you about changes.");
    const key = "kl_" + newSecret(20);
    await s.setJSON("apikey/" + (await sha256(key)), { name, email, use, createdAt: Date.now() });
    return out({ key, note: "Keep this key safe: it is shown only once. Send it in the x-api-key header." }, 201);
  }

  const k = await keyOf(req);
  if (!k || k === "bad") return err("Send your API key in the x-api-key header.", 401);
  const hookPrefix = `hook/${k.hash}/`;

  if (path === "/api/v1/keys/me" && req.method === "GET") {
    const hooks = await readAll<any>(hookPrefix);
    return out({
      name: k.key.name, createdAt: new Date(k.key.createdAt).toISOString(), usage: await usageOf(k.hash, 30),
      webhooks: [...hooks].map(([id, h]) => ({ id, url: h.url, events: h.events, disabled: !!h.disabled, fails: h.fails || 0, lastStatus: h.lastStatus ?? null, lastAt: h.lastAt ? new Date(h.lastAt).toISOString() : null })),
    });
  }

  if (path === "/api/v1/webhooks" && req.method === "POST") {
    let b: any; try { b = await req.json(); } catch { return err("Send JSON."); }
    const url = clean(b?.url, 300), problem = hookUrlProblem(url);
    if (problem) return err(problem);
    const events = (Array.isArray(b?.events) ? b.events : HOOK_EVENTS).filter((e: string) => HOOK_EVENTS.includes(e));
    if (!events.length) return err("Choose events: " + HOOK_EVENTS.join(", "));
    const have = await s.list({ prefix: hookPrefix });
    if (have.blobs.length >= MAX_HOOKS) return err(`Up to ${MAX_HOOKS} webhooks per key. Delete one first.`);
    const id = newSecret(6), secret = newSecret(24);
    await s.setJSON(hookPrefix + id, { url, secret, events, createdAt: Date.now(), fails: 0 });
    return out({ id, secret, events, note: "Check the x-killim-signature header: HMAC-SHA256 of the body with this secret." }, 201);
  }

  const m = path.match(/^\/api\/v1\/webhooks\/([a-f0-9]{12})(\/test)?$/);
  if (m) {
    const key = hookPrefix + m[1];
    const h = (await s.get(key, { type: "json" })) as any;
    if (!h) return err("Unknown webhook.", 404);
    if (req.method === "DELETE" && !m[2]) { await s.delete(key); return out({ ok: true }); }
    if (req.method === "POST" && m[2]) {
      const status = await deliver(key, { ...h, disabled: false }, "test", { message: "Hello from Killim Light", site: siteUrl() });
      return out({ ok: status >= 200 && status < 300, status });
    }
  }
  return err("Unknown request.", 404);
};

export const config: Config = {
  path: ["/api/v1/keys", "/api/v1/keys/*", "/api/v1/webhooks", "/api/v1/webhooks/*"], method: ["GET", "POST", "DELETE", "OPTIONS"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 20 },
};
