// Runs every 5 minutes: turns lights green or closed at the times owners scheduled,
// then makes any Facebook Page post that is due.
import type { Config } from "@netlify/functions";
import { logEvent, readAll, rebuildIndex, store, type Nakamal } from "../lib/data.mts";
import { afterLightChange } from "../lib/events.mts";
import { dueEvent, scheduleActive, type Schedule } from "../lib/schedule.mts";
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
    if (!due) continue;
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

export const config: Config = { schedule: "*/5 * * * *" };
