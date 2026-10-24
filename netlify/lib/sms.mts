// Text messages (SMS) through "SMS Gateway for Android" (sms-gate.app, free and open source): an Android phone
// with a local SIM sends the messages, so each one costs only what that SIM pays for a local SMS.
// Set on Netlify: SMS_GATEWAY_USER and SMS_GATEWAY_PASS (shown in the app under Cloud server),
// and optionally SMS_GATEWAY_URL for a private server (default: the public cloud server).
// Without them nothing is sent, and the team hands out PINs on the phone or in person as before.

export const smsConfigured = () => !!(process.env.SMS_GATEWAY_USER && process.env.SMS_GATEWAY_PASS);

// Vanuatu numbers are 7 digits; the gateway wants the international form, e.g. +6785551234.
export function toE164(digits: string) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length === 7) return "+678" + d;
  if (d.startsWith("678") && d.length === 10) return "+" + d;
  return d.length >= 8 ? "+" + d : null;
}

export async function sendSms(phoneDigits: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!smsConfigured()) return { ok: false, error: "Text messages aren't set up." };
  const to = toE164(phoneDigits);
  if (!to) return { ok: false, error: "That phone number doesn't look right." };
  const base = (process.env.SMS_GATEWAY_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/$/, "");
  const auth = "Basic " + btoa(`${process.env.SMS_GATEWAY_USER}:${process.env.SMS_GATEWAY_PASS}`);
  try {
    const r = await fetch(base + "/messages", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ textMessage: { text: text.slice(0, 300) }, phoneNumbers: [to], ttl: 3600 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, error: `The SMS gateway said ${r.status}.` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: "Couldn't reach the SMS gateway." };
  }
}

// 8-digit PINs from a secure random source.
export const newPin = () => String(10000000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90000000));
export const pinText = (pin: string) => `Killim Light: PIN niu blong yu: ${pin}\nYour new PIN: ${pin}\nNo givim long narafala man. Don't share it.`;
