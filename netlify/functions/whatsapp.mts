// /api/whatsapp — the webhook Meta calls when someone messages the Killim Light WhatsApp number.
// GET:  Meta checks the address once (hub.verify_token must match WA_VERIFY_TOKEN).
// POST: incoming messages. "PIN" from a Vanuatu number that has a Killim Light phone account gets a new PIN:
//       this is how owners reset a forgotten PIN or password. WhatsApp itself proves the number belongs to
//       the sender. Numbers without an account are told how to make one.
//       "VERIFY" verifies every Killim Light account that uses the sender's number (the phone login itself, or
//       the phone the owner gave us), so they can switch lights and claim nakamals. Anything else gets help.
import type { Config } from "@netlify/functions";
import { admin as identityAdmin } from "@netlify/identity";
import { logEvent, phoneDigits, phoneLoginEmail, PHONE_MARK, readAll, setVerified, store, type Contact } from "../lib/data.mts";
import { newPin } from "../lib/sms.mts";
import { sendWa, validSignature, waConfigured } from "../lib/whatsapp.mts";

const SITE = () => (process.env.SITE_URL || process.env.URL || "https://killim-light.netlify.app").replace(/\/$/, "");

async function findByEmail(email: string) {
  for (let page = 1; page <= 50; page++) {
    const users = await identityAdmin.listUsers({ page, perPage: 100 });
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 100) return null;
  }
  return null;
}

async function handle(from: string, text: string) {
  const s = store(), now = Date.now();
  const word = text.trim().toLowerCase();
  const isPin = /^(pin|login|log in|pin niu|niu pin)\b/.test(word), isVerify = /^(verify|verifae|verifaem)\b/.test(word);
  if (!isPin && !isVerify) {
    await sendWa(from, `Killim Light 🟢\nSendem *VERIFY* blong verifaem namba blong yu. Yu fogetem PIN o pasword? Sendem *PIN*.\nSend *VERIFY* to verify your number. Forgot your PIN or password? Send *PIN*.\n${SITE()}/owner`);
    return;
  }
  if (!from.startsWith("678") || from.length !== 10) {
    await sendWa(from, "Killim Light i blong ol namba fon long Vanuatu nomo (+678).\nKillim Light logins are for Vanuatu phone numbers (+678) only.");
    return;
  }
  const phone = from.slice(3);
  if (isVerify) {
    // Every account using this number: the phone login, and accounts whose owner gave this phone number.
    const ids = new Set<string>();
    const login = await findByEmail(phoneLoginEmail(phone));
    if (login && (login.appMetadata as any)?.killim_phone === true) ids.add(login.id);
    for (const [uid, c] of await readAll<Contact>("contact/")) if (c && phoneDigits(c.phone) === phone) ids.add(uid);
    if (!ids.size) {
      await sendWa(from, `Killim Light: i no gat akaon wetem namba ia. Mekem wan long ${SITE()}/owner, o jekem namba fon long akaon blong yu.\nNo account uses this number. Make one at ${SITE()}/owner, or check the phone number on your account.`);
      return;
    }
    for (const uid of ids) await setVerified(uid, "whatsapp");
    await sendWa(from, `Killim Light ✓ Namba blong yu i verifae finis. Naoia yu save jenisim laet mo klemem nakamal blong yu.\nYour number is verified. You can now switch your light and claim your nakamal.\n${SITE()}/owner`);
    await logEvent(null, "owner", "verifyAccount", { detail: phone + " verified by WhatsApp", who: "☎ " + phone });
    return;
  }
  // Same limits as the SMS reset: one PIN every 15 minutes, three a day, per number.
  const key = "pinreset/" + phone;
  const tries = (((await s.get(key, { type: "json" })) as number[] | null) || []).filter((t) => now - t < 864e5);
  if (tries.length >= 3 || (tries.length && now - tries[tries.length - 1] < 15 * 60e3)) {
    await sendWa(from, "Killim Light: yu askem PIN klosap finis. Traem bakegen afta 15 minit.\nYou asked for a PIN a moment ago. Please try again in 15 minutes.");
    return;
  }
  const email = phoneLoginEmail(phone);
  const user = await findByEmail(email);
  if (!user || (user.appMetadata as any)?.killim_phone !== true) {
    await sendWa(from, `Killim Light: i no gat akaon wetem namba ia. Mekem wan long ${SITE()}/owner → "Mekem akaon".\nThere's no account with this number. Make one at ${SITE()}/owner → "Create account".`);
    return;
  }
  await s.setJSON(key, [...tries, now]);
  // Send first, change the PIN only if the message went: a failed message never locks the owner out.
  const pin = newPin();
  const sent = await sendWa(from, `Killim Light ✓ PIN niu / New PIN\nNamba fon / Phone: ${phone}\nPIN: ${pin}\n\nLogin long / Log in at ${SITE()}/owner\nNo givim PIN long narafala man. Don't share it.\nYu no askem? Yu save lego mesej ia. Didn't ask? You can ignore this, but use the new PIN next time.`);
  if (sent.ok) await identityAdmin.updateUser(user.id, { password: pin, app_metadata: { ...(user.appMetadata || {}), ...PHONE_MARK } });
  await logEvent(null, "owner", "pinReset", { detail: phone + " · by WhatsApp" + (sent.ok ? "" : " · reply failed: " + sent.error), who: "☎ " + phone });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && process.env.WA_VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Forbidden", { status: 403 });
  }
  if (!waConfigured()) return new Response("Not set up", { status: 503 });
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  // Never answer the same message twice (Meta retries when we're slow).
  for (const entry of body?.entry || []) for (const change of entry?.changes || []) {
    const v = change?.value || {};
    for (const m of v.messages || []) {
      if (m?.type !== "text" || !m?.from || !m?.id) continue;
      const seen = "wa-seen/" + String(m.id).replace(/[^\w.-]/g, "").slice(0, 120);
      if (await store().get(seen)) continue;
      await store().set(seen, "1");
      const from = String(m.from).replace(/\D/g, "");
      await handle(from, String(m?.text?.body || ""));
    }
  }
  return new Response("ok");
};

export const config: Config = { path: "/api/whatsapp", method: ["GET", "POST"] };
