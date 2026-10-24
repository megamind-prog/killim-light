// WhatsApp for owners, through Meta's official WhatsApp Business Platform (Cloud API).
// The owner sends "PIN" to the Killim Light WhatsApp number; we reply with their phone + PIN login.
// Replies to a message the owner sent first are "service messages", which Meta doesn't charge for.
// Set on Netlify: WA_TOKEN (permanent access token), WA_PHONE_ID (the number's Phone number ID),
// WA_NUMBER (the number people message, digits only, e.g. 6785551234), WA_VERIFY_TOKEN (any secret
// word, also typed into Meta's webhook settings) and WA_APP_SECRET (the Meta app secret, to check
// that webhook calls really come from Meta).
export const waConfigured = () => !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID && process.env.WA_APP_SECRET);
export const waNumber = () => (process.env.WA_NUMBER || "").replace(/\D/g, "") || null;

// Meta signs every webhook call with the app secret: X-Hub-Signature-256: sha256=<hex HMAC of the raw body>.
export async function validSignature(raw: string, header: string | null) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const want = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export async function sendWa(toDigits: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!waConfigured()) return { ok: false, error: "WhatsApp isn't set up." };
  const ver = process.env.FB_GRAPH_VERSION || "v23.0";
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${encodeURIComponent(process.env.WA_PHONE_ID!)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + process.env.WA_TOKEN },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: text.slice(0, 1000) } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { const d: any = await r.json().catch(() => ({})); return { ok: false, error: String(d?.error?.message || r.status).slice(0, 200) }; }
    return { ok: true };
  } catch { return { ok: false, error: "Couldn't reach WhatsApp." }; }
}
