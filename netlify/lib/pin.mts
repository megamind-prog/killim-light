// PIN logins for owners without email (phone number + PIN).
//
// Rules:
//  - a PIN is 6 to 8 numbers and not an easy one to guess (pinProblem);
//  - 5 wrong PINs for one phone number lock that number for 15 minutes (counter in Netlify Database, not Blobs,
//    because Blobs have no atomic counter and parallel guesses would be lost);
//  - phone logins sign in through /api/pinlogin, which enforces the lock.
//
// Why the lock can't be skipped: when PIN_PEPPER is set, the password stored in Netlify Identity is not the PIN
// itself but HMAC(PIN_PEPPER, phone:PIN). Someone calling Identity's own login address directly with a guessed PIN
// gets nothing; only /api/pinlogin (which knows the secret and counts wrong PINs) can turn a PIN into a login.
// Older accounts that still have the plain PIN as password are moved to the new form the first time they log in.
import { getDatabase } from "@netlify/database";

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;

// ---------- choosing a PIN ----------
const COMMON = new Set([
  "121212", "112233", "123123", "123321", "111222", "159753", "147258", "789456", "696969", "102030",
  "131313", "101010", "202020", "007007", "520520", "147852", "258369", "741852", "963852", "456789",
  "12341234", "11223344", "12121212", "11112222", "87654321", "12344321",
]);
export function pinProblem(pin: string, phone = ""): string | null {
  if (!/^\d{6,8}$/.test(pin)) return "The PIN must be 6 to 8 numbers.";
  if (/^(\d)\1+$/.test(pin)) return "Choose a PIN that isn't the same number repeated (like 000000).";
  const up = "0123456789012", down = "9876543210987";
  if (up.includes(pin) || down.includes(pin)) return "Choose a PIN that isn't counting up or down (like 123456).";
  if (/^(\d\d)\1+$/.test(pin) || /^(\d{3})\1$/.test(pin) || /^(\d{4})\1$/.test(pin) || COMMON.has(pin)) return "That PIN is too easy to guess. Choose another one.";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length >= 6 && (digits.includes(pin) || pin.includes(digits))) return "Don't use your phone number as your PIN.";
  return null;
}

// 8-digit PINs from a secure random source, never an easy one.
export function newPin(): string {
  for (;;) {
    const pin = String(10000000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90000000));
    if (!pinProblem(pin)) return pin;
  }
}

// ---------- the password Identity stores for a phone login ----------
const pepper = () => (globalThis as any).Netlify?.env?.get?.("PIN_PEPPER") || process.env.PIN_PEPPER || "";
export const pepperSet = () => pepper().length >= 16;

export async function phonePassword(phone: string, pin: string): Promise<string> {
  const secret = pepper();
  if (secret.length < 16) return pin; // not set up yet: plain PIN, as before
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${phone}:${pin}`)));
  return "kl1." + btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- wrong-PIN lock ----------
const db = () => getDatabase();

// Minutes left on the lock for this number, or 0.
export async function lockedMinutes(phone: string): Promise<number> {
  const rows = (await db().sql`SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) / 60)::int AS mins
    FROM pin_lockout WHERE phone = ${phone} AND locked_until > NOW()`) as Array<{ mins: number }>;
  return rows.length ? Math.max(1, Number(rows[0].mins) || 1) : 0;
}

// Count one wrong PIN, in a single atomic statement. Wrong PINs older than 15 minutes, or from before an
// earlier lock ran out, start a fresh count. Returns true when this wrong PIN locked the number.
export async function recordWrongPin(phone: string): Promise<boolean> {
  const rows = (await db().sql`
    INSERT INTO pin_lockout AS p (phone, fails, locked_until, updated_at) VALUES (${phone}, 1, NULL, NOW())
    ON CONFLICT (phone) DO UPDATE SET
      fails = CASE
        WHEN (p.locked_until IS NOT NULL AND p.locked_until <= NOW())
          OR (p.locked_until IS NULL AND p.updated_at < NOW() - INTERVAL '15 minutes') THEN 1
        ELSE p.fails + 1 END,
      locked_until = CASE
        WHEN (p.locked_until IS NOT NULL AND p.locked_until <= NOW())
          OR (p.locked_until IS NULL AND p.updated_at < NOW() - INTERVAL '15 minutes') THEN NULL
        WHEN p.fails + 1 >= ${LOCK_AFTER} THEN NOW() + INTERVAL '15 minutes'
        ELSE p.locked_until END,
      updated_at = NOW()
    RETURNING fails, (locked_until IS NOT NULL AND locked_until > NOW()) AS locked`) as Array<{ fails: number; locked: boolean }>;
  return !!rows[0]?.locked;
}

export async function clearWrongPins(phone: string) {
  await db().sql`DELETE FROM pin_lockout WHERE phone = ${phone}`;
}
