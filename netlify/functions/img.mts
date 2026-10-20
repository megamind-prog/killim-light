// GET /img/photo/<nakamalId>/<photoId>.jpg and /img/avatar/<userId>/<photoId>.jpg — serves uploaded pictures.
import type { Config, Context } from "@netlify/functions";
import { imgStore } from "../lib/data.mts";

export default async (req: Request, context: Context) => {
  const m = new URL(req.url).pathname.match(/^\/img\/(photo|avatar)\/([A-Za-z0-9_-]{1,80})\/(p[a-z0-9]{4,40})\.jpg$/);
  if (!m) return new Response("Not found", { status: 404 });
  const data = await imgStore().get(`${m[1]}/${m[2]}/${m[3]}`, { type: "arrayBuffer" });
  if (!data) return new Response("Not found", { status: 404 });
  // Each picture id is used once, so it can be cached for a year.
  return new Response(data, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
};

export const config: Config = { path: "/img/*", method: ["GET"] };
