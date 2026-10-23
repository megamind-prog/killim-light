// Owners' weekly light schedule: for each day, a time the light turns green and a time it closes.
// A closing time earlier than the opening time means after midnight (e.g. open 17:00, close 01:00).
// The schedule only acts at those moments, so an owner can still change the light by hand in between.
// A day can also be "open 24 hours" ({ allDay: true }): the light stays green all day (nakamals open 24/7).
export type DayPlan = { on: string; off: string; allDay?: boolean } | null;
export const ALL_DAY = { on: "00:00", off: "24:00", allDay: true } as const;
export const REFRESH_MS = 6 * 3600e3;   // a 24-hour light is re-confirmed this often so it never shows "no update"
export type Schedule = { enabled: boolean; days: DayPlan[] };   // days[0] = Sunday ... days[6] = Saturday
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const VU = 11 * 3600e3;
export const GRACE_MIN = 30;    // a run that was a little late still applies the event

export function sanitizeSchedule(body: any): { error?: string; schedule?: Schedule } {
  const days = Array.isArray(body?.days) ? body.days : [];
  if (days.length !== 7) return { error: "Send a plan for each day of the week." };
  const out: DayPlan[] = days.map((d: any) => (d && d.allDay ? { ...ALL_DAY } : d && HHMM.test(d.on) && HHMM.test(d.off) && d.on !== d.off ? { on: d.on, off: d.off } : null));
  const enabled = !!body?.enabled;
  if (enabled && !out.some(Boolean)) return { error: "Choose at least one day with times." };
  return { schedule: { enabled, days: out } };
}
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const dayKey = (ms: number) => new Date(ms + VU).toISOString().slice(0, 10);

// The scheduled change that is due now, if any: { light, key } where key stops it being applied twice.
export function dueEvent(s: Schedule | undefined, now: number, last?: string): { light: "green" | "closed"; key: string } | null {
  if (!s || !s.enabled) return null;
  const local = new Date(now + VU), wd = local.getUTCDay(), m = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = dayKey(now), yesterday = dayKey(now - 864e5);
  const cands: { at: number; light: "green" | "closed"; key: string }[] = [];
  const t = s.days[wd], y = s.days[(wd + 6) % 7];
  if (t && t.allDay) {
    // Open 24 hours today: green at any time of day (once), and nothing closes it.
    const key = `${today}@on`;
    return key !== last ? { light: "green", key } : null;
  }
  // The day after a 24-hour day closes at midnight, unless it has its own times.
  if (y && y.allDay) cands.push({ at: 0, light: "closed", key: `${today}@allday-end` });
  if (t) {
    cands.push({ at: mins(t.on), light: "green", key: `${today}@on` });
    if (mins(t.off) > mins(t.on)) cands.push({ at: mins(t.off), light: "closed", key: `${today}@off` });
  }
  // Yesterday's night that closes after midnight.
  if (y && !y.allDay && mins(y.off) < mins(y.on)) cands.push({ at: mins(y.off), light: "closed", key: `${yesterday}@off` });
  const due = cands.filter((c) => c.at <= m && m - c.at <= GRACE_MIN).sort((a, b) => b.at - a.at)[0];
  return due && due.key !== last ? { light: due.light, key: due.key } : null;
}

// Whether the light schedule may switch this nakamal's light.
export const scheduleActive = (n: { owner: string | null; lightAt: number | null; ownerUsedLight?: boolean }) =>
  n.owner ? !!n.ownerUsedLight : n.lightAt != null;

// Whether today (Vanuatu time) is an open-24-hours day in this schedule.
export function allDayToday(s: Schedule | undefined, now = Date.now()) {
  if (!s || !s.enabled) return false;
  return !!s.days[new Date(now + VU).getUTCDay()]?.allDay;
}
