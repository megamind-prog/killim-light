// The embeddable map (/embed) is the one page other websites are allowed to show in a frame.
// Every other page gets "never in a frame" (X-Frame-Options: DENY, frame-ancestors 'none') from the /* rule in
// netlify.toml. Netlify has no "every page except /embed" rule, so this edge function sets the embed page's
// own headers instead. Everything else stays as strict as the rest of the site.
// No imports on purpose: nothing to install or bundle.

const EMBED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://tiles.maps.eox.at https://ibasemaps-api.arcgis.com",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors *",
  "upgrade-insecure-requests",
].join("; ");

export default async (_req: Request, context: { next: () => Promise<Response> }) => {
  const res = await context.next();
  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", EMBED_CSP);
  headers.delete("X-Frame-Options");
  // Other websites frame this page, so it must not be locked to our own origin.
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

export const config = { path: ["/embed", "/embed.html"] };
