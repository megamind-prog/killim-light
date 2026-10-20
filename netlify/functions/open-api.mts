// Open data API: anyone may use these from their own website or app (CC BY 4.0, credit "Killim Light").
//   GET /api/v1/nakamals           JSON list of approved nakamals with their light right now
//   GET /api/v1/nakamals.geojson   the same as a GeoJSON FeatureCollection (works in Leaflet, Mapbox, Google Maps, QGIS)
//   GET /api/v1/nakamals/<id>      one nakamal
// Query options: ?region=efate|santo|tanna   ?light=green|amber|closed|stale|reported
// Never includes owners' names, phone numbers, emails or accounts.
import type { Config, Context } from "@netlify/functions";
import { readIndex, shownLight, REPORT_MIN } from "../lib/data.mts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" };
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
  };
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url), origin = url.origin;
  const idx = await readIndex();
  let items = idx.items.map((n) => shape(n, origin));
  const region = url.searchParams.get("region"), light = url.searchParams.get("light");
  if (region) items = items.filter((n) => n.region === region);
  if (light) items = items.filter((n) => n.status === light);
  const headers = { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30" };
  const one = url.pathname.match(/^\/api\/v1\/nakamals\/([A-Za-z0-9]+)$/);
  if (one) {
    const n = items.find((x) => x.id === one[1]);
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

export const config: Config = { path: ["/api/v1/nakamals", "/api/v1/nakamals.geojson", "/api/v1/nakamals/*"], method: ["GET", "OPTIONS"] };
