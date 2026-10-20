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
