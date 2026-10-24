// POST /api/pinreset { phone } — an owner who forgot their PIN gets a new one by text message.
// The answer is always the same, so nobody can find out which numbers have a login.
// Limits: one new PIN per number every 15 minutes, three a day; and a limit per network address.
import type { Config, Context } from "@netlify/functions";
import { admin as identityAdmin } from "@netlify/identity";
import { bad, foreignOrigin, json, logEvent, phoneDigits, phoneLoginEmail, PHONE_MARK, store } from "../lib/data.mts";
import { newPin, pinText, sendSms, smsConfigured } from "../lib/sms.mts";

const SAME = { ok: true, message: "If this number has a Killim Light login, a new PIN is on its way by text message." };

async function findByEmail(email: string) {
  for (let page = 1; page <= 50; page++) {
    const users = await identityAdmin.listUsers({ page, perPage: 100 });
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 100) return null;
  }
  return null;
}

export default async (req: Request, context?: Context) => {
  if (foreignOrigin(req)) return bad("Not allowed from another website.", 403);
  if (!smsConfigured()) return json({ ok: false, noSms: true }, 200);
  let body: any; try { body = await req.json(); } catch { return bad("Send a phone number."); }
  const phone = phoneDigits(body?.phone);
  if (phone.length < 7) return bad("Type your phone number.");
  const s = store(), now = Date.now();
  // Limits per number and per network address.
  const ip = (context as any)?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const key = "pinreset/" + phone, ipKey = "pinreset-ip/" + ip.replace(/[^\w.:-]/g, "");
  const tries = (((await s.get(key, { type: "json" })) as number[] | null) || []).filter((t) => now - t < 864e5);
  const ipTries = (((await s.get(ipKey, { type: "json" })) as number[] | null) || []).filter((t) => now - t < 3600e3);
  if (ipTries.length >= 5) return json(SAME);
  await s.setJSON(ipKey, [...ipTries, now]);
  if (tries.length >= 3 || (tries.length && now - tries[tries.length - 1] < 15 * 60e3)) return json(SAME);
  const user = await findByEmail(phoneLoginEmail(phone));
  // Only phone logins made by the team (marked in app_metadata, which users can't change).
  if (!user || (user.appMetadata as any)?.killim_phone !== true) return json(SAME);
  await s.setJSON(key, [...tries, now]);
  // Send first, change the PIN only if the message went: a failed text never locks the owner out.
  const pin = newPin();
  const sent = await sendSms(phone, pinText(pin));
  if (sent.ok) await identityAdmin.updateUser(user.id, { password: pin, app_metadata: { ...(user.appMetadata || {}), ...PHONE_MARK } });
  await logEvent(null, "owner", "pinReset", { detail: phone + (sent.ok ? " · new PIN sent by SMS" : " · SMS failed: " + sent.error), who: "☎ " + phone });
  return json(SAME);
};

export const config: Config = { path: "/api/pinreset", method: ["POST"] };
