// /api/owner — a logged-in owner manages their own nakamals (any number of them, from one login).
// GET  -> { user, isAdmin, phoneLogin, contact, profile, nakamals: [... with photos, reports and views] }
// POST -> { action: register | update | prices | kava | light | note | removePhoto | remove | contact | profile | removeAvatar, ... }
import type { Config, Context } from "@netlify/functions";
import {
  avatarUrl, bad, clean, currentUser, deleteImages, deletePrefix, getNak, getStatus, imgStore, isAdmin, isPhoneLogin, json, newId,
  photoUrl, readAll, rebuildIndex, reportCounts, logEvent, phoneDigits, foreignOrigin, isTeamPhoneLogin, sanitizeDetails, sanitizeKava, sanitizePrices, shownLight, store, vuDate,
  type Contact, type Nakamal, type Profile, type Report, type Status,
  isVerified,
} from "../lib/data.mts";
import { allDayToday, dueEvent, sanitizeSchedule } from "../lib/schedule.mts";
import { afterLightChange, announceSpecial, isUpcoming, MAX_SPECIALS, sanitizeSpecial, type HistoryDay, type Special } from "../lib/events.mts";
import { editableIds } from "../lib/access.mts";
import { secured } from "../lib/security.mts";

// The light values the app uses everywhere (map, list, team page, schedules).
const LIGHTS = ["green", "amber", "closed"] as const;
const NOTE_MAX = 300;
const PRICE_MAX_VT = 100000;           // no kava price is more than 100,000 vatu
const ID_RE = /^[A-Za-z0-9_-]{1,60}$/;

// Prices stay as the owner typed them ("100", "100 vt"), but each one must be a whole number of vatu, 1 to 100,000.
function checkPrices(list: unknown): { error?: string; prices?: ReturnType<typeof sanitizePrices> } {
  if (list != null && !Array.isArray(list)) return { error: "Send the prices as a list." };
  if (Array.isArray(list) && list.length > 8) return { error: "You can list up to 8 prices." };
  const prices = sanitizePrices(list);
  for (const p of prices) {
    const m = /^\s*(?:vt|vatu)?\s*(\d{1,3}(?:[ ,.]\d{3})*|\d+)\s*(?:vt|vatu)?\.?\s*$/i.exec(p.price);
    const vt = m ? Number(m[1].replace(/[ ,.]/g, "")) : NaN;
    if (!Number.isInteger(vt) || vt < 1 || vt > PRICE_MAX_VT) return { error: `“${p.item}”: the price must be a number of vatu from 1 to 100,000 (like 100 or 100 vt).` };
  }
  return { prices };
}

async function mine(userId: string, withStats = false) {
  const [naks, statuses, reports, views] = await Promise.all([readAll<Nakamal>("nak/"), readAll<Status>("status/"), readAll<Report>("report/"), readAll<{ count: number }>("views/")]);
  const reps = reportCounts(naks, reports);
  const week = new Set(Array.from({ length: 7 }, (_, i) => vuDate(Date.now() - i * 864e5)));
  const list = [...naks.values()].filter((n) => n.owner === userId).sort((a, b) => a.createdAt - b.createdAt);
  return Promise.all(list.map(async (n) => {
    const st = statuses.get(n.id) || { approved: false };
    let viewsWeek = 0;
    for (const [k, v] of views) { const [id, day] = k.split("/"); if (id === n.id && week.has(day)) viewsWeek += v.count || 0; }
    const rep = reps.get(n.id) || null;
    const specials = [...(await readAll<Special>(`special/${n.id}/`)).values()].filter(isUpcoming).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
    return {
      ...n, photos: (n.photos || []).map((p) => ({ id: p.id, url: photoUrl(n.id, p) })),
      approved: !!st.approved, visitDate: st.visit?.date || null,
      shown: shownLight(n, rep?.count || 0), reports: rep, viewsWeek, specials,
      stats: withStats ? await statsFor(n.id, views) : undefined,
    };
  }));
}

// The owner's business numbers for the last 4 weeks.
async function statsFor(id: string, views: Map<string, { count: number }>) {
  const DAYS = 28, s = store();
  const days = Array.from({ length: DAYS }, (_, i) => vuDate(Date.now() - (DAYS - 1 - i) * 864e5));
  const [history, ratings, follows] = await Promise.all([
    readAll<HistoryDay>(`history/${id}/`), readAll<{ stars: number; at: number }>(`rating/${id}/`), s.list({ prefix: `push/${id}/` }),
  ]);
  const viewsByDay = days.map((d) => views.get(`${id}/${d}`)?.count || 0);
  const greenDays = days.filter((d) => (history.get(d) || []).some(([, l]) => l === "green"));
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const starts: number[] = [];
  for (const d of greenDays) {
    byWeekday[new Date(d + "T12:00:00Z").getUTCDay()]++;
    const first = (history.get(d) || []).find(([, l]) => l === "green");
    if (first) { const t = new Date(first[0] + 11 * 3600e3); starts.push(t.getUTCHours() * 60 + t.getUTCMinutes()); }
  }
  starts.sort((a, b) => a - b);
  const mid = starts.length ? starts[Math.floor(starts.length / 2)] : null;
  const rs = [...ratings.values()].filter((r) => r && r.stars >= 1 && r.stars <= 5);
  const since = Date.now() - DAYS * 864e5;
  return {
    days, views: viewsByDay, viewsTotal: viewsByDay.reduce((a, b) => a + b, 0),
    followers: follows.blobs.length,
    rating: { avg: rs.length ? +(rs.reduce((a, r) => a + r.stars, 0) / rs.length).toFixed(1) : 0, count: rs.length, recent: rs.filter((r) => r.at > since).length },
    nightsOpen: greenDays.length, byWeekday,
    usualStart: mid == null ? null : `${String(Math.floor(mid / 60)).padStart(2, "0")}:${String(mid % 60).padStart(2, "0")}`,
  };
}

export default secured(async (req: Request, context: Context) => {
  if (foreignOrigin(req)) return bad("Not allowed from another website.", 403);
  const user = await currentUser();
  if (!user) return bad("Please log in.", 401);
  // Someone signing up themselves with a phone-login style address is not a real phone login.
  if (isPhoneLogin(user.email) && !isTeamPhoneLogin(user)) return bad("This login isn't allowed. Ask the Killim Light team for a phone login.", 403);
  const s = store();
  const contact = (await s.get("contact/" + user.id, { type: "json" })) as Contact | null;
  const profileOf = async () => {
    const pr = (await s.get("profile/" + user.id, { type: "json" })) as Profile | null;
    return { name: pr ? pr.name : (user.name || ""), avatar: pr?.avatar ? avatarUrl(user.id, pr.avatar) : null };
  };
  const phoneLogin = isPhoneLogin(user.email);
  // The team never needs verifying; owners do, once, before switching a light or claiming a nakamal.
  const verified = isAdmin(user) || (await isVerified(user.id));
  const myPhone = phoneLogin ? phoneDigits(user.email!.split("@")[0]) : phoneDigits(contact?.phone || "");
  const needVerify = () => bad("Verify your phone number first: send VERIFY to Killim Light on WhatsApp, or ask the Killim Light team.", 403);

  if (req.method === "GET") {
    return json({
      user: { email: phoneLogin ? null : user.email, name: user.name || "" }, phoneLogin,
      isAdmin: isAdmin(user), contact, profile: await profileOf(), nakamals: await mine(user.id, true),
      verified, myPhone: myPhone.length >= 7 ? myPhone : null,
    });
  }

  let body: any;
  try { body = await req.json(); } catch { return bad("Send JSON."); }
  const action = String(body?.action || "");

  if (action === "profile" || action === "removeAvatar") {
    const prev = ((await s.get("profile/" + user.id, { type: "json" })) as Profile | null) || { name: user.name || "", avatar: null, updatedAt: 0 };
    const next: Profile = { ...prev, updatedAt: Date.now() };
    if (action === "profile") next.name = clean(body?.name, 60);
    else { next.avatar = null; await deleteImages(`avatar/${user.id}/`); }
    await s.setJSON("profile/" + user.id, next);
    await rebuildIndex();
    return json({ ok: true, profile: await profileOf() });
  }

  if (action === "contact" || action === "register") {
    if (body?.contact || !contact) {
      const owner = clean(body?.contact?.owner, 80), phone = clean(body?.contact?.phone, 30);
      if (owner.length < 2) return bad("Enter your name.");
      if (phone.replace(/\D/g, "").length < 5) return bad("Enter a phone number our team can call.");
      await s.setJSON("contact/" + user.id, { owner, phone, email: phoneLogin ? undefined : user.email, at: Date.now() });
    }
    if (action === "contact") return json({ ok: true, nakamals: await mine(user.id) });
  }

  if (action === "register") {
    const r = sanitizeDetails(body);
    if (r.error) return bad(r.error);
    // Prices come with the registration (the new listing can't be edited until the team approves it).
    const pr = checkPrices(body?.prices);
    if (pr.error) return bad(pr.error);
    if ((await mine(user.id)).length >= 20) return bad("You can manage up to 20 nakamals from one login.");
    const now = Date.now(), id = newId();
    const nak: Nakamal = {
      id, owner: user.id, ownerEmail: phoneLogin ? undefined : user.email, ...r.details!, ...sanitizeKava(body),
      prices: pr.prices!, light: "closed", lightAt: null, note: "", createdAt: now, updatedAt: now,
    };
    await s.setJSON("nak/" + id, nak);
    await s.setJSON("status/" + id, { approved: false } satisfies Status);
    await logEvent(user, "owner", "register", { id, name: nak.name });
    return json({ ok: true, id, nakamals: await mine(user.id) });
  }

  // "I run this nakamal": ask the team to hand over a listing the team added without an owner.
  if (action === "claim") {
    if (!verified) return needVerify();
    const cid = clean(body?.id, 60);
    const cn = cid ? await getNak(cid) : null;
    if (!cn) return bad("Unknown nakamal.", 404);
    if (cn.owner) return bad(cn.owner === user.id ? "This nakamal is already yours." : "This nakamal already has an owner. Contact the Killim Light team if that's wrong.", 409);
    const cst = await getStatus(cid);
    if (!contact) {
      const owner = clean(body?.contact?.owner, 80), phone = clean(body?.contact?.phone, 30);
      if (owner.length < 2 || phone.replace(/\D/g, "").length < 5) return bad("Enter your name and a phone number our team can call.");
      await s.setJSON("contact/" + user.id, { owner, phone, email: phoneLogin ? undefined : user.email, at: Date.now() });
    }
    await s.setJSON("status/" + cid, { ...cst, claim: { userId: user.id, login: phoneLogin ? "☎ " + phoneDigits(user.email!.split("@")[0]) : user.email, at: Date.now() } });
    await logEvent(user, "owner", "claim", { id: cid, name: cn.name });
    return json({ ok: true, claimed: cn.name, nakamals: await mine(user.id) });
  }

  // Everything else edits one nakamal. Checked on the server before every write:
  //  - the id is well formed and the nakamal exists,
  //  - it is this login's nakamal (nak.owner), and
  //  - the Killim Light team approved this login for it: the id is in the login's app_metadata.nakamals,
  //    read fresh from Netlify Identity (app_metadata can't be changed by the user; user_metadata and ids sent
  //    by the browser are never enough on their own).
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!ID_RE.test(id)) return bad("Unknown nakamal.", 404);
  const nak = await getNak(id);
  if (!nak) return bad("Unknown nakamal.", 404);
  if (nak.owner !== user.id) return bad("That nakamal isn't yours.", 403);
  let allowed: Set<string>;
  try { allowed = await editableIds(user.id); }
  catch (e) { console.error("owner: couldn't read app_metadata", e); return bad("Couldn't check your login right now. Please try again.", 503); }
  if (!allowed.has(id)) return bad("The Killim Light team hasn't approved you for this nakamal yet. They will after their visit.", 403);
  const patch: Partial<Nakamal> = {};
  if (action === "update") {
    const r = sanitizeDetails(body);
    if (r.error) return bad(r.error);
    Object.assign(patch, r.details);
  } else if (action === "prices") {
    const r = checkPrices(body?.prices);
    if (r.error) return bad(r.error);
    patch.prices = r.prices!;
  } else if (action === "kava") {
    Object.assign(patch, sanitizeKava({ kavaFrom: nak.kavaFrom, strength: nak.strength, closeTime: nak.closeTime, ...body }));
  } else if (action === "light") {
    if (!verified) return needVerify();
    if (typeof body?.light !== "string" || !(LIGHTS as readonly string[]).includes(body.light)) return bad("Choose a light.");
    patch.light = body.light; patch.lightAt = Date.now(); (patch as any).lightBy = "owner";
    (patch as any).ownerUsedLight = true;
  } else if (action === "note") {
    const note = String(body?.note ?? "").trim();
    if (note.length > NOTE_MAX) return bad(`The note can be up to ${NOTE_MAX} characters.`);
    patch.note = note;
  } else if (action === "removePhoto") {
    const pid = clean(body?.photoId, 60);
    if (!(nak.photos || []).some((p) => p.id === pid)) return bad("That photo isn't on this nakamal.", 404);
    patch.photos = (nak.photos || []).filter((p) => p.id !== pid);
    await imgStore().delete(`photo/${id}/${pid}`);
  } else if (action === "remove") {
    await deleteImages(`photo/${id}/`);
    await Promise.all([s.delete("nak/" + id), s.delete("status/" + id),
      deletePrefix(`rating/${id}/`), deletePrefix(`report/${id}/`), deletePrefix(`views/${id}/`), deletePrefix(`push/${id}/`),
      deletePrefix(`special/${id}/`), deletePrefix(`history/${id}/`)]);
    await logEvent(user, "owner", "remove", { id, name: nak.name });
    await rebuildIndex();
    return json({ ok: true, nakamals: await mine(user.id) });
  } else if (action === "schedule") {
    if (!verified) return needVerify();
    const r = sanitizeSchedule(body);
    if (r.error) return bad(r.error);
    (patch as any).schedule = r.schedule;
    (patch as any).ownerUsedLight = true;
    // Don't fire a time that already passed a few minutes ago just because the plan was saved,
    // except "open 24 hours" today, which turns the light green straight away.
    const due = dueEvent(r.schedule, Date.now());
    (patch as any).schedLast = due?.key;
    if (due && allDayToday(r.schedule)) { patch.light = "green"; patch.lightAt = Date.now(); (patch as any).lightBy = "schedule"; }
  } else if (action === "special") {
    const r = sanitizeSpecial(body);
    if (r.error) return bad(r.error);
    const have = [...(await readAll<Special>(`special/${id}/`)).values()].filter(isUpcoming);
    if (have.length >= MAX_SPECIALS) return bad(`You can have ${MAX_SPECIALS} specials at a time. Remove one first.`);
    const sp: Special = { id: newId().slice(1), createdAt: Date.now(), ...r.special! };
    await s.setJSON(`special/${id}/${sp.id}`, sp);
    await logEvent(user, "owner", "special", { id, name: nak.name, detail: sp.title });
    await announceSpecial(nak, sp, context?.waitUntil?.bind(context));
    await rebuildIndex();
    return json({ ok: true, nakamals: await mine(user.id) });
  } else if (action === "unspecial") {
    const sid = clean(body?.specialId, 40);
    if (!ID_RE.test(sid) || !(await s.get(`special/${id}/${sid}`))) return bad("That special doesn't exist.", 404);
    await s.delete(`special/${id}/${sid}`);
    await rebuildIndex();
    return json({ ok: true, nakamals: await mine(user.id) });
  } else {
    return bad("Unknown action.");
  }
  const next = { ...nak, ...patch, updatedAt: Date.now() };
  await s.setJSON("nak/" + id, next);
  await logEvent(user, "owner", action, { id, name: next.name, detail: action === "light" ? body.light : action === "note" ? patch.note : action === "schedule" ? ((patch as any).schedule.enabled ? "on" : "off") : undefined });
  const approved = (await getStatus(id)).approved;
  if (approved) await rebuildIndex();
  // Alert phones that follow this nakamal, without making the owner wait.
  if (action === "light" || (action === "schedule" && nak.light !== next.light)) await afterLightChange(nak, next, context?.waitUntil?.bind(context));
  return json({ ok: true, nakamals: await mine(user.id) });
});

// GET reads the owner's own data; every change is a POST.
export const config: Config = {
  path: "/api/owner", method: ["GET", "POST"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 30 },
};
