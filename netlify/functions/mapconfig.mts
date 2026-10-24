// GET /api/mapconfig — public settings the pages need in the browser. The Esri key (ESRI_API_KEY) is a public
// browser key: restrict it to this site's addresses in the ArcGIS settings so nobody else can use it.
// waNumber: the Killim Light WhatsApp number owners message to get their PIN (only when WhatsApp is set up).
import type { Config } from "@netlify/functions";
import { waConfigured, waNumber } from "../lib/whatsapp.mts";

export default async () =>
  new Response(JSON.stringify({ esriKey: process.env.ESRI_API_KEY || null, waNumber: waConfigured() ? waNumber() : null }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=600", "netlify-cdn-cache-control": "public, s-maxage=600" },
  });

export const config: Config = { path: "/api/mapconfig", method: ["GET"] };
