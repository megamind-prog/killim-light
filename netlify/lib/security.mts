// Security headers for function responses.
// The [[headers]] rules in netlify.toml only reach static files, never what a function returns,
// so every sensitive API adds its own headers here.

// Private answers (owner data, logins, PIN resets): never cached, never leak the page address.
export const PRIVATE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};
// Public answers that keep their own cache rules (e.g. /api/nakamals).
export const PUBLIC_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function withHeaders(res: Response, extra: Record<string, string>): Response {
  try {
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
    return res;
  } catch {
    // Some responses have locked headers: copy them into a new response.
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(extra)) h.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
}

// Wrap a function handler so every answer it gives (errors included) carries the headers.
export const secured = <A extends unknown[]>(handler: (req: Request, ...rest: A) => Promise<Response>, extra = PRIVATE_HEADERS) =>
  async (req: Request, ...rest: A): Promise<Response> => {
    let res: Response;
    try { res = await handler(req, ...rest); }
    catch (e) {
      console.error(e);
      res = new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), { status: 500, headers: { "content-type": "application/json" } });
    }
    return withHeaders(res, extra);
  };
