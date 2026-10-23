// GET /n/<id> — a shareable link for one nakamal. Facebook, WhatsApp and Messenger read the preview
// (name, tonight's light, cover photo) from this page; people who tap it go straight to that nakamal on the map.
import type { Config, Context } from "@netlify/functions";
import { readIndex, shownLight, REPORT_MIN } from "../lib/data.mts";

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const WORDS: Record<string, string> = { green: "Kava i redi / Kava ready", amber: "Kava i klosap finis / Low on kava", closed: "I klos / Closed", stale: "No update tede / No update today", reported: "Ol kastoma oli talem se i no stret / Customers report a problem" };

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const id = decodeURIComponent(url.pathname.split("/")[2] || "");
  const idx = await readIndex();
  const n = idx.items.find((x) => x.id === id);
  const target = n ? `/?n=${encodeURIComponent(id)}` : "/";
  if (!n) return Response.redirect(new URL(target, url.origin), 302);
  const shown = shownLight(n, n.reports ? Math.max(n.reports.count, REPORT_MIN) : 0);
  const title = `${n.name}: ${WORDS[shown]}`;
  const desc = [n.area, n.note, n.kavaFrom ? `Kava blong ${n.kavaFrom}` : ""].filter(Boolean).join(" · ") || "Killim Light — live kava lights for nakamals in Vanuatu";
  const img = n.photos[0] ? url.origin + n.photos[0].url : url.origin + "/assets/share-card.png";
  const html = `<!doctype html><html lang="bi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Killim Light">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url.href)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body><p><a href="${esc(target)}">${esc(title)}</a></p><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
  // Short cache so the preview shows a fairly fresh light.
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120", "netlify-cdn-cache-control": "public, s-maxage=120" } });
};

export const config: Config = { path: "/n/*", method: ["GET"] };
