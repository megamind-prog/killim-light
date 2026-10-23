// Runs every 10 minutes: turns lights green or closed at the times owners scheduled,
// then makes any Facebook Page post that is due.
import type { Config } from "@netlify/functions";
import { logEvent, readAll, rebuildIndex, store, type Nakamal } from "../lib/data.mts";
import { afterLightChange } from "../lib/events.mts";
import { allDayToday, dueEvent, scheduleActive, REFRESH_MS, type Schedule } from "../lib/schedule.mts";
import { runSocial } from "../lib/social.mts";

export default async () => {
  const naks = await readAll<Nakamal & { schedule?: Schedule; schedLast?: string }>("nak/");
  const s = store(), now = Date.now();
  let changed = 0;
  for (const n of naks.values()) {
    // The schedule runs once someone has confirmed the light: the owner (by using it or saving a schedule), or,
    // for listings with no owner yet, the team setting the light at least once. Until then only usual hours show.
    if (!scheduleActive(n)) continue;
    const due = dueEvent(n.schedule, now, n.schedLast);
    if (!due) {
      // A 24-hour nakamal: quietly re-confirm a green light every few hours so it never shows "no update today".
      if (n.light === "green" && allDayToday(n.schedule, now) && (!n.lightAt || now - n.lightAt >= REFRESH_MS)) {
        await s.setJSON("nak/" + n.id, { ...n, lightAt: now });
        changed++;
      }
      continue;
    }
    const next = n.light === due.light ? { ...n, schedLast: due.key } : { ...n, light: due.light, lightAt: now, updatedAt: now, schedLast: due.key };
    await s.setJSON("nak/" + n.id, next);
    if (n.light !== due.light) {
      changed++;
      await afterLightChange(n, next);
      await logEvent(null, "owner", "light", { id: n.id, name: n.name, detail: due.light, who: "⏰ schedule" });
    }
  }
  if (changed) await rebuildIndex();
  // Then the Facebook Page posts that are due (evening lights, Friday round-up, Monday tip).
  let posted: unknown[] = [];
  try { posted = await runSocial(now); } catch (e) { console.error("social", e); }
  return new Response(JSON.stringify({ changed, posted }), { headers: { "content-type": "application/json" } });
};

// Every 10 minutes: lights change on time within a few minutes, at half the cost of every 5.
export const config: Config = { schedule: "*/10 * * * *" };
