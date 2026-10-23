// GET /api/mapconfig — settings the map needs in the browser. The Esri key (ESRI_API_KEY) is a public
// browser key: restrict it to this site's addresses in the ArcGIS settings so nobody else can use it.
import type { Config } from "@netlify/functions";

export default async () =>
  new Response(JSON.stringify({ esriKey: process.env.ESRI_API_KEY || null }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=600", "netlify-cdn-cache-control": "public, s-maxage=600" },
  });

export const config: Config = { path: "/api/mapconfig", method: ["GET"] };
