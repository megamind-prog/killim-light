// What happens whenever a light changes or a special is posted, wherever it came from (owner, team, bulk switch):
// keep the light history, alert phones that follow the nakamal or the area, and tell developers' webhooks.
import { getStatus, shownLight, store, vuDate, VU_OFFSET_MS, type Nakamal } from "./data.mts";
import { notifyArea, notifyKavaReady, notifySpecial } from "./push.mts";
import { fireWebhooks, publicNakamal } from "./dev.mts";

export type HistoryDay = [number, string][];   // [time, light] in the order they happened

export async function recordLight(id: string, light: string, at = Date.now()) {
  const key = `history/${id}/${vuDate(at)}`;
  const s = store();
  const day = ((await s.get(key, { type: "json" })) as HistoryDay | null) || [];
  day.push([at, light]);
  await s.setJSON(key, day.slice(-200));
}

// Call after saving a nakamal whose light was just set. `before` is the nakamal as it was.
export async function afterLightChange(before: Nakamal, after: Nakamal, wait?: (p: Promise<unknown>) => void) {
  await recordLight(after.id, after.light, after.lightAt || Date.now());
  const approved = (await getStatus(after.id)).approved;
  if (!approved) return;
  const jobs: Promise<unknown>[] = [fireWebhooks("light.changed", { nakamal: publicNakamal(after), previous: shownLight(before) })];
  if (after.light === "green" && shownLight(before) !== "green") jobs.push(notifyKavaReady(after), notifyArea(after));
  const all = Promise.allSettled(jobs);
  wait ? wait(all) : await all;
}

// ---------- specials and events ----------
export type Special = { id: string; kind: "deal" | "event"; title: string; text: string; date: string; from: string; to: string; createdAt: number };
export const MAX_SPECIALS = 5;
const nowVu = () => new Date(Date.now() + VU_OFFSET_MS).toISOString();   // "YYYY-MM-DDTHH:MM..." in Vanuatu time
// Still to come or happening now (Vanuatu time); finished ones are hidden.
export function isUpcoming(sp: Special) {
  const n = nowVu(), today = n.slice(0, 10), time = n.slice(11, 16);
  if (sp.date > today) return true;
  if (sp.date < today) return false;
  return !sp.to || sp.to >= time;
}
export function sanitizeSpecial(body: any): { error?: string; special?: Omit<Special, "id" | "createdAt"> } {
  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const title = clean(body?.title, 60);
  if (title.length < 3) return { error: "Give the special a short title." };
  const date = clean(body?.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  const today = nowVu().slice(0, 10);
  const max = new Date(Date.now() + VU_OFFSET_MS + 60 * 864e5).toISOString().slice(0, 10);
  if (date < today || date > max) return { error: "Choose a date from today up to 60 days ahead." };
  const t = (v: unknown) => { const x = clean(v, 5); return /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : ""; };
  return { special: { kind: body?.kind === "event" ? "event" : "deal", title, text: clean(body?.text, 200), date, from: t(body?.from), to: t(body?.to) } };
}
export async function announceSpecial(n: Nakamal, sp: Special, wait?: (p: Promise<unknown>) => void) {
  if (!(await getStatus(n.id)).approved) return;
  const all = Promise.allSettled([notifySpecial(n, sp), fireWebhooks("special.created", { nakamal: publicNakamal(n), special: sp })]);
  wait ? wait(all) : await all;
}
