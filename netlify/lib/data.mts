// Shared data layer for Killim Light, stored in Netlify Blobs.
//
//   nak/<id>                     a nakamal's page: owner, name, location, prices, kava, light, note, closing time
//   status/<id>                  team-only: approved, visit date / notes
//   contact/<userId>             team-only: owner's name + phone
//   profile/<userId>             owner's public profile: display name + profile picture
//   rating/<nakId>/<deviceId>    one public rating per phone per nakamal
//   report/<nakId>/<deviceId>    "the light is wrong" reports from customers
//   views/<nakId>/<yyyy-mm-dd>   approximate page views per day, for the owner's stats
//   push/<nakId>/<subId>         phones that want an alert when this nakamal turns green
//   settings/site                team switches, e.g. whether written comments are shown
//   public/index                 the ready-made public list (approved nakamals only)
//
// Pictures live in a separate store ("killim-img"): photo/<nakId>/<photoId> and avatar/<userId>/<photoId>.
import { getStore } from "@netlify/blobs";
import { getUser, type User } from "@netlify/identity";
import seed from "./seed.json" with { type: "json" };

export const store = () => getStore({ name: "killim", consistency: "strong" });
export const imgStore = () => getStore({ name: "killim-img", consistency: "strong" });
export const MAX_PHOTOS = 6;
export const STALE_MS = 14 * 3600e3;         // a green/amber light older than this shows as "no update today"
export const REPORT_WINDOW_MS = 3 * 3600e3;  // reports count for 3 hours after they're made
export const REPORT_MIN = 3;                 // this many different phones must agree before a light is greyed out
export const VU_OFFSET_MS = 11 * 3600e3;     // Vanuatu is UTC+11 all year

export type Price = { item: string; price: string };
export type Light = "green" | "amber" | "closed";
export type Nakamal = {
  id: string; owner: string | null; ownerEmail?: string;
  name: string; area: string; about: string; hours: string;
  lat: number; lng: number; prices: Price[];
  kavaFrom?: string; strength?: "" | "mild" | "medium" | "strong";
  closeTime?: string;                         // "HH:MM" Vanuatu time; the light closes itself then
  light: Light; lightAt: number | null; note: string;
  photos?: Photo[];
  createdAt: number; updatedAt: number;
};
export type Photo = { id: string; w: number; h: number; at: number };
export type Profile = { name: string; avatar: Photo | null; updatedAt: number };
export type Status = { approved: boolean; approvedAt?: number; contact?: { owner: string; phone: string }; visit?: { date?: string; notes?: string; visited?: boolean; visitedAt?: number | null } };
export type Contact = { owner: string; phone: string; email?: string; at: number };
export type Rating = { stars: number; text: string; at: number };
export type Report = { kind: "closed" | "nokava" | "open" | "location"; at: number };
export type Settings = { comments: boolean };

export const KAVA_ISLANDS = ["Pentecost", "Tanna", "Malo", "Santo", "Ambae", "Maewo", "Epi", "Malekula", "Efate", "Other"];
export const REGIONS = {
  efate: { name: "Efate", bounds: [[-17.85, 168.12], [-17.39, 168.62]] },
  santo: { name: "Santo", bounds: [[-15.75, 166.5], [-14.6, 167.3]] },
  tanna: { name: "Tanna", bounds: [[-19.7, 169.1], [-19.3, 169.5]] },
} as const;

// ---------- small helpers ----------
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
export const bad = (message: string, status = 400) => json({ error: message }, status);
export const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const newId = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const vuDate = (ms = Date.now()) => new Date(ms + VU_OFFSET_MS).toISOString().slice(0, 10);
// Anywhere in Vanuatu (Torres Islands to Aneityum).
export const inVanuatu = (lat: number, lng: number) => lat > -20.6 && lat < -12.9 && lng > 166.2 && lng < 170.4;
export const regionOf = (lat: number, lng: number) => {
  for (const [k, r] of Object.entries(REGIONS)) {
    const [[s, w], [n, e]] = r.bounds;
    if (lat >= s && lat <= n && lng >= w && lng <= e) return k;
  }
  return "other";
};

export async function readAll<T>(prefix: string): Promise<Map<string, T>> {
  const s = store();
  const { blobs } = await s.list({ prefix });
  const out = new Map<string, T>();
  await Promise.all(blobs.map(async (b) => {
    const v = await s.get(b.key, { type: "json" });
    if (v) out.set(b.key.slice(prefix.length), v as T);
  }));
  return out;
}
// Public picture addresses. Ids never repeat, so browsers can cache them forever.
export const photoUrl = (nakId: string, p: Photo) => `/img/photo/${nakId}/${p.id}.jpg`;
export const avatarUrl = (userId: string, p: Photo) => `/img/avatar/${userId}/${p.id}.jpg`;
export async function deleteImages(prefix: string) {
  const s = imgStore();
  const { blobs } = await s.list({ prefix });
  await Promise.all(blobs.map((b) => s.delete(b.key)));
}
export async function deletePrefix(prefix: string) {
  const s = store();
  const { blobs } = await s.list({ prefix });
  await Promise.all(blobs.map((b) => s.delete(b.key)));
}
export const getNak = async (id: string) => (await store().get("nak/" + id, { type: "json" })) as Nakamal | null;
export const getStatus = async (id: string) => ((await store().get("status/" + id, { type: "json" })) as Status | null) || { approved: false };
export const getSettings = async (): Promise<Settings> => ({ comments: false, ...(((await store().get("settings/site", { type: "json" })) as Settings | null) || {}) });

export function sanitizeDetails(body: any): { error?: string; details?: Pick<Nakamal, "name" | "area" | "about" | "hours" | "lat" | "lng"> } {
  const name = clean(body?.name, 80);
  if (name.length < 2) return { error: "Enter the nakamal name." };
  const lat = Number(body?.lat), lng = Number(body?.lng);
  if (!isNum(lat) || !isNum(lng) || !inVanuatu(lat, lng)) return { error: "Tap the map to show where the nakamal is." };
  return { details: { name, area: clean(body?.area, 80), about: clean(body?.about, 400), hours: clean(body?.hours, 80), lat: +lat.toFixed(6), lng: +lng.toFixed(6) } };
}
export const sanitizePrices = (list: any): Price[] =>
  (Array.isArray(list) ? list : []).map((p) => ({ item: clean(p?.item, 40), price: clean(p?.price, 24) })).filter((p) => p.item && p.price).slice(0, 8);
export function sanitizeKava(body: any) {
  const from = clean(body?.kavaFrom, 30);
  const strength = ["mild", "medium", "strong"].includes(body?.strength) ? body.strength : "";
  const close = clean(body?.closeTime, 5);
  return { kavaFrom: KAVA_ISLANDS.includes(from) ? from : "", strength, closeTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(close) ? close : "" };
}

// ---------- what the light really says right now ----------
// The first time the owner's closing time comes round after they set the light, it counts as closed.
export function autoClosedAt(n: Pick<Nakamal, "closeTime" | "lightAt">): number | null {
  if (!n.closeTime || !isNum(n.lightAt)) return null;
  const [h, m] = n.closeTime.split(":").map(Number);
  const local = new Date(n.lightAt + VU_OFFSET_MS);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - VU_OFFSET_MS;
  if (t <= n.lightAt) t += 864e5;
  return t;
}
export type Shown = "green" | "amber" | "closed" | "stale" | "reported";
export function shownLight(n: Nakamal, reportedCount = 0, now = Date.now()): Shown {
  if (n.light === "closed") return "closed";
  if (!isNum(n.lightAt)) return "closed";
  const ac = autoClosedAt(n);
  if (ac && now >= ac) return "closed";
  if (now - n.lightAt >= STALE_MS) return "stale";
  if (reportedCount >= REPORT_MIN) return "reported";
  return n.light;
}

// ---------- who is asking ----------
export async function currentUser(): Promise<User | null> {
  try { return await getUser(); } catch { return null; }
}
export function isAdmin(user: User | null) {
  if (!user?.email) return false;
  const list = (Netlify.env.get("ADMIN_EMAILS") || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}
// Owners without email get a login made by the team: their phone number + a 6-digit PIN.
// Netlify's login system needs an email-shaped username, so we use one that can never receive mail.
export const PHONE_LOGIN_DOMAIN = "phone.killimlight.invalid";
export const phoneDigits = (v: unknown) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("678") && d.length > 7) d = d.slice(3);
  return d;
};
export const phoneLoginEmail = (phone: unknown) => `${phoneDigits(phone)}@${PHONE_LOGIN_DOMAIN}`;
export const isPhoneLogin = (email?: string) => !!email && email.endsWith("@" + PHONE_LOGIN_DOMAIN);
// A phone login is only real if our team made it: the mark lives in app_metadata, which users can't change themselves.
export const PHONE_MARK = { killim_phone: true };
// Owners must be verified before they switch a light for the first time or claim a nakamal:
// by WhatsApp (they send VERIFY from their own number) or by the team (call or visit).
//   verified/<userId>  { by: "whatsapp" | "team", at }
export const isVerified = async (uid: string) => !!(await store().get("verified/" + uid, { type: "json" }));
export const setVerified = (uid: string, by: string) => store().setJSON("verified/" + uid, { by, at: Date.now() });
export const unsetVerified = (uid: string) => store().delete("verified/" + uid);
export const isTeamPhoneLogin = (u: User | null) => !!u && isPhoneLogin(u.email) && (u.appMetadata as any)?.killim_phone === true;
// Changes must come from our own pages: refuse requests sent from another website.
export function foreignOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const o = req.headers.get("origin");
  if (!o) return false;
  try {
    const from = new URL(o).host;
    const ours = [new URL(req.url).host, req.headers.get("host"), req.headers.get("x-forwarded-host")].filter(Boolean);
    return !ours.includes(from);
  } catch { return true; }
}

// ---------- one-time import of nakamals from the earlier claude.ai version ----------
export async function ensureSeed() {
  const s = store();
  if (await s.get("meta/seeded")) return;
  for (const n of (seed as any).nakamals as Array<Nakamal & { status: Status }>) {
    const { status, ...nak } = n;
    await s.setJSON("nak/" + nak.id, nak, { onlyIfNew: true });
    await s.setJSON("status/" + nak.id, status, { onlyIfNew: true });
  }
  await s.setJSON("meta/seeded", { at: Date.now() });
}

// Live reports per nakamal: only reports made after the owner last set the light, within the report window.
export function reportCounts(naks: Map<string, Nakamal>, reports: Map<string, Report>, now = Date.now()) {
  const out = new Map<string, { count: number; kinds: Record<string, number> }>();
  for (const [key, r] of reports) {
    const [nakId] = key.split("/");
    const n = naks.get(nakId);
    if (!n || !r || now - r.at > REPORT_WINDOW_MS || (isNum(n.lightAt) && r.at < n.lightAt)) continue;
    const c = out.get(nakId) || { count: 0, kinds: {} };
    c.count++; c.kinds[r.kind] = (c.kinds[r.kind] || 0) + 1;
    out.set(nakId, c);
  }
  return out;
}

// ---------- public list ----------
// Rebuilt after every change; the public page and the open API read this one blob.
export async function rebuildIndex() {
  await ensureSeed();
  const [naks, statuses, ratings, profiles, reports, settings, specialsAll] = await Promise.all([
    readAll<Nakamal>("nak/"), readAll<Status>("status/"), readAll<Rating>("rating/"), readAll<Profile>("profile/"), readAll<Report>("report/"), getSettings(),
    readAll<any>("special/"),
  ]);
  // Specials and events still to come, per nakamal; ones that ended over two days ago are deleted.
  const vuNow = new Date(Date.now() + VU_OFFSET_MS).toISOString(), today = vuNow.slice(0, 10), time = vuNow.slice(11, 16);
  const old = vuDate(Date.now() - 2 * 864e5);
  const specials = new Map<string, any[]>();
  for (const [k, sp] of specialsAll) {
    const [nid] = k.split("/");
    if (!sp) continue;
    if (sp.date < old) { await store().delete("special/" + k); continue; }
    if (sp.date < today || (sp.date === today && sp.to && sp.to < time)) continue;
    if (!specials.has(nid)) specials.set(nid, []);
    specials.get(nid)!.push({ id: sp.id, kind: sp.kind, title: sp.title, text: sp.text, date: sp.date, from: sp.from, to: sp.to });
  }
  for (const list of specials.values()) list.sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
  const byNak = new Map<string, Rating[]>();
  for (const [key, r] of ratings) {
    const [nakId] = key.split("/");
    if (!r || !isNum(r.stars) || r.stars < 1 || r.stars > 5) continue;
    if (!byNak.has(nakId)) byNak.set(nakId, []);
    byNak.get(nakId)!.push(r);
  }
  const reps = reportCounts(naks, reports);
  const items = [...naks.values()].filter((n) => statuses.get(n.id)?.approved).map((n) => {
    const rs = (byNak.get(n.id) || []).sort((a, b) => b.at - a.at);
    const avg = rs.length ? rs.reduce((t, r) => t + r.stars, 0) / rs.length : 0;
    const rep = reps.get(n.id);
    const pr = n.owner ? profiles.get(n.owner) : null;
    return {
      id: n.id, name: n.name, area: n.area, about: n.about, hours: n.hours, lat: n.lat, lng: n.lng, region: regionOf(n.lat, n.lng),
      prices: n.prices || [], kavaFrom: n.kavaFrom || "", strength: n.strength || "", closeTime: n.closeTime || "",
      light: n.light, lightAt: n.lightAt, lightBy: (n as any).lightBy || null, note: n.note,
      reports: rep && rep.count >= REPORT_MIN ? rep : null,
      photos: (n.photos || []).map((p) => ({ url: photoUrl(n.id, p), w: p.w, h: p.h })),
      specials: specials.get(n.id) || [],
      schedule: (n as any).schedule?.enabled ? (n as any).schedule.days : null,
      claimed: !!n.owner,
      lightConfirmed: !!(n as any).schedConfirmed || (n.owner ? !!(n as any).ownerUsedLight || n.lightAt != null : n.lightAt != null),
      osm: (n as any).osmId || null,
      host: pr && (pr.name || pr.avatar) ? { name: pr.name || "", avatar: pr.avatar ? avatarUrl(n.owner!, pr.avatar) : null } : null,
      rating: {
        avg: +avg.toFixed(2), count: rs.length,
        recent: settings.comments ? rs.filter((r) => r.text).slice(0, 8).map((r) => ({ stars: r.stars, text: r.text, at: r.at })) : [],
      },
    };
  });
  const index = { built: Date.now(), settings: { comments: settings.comments }, items };
  await store().setJSON("public/index", index);
  return index;
}
export async function readIndex() {
  const idx = (await store().get("public/index", { type: "json" })) as { built: number; settings: Settings; items: any[] } | null;
  // Rebuild now and then so reports expire and auto-closing stays accurate even when nobody changes anything.
  if (!idx || !idx.settings || Date.now() - idx.built > 5 * 60e3) return rebuildIndex();
  return idx;
}

// ---------- activity log: who changed what, for the team page ----------
//   log/<time>-<random>   { at, who, role: "team" | "owner", action, id?, name?, detail? }
export type LogEntry = { at: number; who: string; role: "team" | "owner"; action: string; id?: string; name?: string; detail?: string };
const LOG_KEEP_MS = 90 * 864e5;
export const whoLabel = (u: User | null) => !u ? "someone" : isPhoneLogin(u.email) ? "☎ " + phoneDigits(u.email!.split("@")[0]) : (u.email || u.id);
export async function logEvent(u: User | null, role: LogEntry["role"], action: string, extra: { id?: string; name?: string; detail?: string; who?: string } = {}) {
  try {
    const at = Date.now();
    const key = `log/${String(at).padStart(14, "0")}-${Math.random().toString(36).slice(2, 7)}`;
    const { who, ...rest } = extra;
    await store().setJSON(key, { at, who: who || whoLabel(u), role, action, ...rest } satisfies LogEntry);
    // Now and then, forget entries older than 90 days.
    if (Math.random() < 0.02) {
      const { blobs } = await store().list({ prefix: "log/" });
      const old = blobs.filter((b) => Number(b.key.slice(4, 18)) < at - LOG_KEEP_MS);
      await Promise.all(old.map((b) => store().delete(b.key)));
    }
  } catch { /* the log must never break the real action */ }
}
export async function readLog(limit = 150): Promise<LogEntry[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: "log/" });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const out = await Promise.all(keys.map((k) => s.get(k, { type: "json" }) as Promise<LogEntry | null>));
  return out.filter(Boolean) as LogEntry[];
}
