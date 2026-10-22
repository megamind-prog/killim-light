// Open data API: anyone may use these from their own website or app (CC BY 4.0, credit "Killim Light").
//   GET /api/v1/nakamals           JSON list of approved nakamals with their light right now
//   GET /api/v1/nakamals.geojson   the same as a GeoJSON FeatureCollection (works in Leaflet, Mapbox, Google Maps, QGIS)
//   GET /api/v1/nakamals/<id>      one nakamal
//   GET /api/v1/nakamals/<id>/history?days=30   every light change, newest day first
// Optional free key (header x-api-key) for usage stats and webhooks; see /api/v1/keys.
// Query options: ?region=efate|santo|tanna   ?light=green|amber|closed|stale|reported
// Never includes owners' names, phone numbers, emails or accounts.
import type { Config, Context } from "@netlify/functions";
import { readAll, readIndex, shownLight, vuDate, REPORT_MIN } from "../lib/data.mts";
import { countUse, keyOf, KEY_HEADER } from "../lib/dev.mts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type, " + KEY_HEADER };
const LICENSE = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", attribution: "Nakamal data: Killim Light (killimlightvanuatu.com)" };

function shape(n: any, origin: string) {
  const shown = shownLight(n, n.reports ? Math.max(n.reports.count, REPORT_MIN) : 0);
  return {
    id: n.id, name: n.name, area: n.area, region: n.region, lat: n.lat, lng: n.lng,
    status: shown,                                 // green | amber | closed | stale | reported
    light: n.light, lightUpdatedAt: n.lightAt ? new Date(n.lightAt).toISOString() : null,
    closeTime: n.closeTime || null, note: n.note || null, hours: n.hours || null, about: n.about || null,
    kava: { from: n.kavaFrom || null, strength: n.strength || null },
    prices: n.prices, rating: { average: n.rating.avg, count: n.rating.count },
    photos: n.photos.map((p: any) => origin + p.url), url: `${origin}/n/${encodeURIComponent(n.id)}`,
    claimed: n.claimed !== false,
    schedule: n.schedule ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day, i) => n.schedule[i] ? { day, on: n.schedule[i].on, off: n.schedule[i].off } : { day, on: null, off: null }) : null,
    specials: (n.specials || []).map((sp: any) => ({ kind: sp.kind, title: sp.title, text: sp.text || null, date: sp.date, from: sp.from || null, to: sp.to || null })),
  };
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url), origin = url.origin;
  const key = await keyOf(req);
  if (key === "bad") return new Response(JSON.stringify({ error: "Unknown or revoked API key." }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  if (key) context?.waitUntil ? context.waitUntil(countUse(key.hash)) : await countUse(key.hash);
  const hist = url.pathname.match(/^\/api\/v1\/nakamals\/([^/]+)\/history$/);
  if (hist) {
    const idx0 = await readIndex();
    let id = hist[1]; try { id = decodeURIComponent(id); } catch {}
    const n = idx0.items.find((x: any) => x.id === id);
    if (!n) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });
    const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "30", 10) || 30));
    const from = vuDate(Date.now() - (days - 1) * 864e5);
    const all = await readAll<[number, string][]>(`history/${id}/`);
    const out = [...all].filter(([d]) => d >= from).sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, ch]) => ({ day, changes: ch.map(([at, light]) => ({ at: new Date(at).toISOString(), light })) }));
    return new Response(JSON.stringify({ license: LICENSE, id, days, history: out }), { headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
  }
  const idx = await readIndex();
  let items = idx.items.map((n) => shape(n, origin));
  const region = url.searchParams.get("region"), light = url.searchParams.get("light");
  if (region) items = items.filter((n) => n.region === region);
  if (light) items = items.filter((n) => n.status === light);
  const headers = { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30" };
  const one = url.pathname.match(/^\/api\/v1\/nakamals\/([^/]+)$/);
  if (one) {
    let want = one[1]; try { want = decodeURIComponent(want); } catch {}
    const n = items.find((x) => x.id === want);
    return new Response(JSON.stringify(n ? { license: LICENSE, nakamal: n } : { error: "Not found" }), { status: n ? 200 : 404, headers });
  }
  if (url.pathname.endsWith(".geojson")) {
    const fc = {
      type: "FeatureCollection", license: LICENSE, updated: new Date(idx.built).toISOString(),
      features: items.map((n) => ({ type: "Feature", id: n.id, geometry: { type: "Point", coordinates: [n.lng, n.lat] }, properties: { ...n, lat: undefined, lng: undefined } })),
    };
    return new Response(JSON.stringify(fc), { headers: { ...headers, "content-type": "application/geo+json; charset=utf-8" } });
  }
  return new Response(JSON.stringify({ license: LICENSE, updated: new Date(idx.built).toISOString(), count: items.length, nakamals: items }), { headers });
};

export const config: Config = { path: ["/api/v1/nakamals", "/api/v1/nakamals.geojson", "/api/v1/nakamals/*"], method: ["GET", "OPTIONS"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 120 } };
