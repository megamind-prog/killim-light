// POST /api/upload?kind=photo&id=<nakamalId>   — add a photo to one of the owner's nakamals (up to 6)
// POST /api/upload?kind=avatar                  — set the owner's profile picture
// The phone resizes the picture to a JPEG before sending it, so uploads stay small on mobile data.
import type { Config } from "@netlify/functions";
import {
  MAX_PHOTOS, avatarUrl, bad, currentUser, deleteImages, getNak, getStatus, imgStore, json, photoUrl,
  rebuildIndex, logEvent, store, type Photo, type Profile,
} from "../lib/data.mts";

const MAX_BYTES = 3 * 1024 * 1024;

export default async (req: Request) => {
  const user = await currentUser();
  if (!user) return bad("Please log in.", 401);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return bad("No picture received.");
  if (buf.length > MAX_BYTES) return bad("That picture is too big. Try a smaller one.", 413);
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return bad("Send the picture as a JPEG.");
  const w = Math.max(1, Math.min(4000, Number(req.headers.get("x-width")) || 1));
  const h = Math.max(1, Math.min(4000, Number(req.headers.get("x-height")) || 1));
  const photo: Photo = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), w, h, at: Date.now() };
  const s = store(), imgs = imgStore();

  if (kind === "avatar") {
    await deleteImages(`avatar/${user.id}/`);
    await imgs.set(`avatar/${user.id}/${photo.id}`, buf.buffer as ArrayBuffer, { metadata: { type: "image/jpeg" } });
    const prev = ((await s.get("profile/" + user.id, { type: "json" })) as Profile | null) || { name: user.name || "", avatar: null, updatedAt: 0 };
    await s.setJSON("profile/" + user.id, { ...prev, avatar: photo, updatedAt: Date.now() });
    await rebuildIndex();
    return json({ ok: true, avatar: avatarUrl(user.id, photo) });
  }

  if (kind === "photo") {
    const id = String(url.searchParams.get("id") || "");
    const nak = id ? await getNak(id) : null;
    if (!nak || nak.owner !== user.id) return bad("That nakamal isn't yours.", 403);
    const photos = nak.photos || [];
    if (photos.length >= MAX_PHOTOS) return bad(`You can show up to ${MAX_PHOTOS} photos. Remove one first.`);
    await imgs.set(`photo/${id}/${photo.id}`, buf.buffer as ArrayBuffer, { metadata: { type: "image/jpeg" } });
    await s.setJSON("nak/" + id, { ...nak, photos: [...photos, photo], updatedAt: Date.now() });
    if ((await getStatus(id)).approved) await rebuildIndex();
    await logEvent(user, "owner", "addPhoto", { id, name: nak.name });
    return json({ ok: true, photo: { id: photo.id, url: photoUrl(id, photo) } });
  }

  return bad("Unknown upload.");
};

export const config: Config = {
  path: "/api/upload", method: ["POST"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 30 },
};
