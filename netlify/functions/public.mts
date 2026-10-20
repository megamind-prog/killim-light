// GET /api/nakamals — the public list: approved nakamals with their light, prices and rating summary.
import type { Config } from "@netlify/functions";
import { json, readIndex } from "../lib/data.mts";

export default async () => {
  const idx = await readIndex();
  return json({ built: idx.built, settings: idx.settings, items: idx.items });
};

export const config: Config = { path: "/api/nakamals", method: ["GET"] };
