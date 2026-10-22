// /api/admin — the Killim Light team only (emails listed in the ADMIN_EMAILS environment variable).
// GET  -> every nakamal with status, visit, owner contact, live reports and views; every account; team settings
// POST -> { action: visit | approve | hide | delete | light | clearReports | removePhoto | removeAvatar
//                   | assign | unassign | createLogin | resetPin | settings
//                   | addNakamal | edit | editAccount | setPassword | deleteAccount | lightAll, ... }
import type { Config, Context } from "@netlify/functions";
import { afterLightChange, isUpcoming, type Special } from "../lib/events.mts";
import { usageOf, type ApiKey } from "../lib/dev.mts";
import { admin as identityAdmin, type User } from "@netlify/identity";
import {
  avatarUrl, newId, sanitizeDetails, sanitizeKava, sanitizePrices, bad, clean, currentUser, deleteImages, deletePrefix, getNak, getSettings, getStatus, imgStore, isAdmin, isPhoneLogin, json,
  phoneDigits, phoneLoginEmail, photoUrl, readAll, rebuildIndex, logEvent, readLog, foreignOrigin, PHONE_MARK, reportCounts, shownLight, store, vuDate,
  type Contact, type Nakamal, type Profile, type Report, type Status,
} from "../lib/data.mts";

async function overview() {
  const [naks, statuses, contacts, profiles, reports, views, ratings] = await Promise.all([
    readAll<Nakamal>("nak/"), readAll<Status>("status/"), readAll<Contact>("contact/"), readAll<Profile>("profile/"),
    readAll<Report>("report/"), readAll<{ count: number }>("views/"), readAll<{ stars: number }>("rating/"),
  ]);
  const specials = await readAll<Special>("special/");
  const stars = new Map<string, number[]>();
  for (const [k, r] of ratings) { const nid = k.split("/")[0]; if (r && r.stars) (stars.get(nid) || stars.set(nid, []).get(nid)!).push(r.stars); }
  const reps = reportCounts(naks, reports);
  const week = new Set(Array.from({ length: 7 }, (_, i) => vuDate(Date.now() - i * 864e5)));
  return [...naks.values()].map((n) => {
    const st = statuses.get(n.id) || { approved: false };
    const c = (n.owner && contacts.get(n.owner)) || st.contact || null;
    const pr = n.owner ? profiles.get(n.owner) : null;
    const rep = reps.get(n.id) || null;
    let viewsWeek = 0;
    for (const [k, v] of views) { const [id, day] = k.split("/"); if (id === n.id && week.has(day)) viewsWeek += v.count || 0; }
    return {
      ...n, status: st, contact: c ? { owner: c.owner, phone: c.phone } : null,
      loginType: !n.owner ? null : n.ownerEmail ? "email" : "phone",
      photos: (n.photos || []).map((p) => ({ id: p.id, url: photoUrl(n.id, p) })),
      host: pr ? { name: pr.name, avatar: pr.avatar ? avatarUrl(n.owner!, pr.avatar) : null } : null,
      shown: shownLight(n, rep?.count || 0), reports: rep, viewsWeek,
      specials: [...specials].filter(([k, v]) => k.startsWith(n.id + "/") && isUpcoming(v)).map(([, v]) => v),
      rating: stars.get(n.id) ? { avg: +(stars.get(n.id)!.reduce((a, b) => a + b, 0) / stars.get(n.id)!.length).toFixed(1), count: stars.get(n.id)!.length } : null,
    };
  }).sort((a, b) => Number(a.status.approved) - Number(b.status.approved) || b.createdAt - a.createdAt);
}

async function findUserByEmail(email: string) {
  const want = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const users = await identityAdmin.listUsers({ page, perPage: 100 });
    const hit = users.find((u) => (u.email || "").toLowerCase() === want);
    if (hit) return hit;
    if (users.length < 100) return null;
  }
  return null;
}
// 8-digit PINs from a secure random source: 100 million possibilities.
const newPin = () => String(10000000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90000000));

async function allUsers(): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 50; page++) {
    const users = await identityAdmin.listUsers({ page, perPage: 100 });
    out.push(...users);
    if (users.length < 100) break;
  }
  return out;
}
// Every registered account, with its contact details, profile and nakamals, for the team's Accounts tab.
async function accounts() {
  const [users, naks, statuses, contacts, profiles] = await Promise.all([
    allUsers(), readAll<Nakamal>("nak/"), readAll<Status>("status/"), readAll<Contact>("contact/"), readAll<Profile>("profile/"),
  ]);
  return users.map((u) => {
    const phone = isPhoneLogin(u.email);
    const c = contacts.get(u.id) || null, pr = profiles.get(u.id) || null;
    return {
      id: u.id, email: phone ? null : u.email || null, phone: phone ? phoneDigits(u.email!.split("@")[0]) : null,
      loginType: phone ? "phone" : u.provider === "google" ? "google" : "email",
      name: u.name || (u.userMetadata?.full_name as string) || "", team: isAdmin(u),
      createdAt: u.createdAt || null, lastSignInAt: u.lastSignInAt || null, confirmed: phone || !!u.confirmedAt || u.provider === "google",
      contact: c ? { owner: c.owner, phone: c.phone } : null,
      profile: pr ? { name: pr.name, avatar: pr.avatar ? avatarUrl(u.id, pr.avatar) : null } : null,
      nakamals: [...naks.values()].filter((n) => n.owner === u.id).map((n) => ({ id: n.id, name: n.name, approved: !!statuses.get(n.id)?.approved })),
    };
  }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
// Find a login from what the team typed: an email address or a phone-login number.
async function findLogin(raw: string) {
  const email = raw.includes("@") ? raw : phoneDigits(raw).length >= 7 ? phoneLoginEmail(raw) : "";
  return email ? findUserByEmail(email) : null;
}
async function removeNakamal(id: string) {
  const s = store();
  await deleteImages(`photo/${id}/`);
  await Promise.all([s.delete("nak/" + id), s.delete("status/" + id),
    deletePrefix(`rating/${id}/`), deletePrefix(`report/${id}/`), deletePrefix(`views/${id}/`), deletePrefix(`push/${id}/`),
    deletePrefix(`special/${id}/`), deletePrefix(`history/${id}/`)]);
}
// Developers' API keys, for the team's Tools tab: who uses the open data and how much.
async function devKeys() {
  const [keys, hooks] = await Promise.all([readAll<ApiKey>("apikey/"), store().list({ prefix: "hook/" })]);
  return Promise.all([...keys].map(async ([hash, k]) => {
    const use = await usageOf(hash, 7);
    return { id: hash.slice(0, 16), name: k.name, email: k.email, use: k.use, createdAt: k.createdAt, revoked: !!k.revoked,
      week: use.reduce((a, d) => a + d.count, 0), hooks: hooks.blobs.filter((b) => b.key.startsWith(`hook/${hash}/`)).length };
  }));
}
// Take a nakamal off its login, keeping the owner's name and phone with it so the team can still call them.
async function unassignNakamal(n: Nakamal) {
  const s = store();
  const st = await getStatus(n.id);
  const c = n.owner ? ((await s.get("contact/" + n.owner, { type: "json" })) as Contact | null) : null;
  await s.setJSON("status/" + n.id, { ...st, contact: c ? { owner: c.owner, phone: c.phone } : st.contact });
  await s.setJSON("nak/" + n.id, { ...n, owner: null, ownerEmail: undefined, updatedAt: Date.now() });
}

export default async (req: Request, context?: Context) => {
  if (foreignOrigin(req)) return bad("Not allowed from another website.", 403);
  const user = await currentUser();
  if (!user) return bad("Please log in.", 401);
  if (!isAdmin(user)) return bad("This page is only for the Killim Light team.", 403);
  const s = store();
  const everything = async () => { const [settings, nakamals, accts, log, keys] = await Promise.all([getSettings(), overview(), accounts(), readLog(), devKeys()]); return { settings, nakamals, accounts: accts, log, devkeys: keys }; };
  const reply = async (extra: Record<string, unknown> = {}) => json({ ok: true, ...extra, ...(await everything()) });
  if (req.method === "GET") return json({ me: user.email, myId: user.id, ...(await everything()) });

  let body: any;
  try { body = await req.json(); } catch { return bad("Send JSON."); }
  const action = String(body?.action || "");

  if (action === "settings") {
    await s.setJSON("settings/site", { ...(await getSettings()), comments: !!body?.comments });
    await logEvent(user, "team", "settings", { detail: body?.comments ? "comments on" : "comments off" });
    await rebuildIndex();
    return reply();
  }

  // Make a login for an owner who has no email: phone number + 6-digit PIN, handed over on the visit.
  if (action === "createLogin" || action === "resetPin") {
    const phone = phoneDigits(body?.phone);
    if (phone.length < 7) return bad("Enter the owner's phone number (7 digits).");
    const email = phoneLoginEmail(phone), pin = newPin();
    const existing = await findUserByEmail(email);
    if (action === "resetPin") {
      if (!existing) return bad("No phone login uses that number yet.", 404);
      await identityAdmin.updateUser(existing.id, { password: pin, app_metadata: { ...(existing.appMetadata || {}), ...PHONE_MARK } });
      await logEvent(user, "team", "resetPin", { detail: phone });
      return reply({ login: { phone, pin, reset: true } });
    }
    if (existing) return bad("That phone number already has a login. Use Reset PIN instead.");
    const name = clean(body?.name, 80);
    if (name.length < 2) return bad("Enter the owner's name.");
    const created = await identityAdmin.createUser({ email, password: pin, data: { user_metadata: { full_name: name, phone }, app_metadata: { ...PHONE_MARK } } });
    await s.setJSON("contact/" + created.id, { owner: name, phone, at: Date.now() });
    // Optionally hand them an existing nakamal right away.
    const give = clean(body?.id, 60);
    if (give) {
      const n = await getNak(give);
      if (n) await s.setJSON("nak/" + give, { ...n, owner: created.id, ownerEmail: undefined, updatedAt: Date.now() });
    }
    await logEvent(user, "team", "createLogin", { detail: phone + " (" + name + ")" });
    return reply({ login: { phone, pin } });
  }

  if (action === "assign") {
    // Move one nakamal (id) or all of an owner's nakamals (fromOwner) to another login, found by email or phone.
    const raw = clean(body?.email, 120);
    if (!raw) return bad("Enter the owner's email address or phone number.");
    const target = await findLogin(raw);
    if (!target) return bad("No login uses that yet. Ask the owner to sign up on the owner page, or create a phone login for them first.", 404);
    const naks = await readAll<Nakamal>("nak/");
    const fromOwner = clean(body?.fromOwner, 80), one = clean(body?.id, 60);
    const moving = [...naks.values()].filter((n) => (one ? n.id === one : fromOwner && n.owner === fromOwner));
    if (!moving.length) return bad("Nothing to move.");
    const oldOwners = new Set(moving.map((n) => n.owner));
    const targetEmail = isPhoneLogin(target.email) ? undefined : target.email;
    for (const n of moving) await s.setJSON("nak/" + n.id, { ...n, owner: target.id, ownerEmail: targetEmail, updatedAt: Date.now() });
    if (!(await s.get("contact/" + target.id))) {
      let c: any = null;
      for (const o of oldOwners) if (o && (c = await s.get("contact/" + o, { type: "json" }))) break;
      if (!c && one) c = (await getStatus(one)).contact || null;
      if (c) await s.setJSON("contact/" + target.id, { owner: c.owner, phone: c.phone, email: targetEmail, at: Date.now() });
    }
    await rebuildIndex();
    await logEvent(user, "team", "assign", { id: one || undefined, name: moving.length === 1 ? moving[0].name : moving.length + " nakamals", detail: raw });
    return reply({ moved: moving.length, to: isPhoneLogin(target.email) ? phoneDigits(target.email!.split("@")[0]) : target.email });
  }

  // The team adds a nakamal directly, e.g. one they already know, with or without an owner login.
  if (action === "addNakamal") {
    const r = sanitizeDetails(body);
    if (r.error) return bad(r.error);
    let owner: User | null = null;
    const raw = clean(body?.ownerLogin, 120);
    if (raw && !(owner = await findLogin(raw))) return bad("No login uses that email or phone yet. Leave it empty, or make a phone login first.", 404);
    const now = Date.now(), id = newId();
    const nak: Nakamal = {
      id, owner: owner ? owner.id : null, ownerEmail: owner && !isPhoneLogin(owner.email) ? owner.email : undefined,
      ...r.details!, ...sanitizeKava(body), prices: sanitizePrices(body?.prices), light: "closed", lightAt: null, note: clean(body?.note, 120),
      createdAt: now, updatedAt: now,
    };
    const cOwner = clean(body?.contact?.owner, 80), cPhone = clean(body?.contact?.phone, 30);
    const approve = !!body?.approve;
    await s.setJSON("nak/" + id, nak);
    await s.setJSON("status/" + id, {
      approved: approve, ...(approve ? { approvedAt: now } : {}),
      ...(cOwner || cPhone ? { contact: { owner: cOwner, phone: cPhone } } : {}),
      visit: approve ? { visited: true, visitedAt: now, date: vuDate(now), notes: "Added by the team" } : {},
    } satisfies Status);
    if (owner && (cOwner || cPhone) && !(await s.get("contact/" + owner.id))) await s.setJSON("contact/" + owner.id, { owner: cOwner, phone: cPhone, at: now });
    await rebuildIndex();
    await logEvent(user, "team", "addNakamal", { id, name: nak.name, detail: approve ? "on the map" : "waiting" });
    return reply({ added: id });
  }

  // Switch the light on many nakamals at once: all of them, or only those on the public map.
  if (action === "lightAll") {
    if (!["green", "amber", "closed"].includes(body?.light)) return bad("Choose a light.");
    const [naks, statuses] = await Promise.all([readAll<Nakamal>("nak/"), readAll<Status>("status/")]);
    const onlyLive = body?.scope !== "all";
    const now = Date.now(), changes: [Nakamal, Nakamal][] = [];
    let changed = 0;
    for (const n of naks.values()) {
      const live = !!statuses.get(n.id)?.approved;
      if (onlyLive && !live) continue;
      const next = { ...n, light: body.light, lightAt: now, updatedAt: now };
      await s.setJSON("nak/" + n.id, next); changed++;
      changes.push([n, next]);
    }
    await rebuildIndex();
    const job = Promise.allSettled(changes.map(([a, b]) => afterLightChange(a, b)));
    context?.waitUntil ? context.waitUntil(job) : await job;
    await logEvent(user, "team", "lightAll", { detail: body.light + " · " + changed + " nakamals" });
    return reply({ changed });
  }

  // Switch off a developer's API key (their requests stop working; webhooks stop too).
  if (action === "revokeKey") {
    const pre = clean(body?.keyId, 16);
    const keys = await readAll<ApiKey>("apikey/");
    const hit = [...keys.keys()].find((h) => h.startsWith(pre));
    if (!pre || !hit) return bad("Unknown key.", 404);
    await s.setJSON("apikey/" + hit, { ...keys.get(hit)!, revoked: !body?.restore ? true : false });
    await deletePrefix(`hook/${hit}/`);
    await logEvent(user, "team", "revokeKey", { detail: keys.get(hit)!.name });
    return reply();
  }
  if (action === "removeSpecial") {
    const nid = clean(body?.id, 60), sid = clean(body?.specialId, 40);
    await s.delete(`special/${nid}/${sid}`);
    await logEvent(user, "team", "removeSpecial", { id: nid, name: (await getNak(nid))?.name });
    await rebuildIndex();
    return reply();
  }

  // ----- accounts -----
  if (action === "editAccount" || action === "setPassword" || action === "deleteAccount") {
    const uid = clean(body?.userId, 80);
    const users = await allUsers();
    const target = users.find((u) => u.id === uid);
    if (!target) return bad("That account doesn't exist any more.", 404);
    if (action === "editAccount") {
      const owner = clean(body?.owner, 80), phone = clean(body?.phone, 30);
      const prev = (await s.get("contact/" + uid, { type: "json" })) as Contact | null;
      await s.setJSON("contact/" + uid, { ...(prev || {}), owner, phone, email: isPhoneLogin(target.email) ? undefined : target.email, at: Date.now() });
      if (typeof body?.profileName === "string") {
        const pr = ((await s.get("profile/" + uid, { type: "json" })) as Profile | null) || { name: "", avatar: null, updatedAt: 0 };
        await s.setJSON("profile/" + uid, { ...pr, name: clean(body.profileName, 60), updatedAt: Date.now() });
      }
      await logEvent(user, "team", "editAccount", { detail: target.email && !isPhoneLogin(target.email) ? target.email : owner });
      await rebuildIndex();
      return reply();
    }
    if (action === "setPassword") {
      if (isPhoneLogin(target.email)) {
        const pin = newPin();
        await identityAdmin.updateUser(uid, { password: pin, app_metadata: { ...(target.appMetadata || {}), ...PHONE_MARK } });
        await logEvent(user, "team", "resetPin", { detail: phoneDigits(target.email!.split("@")[0]) });
        return reply({ login: { phone: phoneDigits(target.email!.split("@")[0]), pin, reset: true } });
      }
      const pw = String(body?.password || "");
      if (pw.length < 8) return bad("The new password needs at least 8 characters.");
      await identityAdmin.updateUser(uid, { password: pw });
      await logEvent(user, "team", "setPassword", { detail: target.email });
      return reply({ passwordSet: target.email });
    }
    // deleteAccount
    if (uid === user.id) return bad("You can't delete the account you're logged in with.");
    if (isAdmin(target)) return bad("That's a team account. Take the email off ADMIN_EMAILS in Netlify first.");
    const theirs = [...(await readAll<Nakamal>("nak/")).values()].filter((n) => n.owner === uid);
    for (const n of theirs) body?.deleteNakamals ? await removeNakamal(n.id) : await unassignNakamal(n);
    await deleteImages(`avatar/${uid}/`);
    await Promise.all([s.delete("contact/" + uid), s.delete("profile/" + uid)]);
    await identityAdmin.deleteUser(uid);
    await rebuildIndex();
    await logEvent(user, "team", "deleteAccount", { detail: (isPhoneLogin(target.email) ? phoneDigits(target.email!.split("@")[0]) : target.email) + (theirs.length ? (body?.deleteNakamals ? " · nakamals deleted" : " · nakamals kept") : "") });
    return reply({ deletedAccount: true, nakamals: theirs.length });
  }

  const id = clean(body?.id, 60);
  const nak = id ? await getNak(id) : null;
  if (!nak) return bad("Unknown nakamal.", 404);
  const st = await getStatus(id);

  if (action === "visit") {
    const visit = { ...(st.visit || {}), date: clean(body?.date, 10), notes: clean(body?.notes, 200), visited: !!body?.visited, visitedAt: body?.visited ? (st.visit?.visitedAt || Date.now()) : null };
    await s.setJSON("status/" + id, { ...st, visit });
  } else if (action === "approve") {
    if (!st.visit?.visited) return bad("Tick “We visited” before approving.");
    await s.setJSON("status/" + id, { ...st, approved: true, approvedAt: Date.now() });
  } else if (action === "hide") {
    await s.setJSON("status/" + id, { ...st, approved: false });
  } else if (action === "light") {
    if (!["green", "amber", "closed"].includes(body?.light)) return bad("Choose a light.");
    const next = { ...nak, light: body.light, lightAt: Date.now(), updatedAt: Date.now() };
    await s.setJSON("nak/" + id, next);
    // Same as when the owner does it: history, "kava ready" alerts and developers' webhooks.
    await rebuildIndex();
    await afterLightChange(nak, next, context?.waitUntil?.bind(context));
  } else if (action === "clearReports") {
    await deletePrefix(`report/${id}/`);
  } else if (action === "removePhoto") {
    const pid = clean(body?.photoId, 60);
    await imgStore().delete(`photo/${id}/${pid}`);
    await s.setJSON("nak/" + id, { ...nak, photos: (nak.photos || []).filter((p) => p.id !== pid), updatedAt: Date.now() });
  } else if (action === "removeAvatar") {
    if (nak.owner) {
      await deleteImages(`avatar/${nak.owner}/`);
      const pr = (await s.get("profile/" + nak.owner, { type: "json" })) as Profile | null;
      if (pr) await s.setJSON("profile/" + nak.owner, { ...pr, avatar: null, updatedAt: Date.now() });
    }
  } else if (action === "delete") {
    await removeNakamal(id);
  } else if (action === "unassign") {
    if (nak.owner) await unassignNakamal(nak);
  } else if (action === "edit") {
    // The team can change anything on a nakamal's page, and the owner contact the team keeps.
    const r = sanitizeDetails(body);
    if (r.error) return bad(r.error);
    await s.setJSON("nak/" + id, {
      ...nak, ...r.details!, ...sanitizeKava(body), prices: sanitizePrices(body?.prices), note: clean(body?.note, 120), updatedAt: Date.now(),
    });
    if (body?.contact) {
      const c = { owner: clean(body.contact.owner, 80), phone: clean(body.contact.phone, 30) };
      if (nak.owner) {
        const prev = (await s.get("contact/" + nak.owner, { type: "json" })) as Contact | null;
        await s.setJSON("contact/" + nak.owner, { ...(prev || {}), ...c, at: Date.now() });
      } else await s.setJSON("status/" + id, { ...st, contact: c });
    }
  } else {
    return bad("Unknown action.");
  }
  const detail = action === "light" ? body.light : action === "visit" ? (body?.visited ? "visited" : body?.date ? "visit " + clean(body.date, 10) : "notes") : action === "assign" ? clean(body?.email, 120) : undefined;
  await logEvent(user, "team", action, { id, name: nak.name, detail });
  await rebuildIndex();
  return reply();
};

export const config: Config = { path: "/api/admin", method: ["GET", "POST"] };
