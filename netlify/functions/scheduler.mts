// Runs every 5 minutes: turns lights green or closed at the times owners scheduled.
import type { Config } from "@netlify/functions";
import { logEvent, readAll, rebuildIndex, store, type Nakamal } from "../lib/data.mts";
import { afterLightChange } from "../lib/events.mts";
import { dueEvent, type Schedule } from "../lib/schedule.mts";

export default async () => {
  const naks = await readAll<Nakamal & { schedule?: Schedule; schedLast?: string }>("nak/");
  const s = store(), now = Date.now();
  let changed = 0;
  for (const n of naks.values()) {
    // Listings the team added without an owner only show their usual hours; nobody is there to confirm the kava.
    if (!n.owner || !(n as any).ownerUsedLight) continue;
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
  return new Response(JSON.stringify({ changed }), { headers: { "content-type": "application/json" } });
};

export const config: Config = { schedule: "*/5 * * * *" };
