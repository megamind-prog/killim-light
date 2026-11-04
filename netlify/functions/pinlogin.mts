// POST /api/pinlogin { phone, pin } — log in with a phone number + PIN.
// 5 wrong PINs for one number lock that number for 15 minutes (counted in Netlify Database).
// On success the login cookies are set on this response; the page then calls KLAuth.hydrateSession().
// The answer is the same for "no such number" and "wrong PIN", so this can't be used to find out who has a login.
import type { Config } from "@netlify/functions";
import { admin as identityAdmin, login } from "@netlify/identity";
import { bad, foreignOrigin, json, phoneDigits, phoneLoginEmail } from "../lib/data.mts";
import { clearWrongPins, lockedMinutes, LOCK_MINUTES, pepperSet, phonePassword, recordWrongPin } from "../lib/pin.mts";
import { secured } from "../lib/security.mts";

const WRONG = "Wrong phone number or PIN.";
const locked = (mins: number) => bad(`Too many wrong PINs. This number is locked for ${mins} minute${mins === 1 ? "" : "s"}. Try again later, or get a new PIN.`, 429);

async function tryLogin(email: string, password: string) {
  try { return await login(email, password); }
  catch (e: any) {
    const status = Number(e?.status) || 0;
    // 400/401/422 = wrong details. Anything else means the login service itself had a problem.
    if (status && status < 500 && status !== 429) return null;
    throw e;
  }
}

export default secured(async (req: Request) => {
  if (foreignOrigin(req)) return bad("Not allowed from another website.", 403);
  let body: any; try { body = await req.json(); } catch { return bad("Send a phone number and PIN."); }
  const phone = phoneDigits(body?.phone), pin = String(body?.pin ?? "").trim();
  if (phone.length < 5 || phone.length > 15) return bad("Type your phone number.");
  if (!/^\d{4,12}$/.test(pin)) return bad(WRONG, 401);

  // Without the database the wrong-PIN lock can't work, so PIN logins stop rather than allow unlimited guesses.
  let mins: number;
  try { mins = await lockedMinutes(phone); }
  catch (e) { console.error("pinlogin: database unavailable", e); return bad("PIN login is not available right now. Please try again soon.", 503); }
  if (mins) return locked(mins);

  const email = phoneLoginEmail(phone);
  const hashed = await phonePassword(phone, pin);
  let user = await tryLogin(email, hashed);
  // Accounts made before PIN_PEPPER was set still have the plain PIN: accept it once and move them over.
  if (!user && pepperSet() && hashed !== pin) {
    user = await tryLogin(email, pin);
    if (user) {
      try { await identityAdmin.updateUser(user.id, { password: hashed }); }
      catch (e) { console.error("pinlogin: couldn't upgrade stored PIN", e); }
    }
  }
  if (!user) {
    const nowLocked = await recordWrongPin(phone);
    return nowLocked ? locked(LOCK_MINUTES) : bad(WRONG, 401);
  }
  await clearWrongPins(phone);
  return json({ ok: true });
});

export const config: Config = {
  path: "/api/pinlogin", method: ["POST"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 10 },
};
