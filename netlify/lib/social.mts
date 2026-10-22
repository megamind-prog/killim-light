// Killim Light markets itself: posts to the Killim Light Facebook Page on its own, from live data.
//   Every evening   tonight's kava lights and specials
//   Friday midday   new nakamals and newly claimed ones this week
//   Monday midday   a short tip (rotates: invite owners, area alerts, install the app...)
// Posting needs two Netlify environment variables set by the team: FB_PAGE_ID and FB_PAGE_TOKEN
// (a Page access token with pages_manage_posts). Without them nothing is posted, and the team page
// still shows each post ready to copy and paste.
import { readAll, readIndex, shownLight, store, REPORT_MIN, VU_OFFSET_MS, type Nakamal, type Status } from "./data.mts";

export type SocialSettings = { evening: boolean; eveningAt: string; weekly: boolean; tips: boolean };
export type SocialKind = "evening" | "weekly" | "tip";
export type SocialPost = { at: number; kind: SocialKind; ok: boolean; id?: string; error?: string; text: string; by: string };

const DEFAULTS: SocialSettings = { evening: true, eveningAt: "17:45", weekly: true, tips: true };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const WINDOW_MIN = 60;           // a run up to an hour late still posts; after that, wait for tomorrow
const SITE = () => (process.env.SITE_URL || process.env.URL || "https://killim-light.netlify.app").replace(/\/$/, "");
const TAGS = "#Vanuatu #Kava #Nakamal #PortVila";

export const fbConfigured = () => !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
export async function getSocial(): Promise<SocialSettings> {
  return { ...DEFAULTS, ...(((await store().get("settings/social", { type: "json" })) as SocialSettings | null) || {}) };
}
export function sanitizeSocial(body: any): SocialSettings {
  return {
    evening: !!body?.evening, weekly: !!body?.weekly, tips: !!body?.tips,
    eveningAt: HHMM.test(String(body?.eveningAt)) ? String(body.eveningAt) : DEFAULTS.eveningAt,
  };
}

// ---------- what to post ----------
const shown = (n: any) => shownLight(n, n.reports ? Math.max(n.reports.count, REPORT_MIN) : 0);
const bullet = (names: string[], max: number) =>
  names.slice(0, max).map((s) => "• " + s).join("\n") + (names.length > max ? `\n• …+${names.length - max}` : "");

export async function composeEvening(): Promise<string | null> {
  const idx = await readIndex();
  const ready = idx.items.filter((n) => shown(n) === "green");
  if (!ready.length) return null;
  const low = idx.items.filter((n) => shown(n) === "amber").length;
  const names = ready.sort((a, b) => (b.rating?.avg || 0) - (a.rating?.avg || 0)).map((n) => n.area ? `${n.name} (${n.area})` : n.name);
  const vuToday = new Date(Date.now() + VU_OFFSET_MS).toISOString().slice(0, 10);
  const specials = idx.items.flatMap((n) => (n.specials || []).filter((s: any) => s.date === vuToday).map((s: any) => `${n.name}: ${s.title}`));
  const count = ready.length;
  return [
    `🟢 Kava i redi tunaet long ${count} nakamal!`,
    `Kava is ready tonight at ${count} nakamal${count === 1 ? "" : "s"}${low ? ` (${low} more running low)` : ""}:`,
    "",
    bullet(names, 10),
    specials.length ? `\n📣 Spesel tunaet / Tonight's specials:\n${bullet(specials, 4)}` : "",
    "",
    `🗺️ Lukim map mo rod / See the map and directions: ${SITE()}/tonight`,
    "",
    TAGS,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

export async function composeWeekly(): Promise<string | null> {
  const [naks, statuses] = await Promise.all([readAll<Nakamal & { claimedAt?: number }>("nak/"), readAll<Status>("status/")]);
  const since = Date.now() - 7 * 864e5;
  const fresh = [...naks.values()].filter((n) => statuses.get(n.id)?.approved && (statuses.get(n.id)!.approvedAt || n.createdAt) >= since);
  const claimed = [...naks.values()].filter((n) => statuses.get(n.id)?.approved && n.owner && (n.claimedAt || 0) >= since && !fresh.includes(n));
  if (!fresh.length && !claimed.length) return null;
  const lines = [`🎉 Niu long Killim Light wik ia / New on Killim Light this week`, ""];
  if (fresh.length) lines.push(`📍 ${fresh.length} niu nakamal / new on the map:`, bullet(fresh.map((n) => n.area ? `${n.name} (${n.area})` : n.name), 8), "");
  if (claimed.length) lines.push(`🙌 Ona i jenisim laet blong hem naoia / Now run by the owner:`, bullet(claimed.map((n) => n.name), 8), "");
  lines.push(`Yu ronem wan nakamal? Klemem fri / Run a nakamal? Claim it free: ${SITE()}/owner`, "", TAGS);
  return lines.join("\n");
}

const TIPS = [
  `☕ Yu ronem wan nakamal? Putum laet blong yu long Killim Light, i fri.\nRun a nakamal? Put your kava light on Killim Light. It's free, takes two minutes, and customers see when your kava is ready.\n👉 ${SITE()}/owner`,
  `🔔 Kasem mesej taem kava i redi long eria blong yu.\nGet a message when kava is ready near you: open the map and tap "Alerts for my area".\n👉 ${SITE()}`,
  `📲 Putum Killim Light long fon blong yu olsem wan app.\nAdd Killim Light to your home screen: open the site and tap "Install app". It works with weak signal too.\n👉 ${SITE()}`,
  `🚶 Faenem rod i go long nakamal, no nid Google Maps.\nTap any nakamal, then "Directions": walking or driving, right on our own map.\n👉 ${SITE()}`,
  `⭐ Givim sta long nakamal we yu laekem.\nRate your favourite nakamal and tap ★ to follow it: you'll know as soon as its kava is ready.\n👉 ${SITE()}`,
  `🟡 Laet i no stret? Talem long mifala.\nIf a light is wrong, tap "Light is wrong" on that nakamal. When three people agree, the light turns grey until the owner fixes it.\n👉 ${SITE()}`,
];
export function composeTip(now = Date.now()): string {
  const week = Math.floor((now + VU_OFFSET_MS) / (7 * 864e5));
  return TIPS[week % TIPS.length] + "\n\n" + TAGS;
}

export async function compose(kind: SocialKind) {
  return kind === "evening" ? composeEvening() : kind === "weekly" ? composeWeekly() : composeTip();
}
export const postLink = (kind: SocialKind) => kind === "evening" ? SITE() + "/tonight" : kind === "weekly" ? SITE() + "/owner" : SITE();

// ---------- posting ----------
export async function postToFacebook(message: string, link: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!fbConfigured()) return { ok: false, error: "Facebook Page isn't connected yet." };
  const ver = process.env.FB_GRAPH_VERSION || "v23.0";
  const body = new URLSearchParams({ message, link, access_token: process.env.FB_PAGE_TOKEN! });
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${encodeURIComponent(process.env.FB_PAGE_ID!)}/feed`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok || !data.id) return { ok: false, error: String(data?.error?.message || `Facebook said ${r.status}`).slice(0, 300) };
    return { ok: true, id: String(data.id) };
  } catch (e: any) {
    return { ok: false, error: "Couldn't reach Facebook: " + String(e?.message || e).slice(0, 200) };
  }
}

export async function recordPost(p: SocialPost) {
  const s = store();
  await s.setJSON(`socialpost/${String(p.at).padStart(14, "0")}`, p);
  const { blobs } = await s.list({ prefix: "socialpost/" });
  const old = blobs.map((b) => b.key).sort().reverse().slice(40);
  await Promise.all(old.map((k) => s.delete(k)));
}
export async function recentPosts(limit = 12): Promise<SocialPost[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: "socialpost/" });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  return ((await Promise.all(keys.map((k) => s.get(k, { type: "json" })))) as (SocialPost | null)[]).filter(Boolean) as SocialPost[];
}

export async function postNow(kind: SocialKind, by: string) {
  const text = await compose(kind);
  if (!text) return { ok: false, error: kind === "evening" ? "No nakamal has a green light right now, so there's nothing to post." : "Nothing new this week." };
  const res = await postToFacebook(text, postLink(kind));
  await recordPost({ at: Date.now(), kind, ok: res.ok, id: res.id, error: res.error, text, by });
  return res;
}

// ---------- the timetable (called by the 5-minute scheduler) ----------
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export async function runSocial(now = Date.now()) {
  if (!fbConfigured()) return [];
  const cfg = await getSocial();
  const local = new Date(now + VU_OFFSET_MS), wd = local.getUTCDay(), m = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = local.toISOString().slice(0, 10);
  const last = ((await store().get("social/last", { type: "json" })) as Record<string, string> | null) || {};
  const due: SocialKind[] = [];
  const inWindow = (at: number) => m >= at && m - at <= WINDOW_MIN;
  if (cfg.evening && last.evening !== today && inWindow(mins(cfg.eveningAt))) due.push("evening");
  if (cfg.weekly && wd === 5 && last.weekly !== today && inWindow(12 * 60)) due.push("weekly");
  if (cfg.tips && wd === 1 && last.tip !== today && inWindow(12 * 60)) due.push("tip");
  const done = [];
  for (const kind of due) {
    // Mark first, so a slow or failed Facebook call never makes a double post.
    last[kind] = today;
    await store().setJSON("social/last", last);
    const text = await compose(kind);
    if (!text) continue;
    const res = await postToFacebook(text, postLink(kind));
    await recordPost({ at: now, kind, ok: res.ok, id: res.id, error: res.error, text, by: "⏰ automatic" });
    done.push({ kind, ...res });
  }
  return done;
}

// Tonight in one line, for the /tonight link preview.
export async function tonightSummary() {
  const idx = await readIndex();
  const ready = idx.items.filter((n) => shown(n) === "green");
  return { count: ready.length, names: ready.map((n) => n.name) };
}
