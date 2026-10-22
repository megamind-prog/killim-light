// Phone alerts ("Your favourite nakamal has kava ready"), using standard Web Push.
// Needs two environment variables on Netlify: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
// Without them, alerts are simply switched off and the rest of the site works as normal.
import webpush from "web-push";
import { readAll, store, type Nakamal } from "./data.mts";

export const pushKey = () => Netlify.env.get("VAPID_PUBLIC_KEY") || "";
const ready = () => {
  const pub = Netlify.env.get("VAPID_PUBLIC_KEY"), priv = Netlify.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:" + (Netlify.env.get("ADMIN_EMAILS") || "team@killimlight.vu").split(/[,\s]+/)[0], pub, priv);
  return true;
};

// Called when an owner switches a nakamal to green.
export async function notifyKavaReady(n: Nakamal) {
  if (!ready()) return 0;
  const subs = await readAll<{ sub: any; lang?: string }>(`push/${n.id}/`);
  const s = store();
  let sent = 0;
  await Promise.all([...subs].map(async ([key, v]) => {
    const title = v.lang === "en" ? `${n.name}: kava ready` : `${n.name}: kava i redi`;
    const body = v.lang === "en" ? (n.note || "The light just turned green.") : (n.note || "Laet i jas tanem i grin.");
    try {
      await webpush.sendNotification(v.sub, JSON.stringify({ title, body, url: `/?n=${encodeURIComponent(n.id)}` }), { TTL: 3 * 3600 });
      sent++;
    } catch (e: any) {
      // The phone unsubscribed or the app was removed: forget it.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await s.delete(`push/${n.id}/${key}`);
    }
  }));
  return sent;
}

// Distance in km between two points.
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = Math.PI / 180, dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const AREA_QUIET_MS = 3 * 3600e3;   // at most one "near you" alert per phone every 3 hours

// "Alert me when any nakamal near me has kava ready": phones that chose an area (rounded to about 1 km).
export async function notifyArea(n: Nakamal) {
  if (!ready()) return 0;
  const subs = await readAll<{ sub: any; lat: number; lng: number; km: number; lang?: string; lastAt?: number }>("area/");
  const s = store(), now = Date.now();
  let sent = 0;
  await Promise.all([...subs].map(async ([key, v]) => {
    const d = kmBetween(v, n);
    if (d > (v.km || 3) || (v.lastAt && now - v.lastAt < AREA_QUIET_MS)) return;
    const dist = d < 1 ? `${Math.round(d * 10) * 100} m` : `${d.toFixed(1)} km`;
    const title = v.lang === "en" ? `Kava ready near you: ${n.name}` : `Kava i redi klosap long yu: ${n.name}`;
    const body = (n.note ? n.note + " · " : "") + dist;
    try {
      await webpush.sendNotification(v.sub, JSON.stringify({ title, body, url: `/?n=${encodeURIComponent(n.id)}` }), { TTL: 3 * 3600 });
      await s.setJSON(`area/${key}`, { ...v, lastAt: now });
      sent++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await s.delete(`area/${key}`);
    }
  }));
  return sent;
}

// A new special or event: tell the phones that follow this nakamal.
export async function notifySpecial(n: Nakamal, sp: { title: string; date: string; from?: string }) {
  if (!ready()) return 0;
  const subs = await readAll<{ sub: any; lang?: string }>(`push/${n.id}/`);
  const s = store();
  let sent = 0;
  await Promise.all([...subs].map(async ([key, v]) => {
    try {
      await webpush.sendNotification(v.sub, JSON.stringify({ title: `${n.name}: ${sp.title}`, body: `${sp.date}${sp.from ? " · " + sp.from : ""}`, url: `/?n=${encodeURIComponent(n.id)}` }), { TTL: 12 * 3600 });
      sent++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await s.delete(`push/${n.id}/${key}`);
    }
  }));
  return sent;
}
