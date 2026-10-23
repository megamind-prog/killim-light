// GET /api/nakamals — the public list: approved nakamals with their light, prices and rating summary.
import type { Config } from "@netlify/functions";
import { json, readIndex } from "../lib/data.mts";

export default async () => {
  const idx = await readIndex();
  // Netlify's edge keeps this for 30 seconds, so most visitors are served without running this function.
  // Browsers always ask again (the map refreshes every minute and must show fresh lights).
  return json({ built: idx.built, settings: idx.settings, items: idx.items }, 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=60",
  });
};

export const config: Config = { path: "/api/nakamals", method: ["GET"] };
