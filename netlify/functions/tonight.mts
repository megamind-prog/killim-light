// GET /tonight — the link the Facebook Page posts and people share. The preview shows how many nakamals
// have kava ready right now; tapping it opens the map filtered to "Kava ready".
import type { Config } from "@netlify/functions";
import { tonightSummary } from "../lib/social.mts";

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default async (req: Request) => {
  const url = new URL(req.url);
  const { count, names } = await tonightSummary();
  const title = count
    ? `🟢 Kava i redi tunaet long ${count} nakamal · Kava ready at ${count} nakamal${count === 1 ? "" : "s"} now`
    : "Killim Light: wanem nakamal i gat kava tunaet? · Where is the kava ready tonight?";
  const desc = count
    ? names.slice(0, 6).join(" · ") + (names.length > 6 ? ` · +${names.length - 6}` : "") + " — live map, prices and directions."
    : "Live kava lights for nakamals in Vanuatu: see who has kava ready, prices and the way there.";
  const target = "/?f=green";
  const html = `<!doctype html><html lang="bi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Killim Light">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(url.origin)}/assets/share-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(url.origin)}/tonight">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${target}">
</head><body><p><a href="${target}">${esc(title)}</a></p></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" } });
};

export const config: Config = { path: "/tonight", method: ["GET"] };
