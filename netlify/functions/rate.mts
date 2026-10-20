// POST /api/rate — anyone can rate an approved nakamal, one rating per phone (device id), no account needed.
// Body: { id, device, stars (1-5) | null to remove, text }
import type { Config } from "@netlify/functions";
import { bad, clean, getStatus, json, rebuildIndex, store } from "../lib/data.mts";

export default async (req: Request) => {
  let body: any;
  try { body = await req.json(); } catch { return bad("Send JSON."); }
  const id = clean(body?.id, 60), device = clean(body?.device, 60);
  if (!/^[a-z0-9]{3,60}$/i.test(id)) return bad("Unknown nakamal.");
  if (!/^[a-z0-9-]{16,60}$/i.test(device)) return bad("Missing device id.");
  const st = await getStatus(id);
  if (!st.approved) return bad("This nakamal isn't on the map.", 404);
  const key = `rating/${id}/${device}`;
  if (body?.stars === null) {
    await store().delete(key);
  } else {
    const stars = Math.round(Number(body?.stars));
    if (!(stars >= 1 && stars <= 5)) return bad("Choose 1 to 5 stars.");
    await store().setJSON(key, { stars, text: clean(body?.text, 280), at: Date.now() });
  }
  const idx = await rebuildIndex();
  return json({ ok: true, item: idx.items.find((n) => n.id === id) || null });
};

// Slow down anyone trying to flood ratings from one connection.
export const config: Config = {
  path: "/api/rate", method: ["POST"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 15 },
};
