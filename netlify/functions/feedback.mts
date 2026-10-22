// Public, no account needed:
//   POST /api/report  { id, device, kind: closed | nokava | open | location }  — "the light is wrong"
//   POST /api/view    { id, device }                                           — counts a page view for the owner's stats
//   GET  /api/push                                                             — the public key phones need to subscribe to alerts
//   POST /api/push    { action: sub | unsub, id, subscription, lang }         — alert me when this nakamal turns green
//   POST /api/push    { action: area-sub | area-unsub, subscription, lat, lng, km, lang } — alert me when any nakamal near me turns green
//                     (the place is rounded to about 1 km before it is stored)
import type { Config, Context } from "@netlify/functions";
import { bad, clean, getStatus, inVanuatu, json, rebuildIndex, store, vuDate } from "../lib/data.mts";
import { pushKey } from "../lib/push.mts";

const KINDS = ["closed", "nokava", "open", "location"];
const subId = async (endpoint: string) => {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return [...h.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname;
  if (path === "/api/push" && req.method === "GET") return json({ key: pushKey() });

  let body: any;
  try { body = await req.json(); } catch { return bad("Send JSON."); }
  if (path === "/api/push" && (body?.action === "area-sub" || body?.action === "area-unsub")) {
    const sub = body?.subscription;
    if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint)) return bad("Missing subscription.");
    const key = `area/${await subId(sub.endpoint)}`;
    if (body.action === "area-unsub") { await store().delete(key); return json({ ok: true }); }
    const lat = Math.round(Number(body?.lat) * 100) / 100, lng = Math.round(Number(body?.lng) * 100) / 100;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inVanuatu(lat, lng)) return bad("Choose a place in Vanuatu.");
    const km = [1, 3, 10].includes(Number(body?.km)) ? Number(body.km) : 3;
    await store().setJSON(key, { sub: { endpoint: sub.endpoint, keys: sub.keys }, lat, lng, km, lang: body?.lang === "en" ? "en" : "bi", at: Date.now() });
    return json({ ok: true, lat, lng, km });
  }
  const id = clean(body?.id, 60), device = clean(body?.device, 60);
  if (!/^[a-z0-9]{3,60}$/i.test(id)) return bad("Unknown nakamal.");
  if (!(await getStatus(id)).approved) return bad("This nakamal isn't on the map.", 404);
  const s = store();

  if (path === "/api/report") {
    if (!/^[a-z0-9-]{16,60}$/i.test(device)) return bad("Missing device id.");
    if (!KINDS.includes(body?.kind)) return bad("Choose what's wrong.");
    await s.setJSON(`report/${id}/${device}`, { kind: body.kind, at: Date.now() });
    await rebuildIndex();
    return json({ ok: true });
  }

  if (path === "/api/view") {
    // Rough count, good enough for "people who looked this week".
    const key = `views/${id}/${vuDate()}`;
    const cur = ((await s.get(key, { type: "json" })) as { count: number } | null) || { count: 0 };
    await s.setJSON(key, { count: cur.count + 1 });
    return json({ ok: true });
  }

  if (path === "/api/push") {
    const sub = body?.subscription;
    if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint)) return bad("Missing subscription.");
    const key = `push/${id}/${await subId(sub.endpoint)}`;
    if (body?.action === "unsub") await s.delete(key);
    else await s.setJSON(key, { sub: { endpoint: sub.endpoint, keys: sub.keys }, lang: body?.lang === "en" ? "en" : "bi", at: Date.now() });
    return json({ ok: true });
  }
  return bad("Unknown request.", 404);
};

export const config: Config = {
  path: ["/api/report", "/api/view", "/api/push"], method: ["GET", "POST"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 40 },
};
