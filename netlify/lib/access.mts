// Which nakamals a login may edit.
//
// The list lives in the login's app_metadata.nakamals in Netlify Identity. Only the server (operator token) and
// the Netlify dashboard can change app_metadata; a user can never change it themselves, unlike user_metadata.
// The team grants a nakamal by approving it (or a claim, or assigning it) on /chief, which updates the list here;
// it can also be set by hand in Netlify → Identity → the user → app_metadata, e.g. { "nakamals": ["n123abc"] }.
// The owner function reads the list fresh from Identity before every write; it never trusts the browser.
import { admin as identityAdmin, type User } from "@netlify/identity";
import { readAll, store, type Nakamal, type Status } from "./data.mts";

const idsOf = (u: Pick<User, "appMetadata"> | null | undefined): string[] => {
  const v = (u?.appMetadata as any)?.nakamals;
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
};

// The current list, read from Identity now (not from the login token, which can be up to an hour old).
export async function editableIds(userId: string): Promise<Set<string>> {
  return new Set(idsOf(await identityAdmin.getUser(userId)));
}

async function change(userId: string, add: string[], remove: string[]) {
  const u = await identityAdmin.getUser(userId);
  const now = new Set(idsOf(u));
  const before = now.size + ":" + [...now].join(",");
  for (const id of add) now.add(id);
  for (const id of remove) now.delete(id);
  if (before === now.size + ":" + [...now].join(",")) return;
  await identityAdmin.updateUser(userId, { app_metadata: { ...(u.appMetadata || {}), nakamals: [...now] } });
}
// Never let a failed Identity call undo the team's action; it shows in the function log instead.
export const grantNakamal = (userId: string | null | undefined, nakId: string) =>
  userId ? change(userId, [nakId], []).catch((e) => console.error("grantNakamal", userId, nakId, e)) : Promise.resolve();
export const revokeNakamal = (userId: string | null | undefined, nakId: string) =>
  userId ? change(userId, [], [nakId]).catch((e) => console.error("revokeNakamal", userId, nakId, e)) : Promise.resolve();

// One-time move to the new rule: every owner keeps editing the approved nakamals they already own.
// Runs the first time the team opens /chief after this change. Owners of listings still waiting for approval get
// access when the team approves them, as for new ones.
export async function backfillAccess() {
  const s = store();
  if (await s.get("meta/access-v1")) return;
  const [naks, statuses] = await Promise.all([readAll<Nakamal>("nak/"), readAll<Status>("status/")]);
  const byOwner = new Map<string, string[]>();
  for (const n of naks.values()) {
    if (!n.owner || !statuses.get(n.id)?.approved) continue;
    (byOwner.get(n.owner) || byOwner.set(n.owner, []).get(n.owner)!).push(n.id);
  }
  let failed = 0;
  for (const [uid, ids] of byOwner) {
    try { await change(uid, ids, []); } catch (e) { failed++; console.error("backfillAccess", uid, e); }
  }
  if (!failed) await s.setJSON("meta/access-v1", { at: Date.now(), owners: byOwner.size });
}
