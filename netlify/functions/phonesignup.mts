// POST /api/phonesignup { name, phone, pin } — an owner makes their own account with a phone number and a PIN
// they choose: no email needed. If someone else already took their number, the real owner gets it back with
// "I forgot my PIN" on WhatsApp, which only answers the number's own WhatsApp.
import type { Config, Context } from "@netlify/functions";
import { admin as identityAdmin } from "@netlify/identity";
import { bad, clean, foreignOrigin, json, logEvent, phoneDigits, phoneLoginEmail, PHONE_MARK, store } from "../lib/data.mts";

// 6 to 8 numbers, and not an easy one to guess.
function pinProblem(pin: string) {
  if (!/^\d{6,8}$/.test(pin)) return "The PIN must be 6 to 8 numbers.";
  if (/^(\d)\1+$/.test(pin)) return "Choose a PIN that isn't the same number repeated.";
  const up = "0123456789012", down = "9876543210987";
  if (up.includes(pin) || down.includes(pin)) return "Choose a PIN that isn't counting up or down (like 123456).";
  return null;
}

async function exists(email: string) {
  for (let page = 1; page <= 50; page++) {
    const users = await identityAdmin.listUsers({ page, perPage: 100 });
    if (users.some((u) => (u.email || "").toLowerCase() === email)) return true;
    if (users.length < 100) return false;
  }
  return false;
}

export default async (req: Request, context?: Context) => {
  if (foreignOrigin(req)) return bad("Not allowed from another website.", 403);
  let body: any; try { body = await req.json(); } catch { return bad("Fill in the form."); }
  const name = clean(body?.name, 80), phone = phoneDigits(body?.phone), pin = String(body?.pin ?? "").trim();
  if (name.length < 2) return bad("Type your name.");
  if (phone.length !== 7) return bad("Type your Vanuatu phone number (7 numbers).");
  const problem = pinProblem(pin);
  if (problem) return bad(problem);
  // At most 5 new accounts an hour from one network address.
  const s = store(), now = Date.now();
  const ip = String((context as any)?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown").replace(/[^\w.:-]/g, "");
  const tries = (((await s.get("signup-ip/" + ip, { type: "json" })) as number[] | null) || []).filter((t) => now - t < 3600e3);
  if (tries.length >= 5) return bad("Too many new accounts from here. Please try again in an hour.", 429);
  const email = phoneLoginEmail(phone);
  if (await exists(email)) return bad("This phone number already has an account. Log in, or tap “I forgot my PIN or password”.", 409);
  await s.setJSON("signup-ip/" + ip, [...tries, now]);
  const created = await identityAdmin.createUser({ email, password: pin, data: { user_metadata: { full_name: name, phone, via: "self" }, app_metadata: { ...PHONE_MARK } } });
  await s.setJSON("contact/" + created.id, { owner: name, phone, at: now });
  await logEvent(null, "owner", "phoneSignup", { detail: phone + " (" + name + ")", who: "☎ " + phone });
  return json({ ok: true });
};

export const config: Config = { path: "/api/phonesignup", method: ["POST"] };
