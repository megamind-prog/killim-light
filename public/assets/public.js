// Public page: live map + list, Bislama/English, islands, near me, share, ratings, "light is wrong" reports,
// favourite alerts, and the last lights kept on the phone for when the signal drops.
(() => {
const { t, BASE, $, esc, clean, LIGHT, lightOf, ago, updatedLine, priceList, starsText, directions, kavaLine, store, deviceId, km, fmtKm, locate,
  toast, setMsg, api, shareNakamal, makeMap, pinIcon, REGIONS } = KL;
const { applyStatic, langButton } = KLi18n;

let nakamals = new Map(), settings = { comments: false };
let loaded = false, built = 0, filter = 'all', query = '', sortBy = 'status', selected = null, openId = null, me = null;
let region = store.get('kl-region', 'efate');
const favs = new Set(store.get('kl-favs', []));
let myRatings = store.get('kl-ratings', {});
const alerts = new Set(store.get('kl-alerts', []));
const device = deviceId();

// ---------- map ----------
// Lights only show once you're zoomed in to town or village level; further out, nakamals are plain dots.
const STATUS_ZOOM = 13;
const map = makeMap($('map'), { region: REGIONS[region] ? region : 'efate' });
const markers = new Map();
let meMarker = null;
const near = () => map.getZoom() >= STATUS_ZOOM;
const farIcon = sel => L.divIcon({ className: `pin far ${sel ? 'sel' : ''}`, html: '<div></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
map.on('zoomend', () => { renderMap(); paintHint(); });
const paintHint = () => { $('zoomHint').hidden = near() || nakamals.size === 0; };

function popupHtml(n) {
  const l = lightOf(n), p = priceList(n)[0], kv = kavaLine(n);
  return `<div class="pop l-${l}">${n.photos && n.photos[0] ? `<img class="popimg" src="${esc(n.photos[0].url)}" alt="">` : ''}<h3>${esc(n.name)}</h3><span class="pill"><span class="dot">${LIGHT[l].sym}</span>${LIGHT[l].label}</span>
    <div class="line">${esc(updatedLine(n))}</div>
    ${n.note ? `<div class="note"><b>${esc(n.note)}</b></div>` : ''}
    ${kv ? `<div class="line">${esc(kv)}</div>` : ''}
    ${p ? `<div class="line">${esc(p.item)}: <span class="price">${esc(p.price)}</span></div>` : ''}
    ${n.rating.count ? `<div class="line"><span class="stars">${starsText(n.rating.avg)}</span> ${n.rating.avg.toFixed(1)} (${n.rating.count})</div>` : ''}
    <button class="link" type="button" data-pop="${esc(n.id)}">${esc(t('seeBelow'))}</button></div>`;
}
$('map').addEventListener('click', e => {
  const b = e.target.closest('[data-pop]'); if (!b) return;
  openDetails(b.dataset.pop, true);
});
function renderMap() {
  for (const [id, m] of markers) if (!nakamals.has(id)) { map.removeLayer(m); markers.delete(id); }
  const close = near();
  for (const [id, n] of nakamals) {
    const l = lightOf(n);
    let m = markers.get(id);
    const icon = close ? pinIcon(l, id === selected) : farIcon(id === selected);
    if (!m) {
      m = L.marker([n.lat, n.lng], { icon, title: n.name, keyboard: true }).addTo(map);
      m.on('click', () => {
        selected = id; renderList();
        // Zoomed out: tapping a dot zooms in to it, where its light shows.
        if (!near()) { map.closePopup(); map.flyTo([n.lat, n.lng], 15.5, { duration: .6 }); }
        else { renderMap(); countView(id); }
      });
      markers.set(id, m);
    } else { m.setLatLng([n.lat, n.lng]); m.setIcon(icon); }
    if (close) { if (!m.getPopup()) m.bindPopup(''); m.setPopupContent(popupHtml(n)); }
    else if (m.getPopup()) { m.closePopup(); m.unbindPopup(); }
    m.setZIndexOffset(close ? (l === 'green' ? 1000 : l === 'amber' ? 500 : 0) : 0);
  }
}

// ---------- list ----------
let pendingList = false;
const inRegion = n => region === 'all' || n.region === region;
function renderList() {
  const rank = { green: 0, amber: 1, reported: 2, stale: 3, closed: 4 };
  const all = [...nakamals.values()], here = all.filter(inRegion);
  const items = here.filter(n => {
    const l = lightOf(n), text = ((n.name || '') + ' ' + (n.area || '')).toLowerCase();
    return (filter === 'all' || filter === l || (filter === 'fav' && favs.has(n.id))) && (!query || text.includes(query));
  }).sort((A, B) => {
    if (sortBy === 'near' && me) return km(me, A) - km(me, B);
    if (sortBy === 'rating') return B.rating.avg - A.rating.avg || B.rating.count - A.rating.count || A.name.localeCompare(B.name);
    if (sortBy === 'name') return A.name.localeCompare(B.name);
    return rank[lightOf(A)] - rank[lightOf(B)] || A.name.localeCompare(B.name);
  });
  const ready = here.filter(n => lightOf(n) === 'green').length;
  $('count').textContent = !loaded ? t('loading') : t('countReady', { a: ready, b: here.length });
  document.querySelectorAll('[data-f]').forEach(c => c.setAttribute('aria-pressed', c.dataset.f === filter));
  document.querySelectorAll('[data-region]').forEach(c => c.setAttribute('aria-pressed', c.dataset.region === region));
  if (!loaded) return;
  const box = $('list');
  // Keep a half-typed review when the lights refresh.
  if (box.contains(document.activeElement) && document.activeElement.matches('textarea, input')) { pendingList = true; return; }
  box.innerHTML = items.length ? items.map(itemHtml).join('') : `<div class="empty">${all.length === 0 ? t('noneYet', { owner: BASE + 'owner' })
      : here.length === 0 ? t('noRegion', { r: t('r.' + region) }) : filter === 'fav' ? t('noFavs') : t('noMatch')}</div>`;
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingList && !$('list').contains(document.activeElement)) { pendingList = false; renderList(); } }, 50));

function itemHtml(n) {
  const l = lightOf(n), st = n.rating, ps = priceList(n), open = n.id === openId, kv = kavaLine(n);
  return `<article class="item l-${l} ${n.id === selected ? 'sel' : ''}" data-id="${esc(n.id)}" id="nk-${esc(n.id)}">
    ${n.photos && n.photos[0] ? `<img class="cover" src="${esc(n.photos[0].url)}" alt="${esc(n.name)}" loading="lazy">` : ''}
    <div class="top">
      <div class="grow"><h3 class="name">${esc(n.name)}</h3>${n.area ? `<div class="area">${esc(n.area)}${me ? ` · ${esc(t('distance', { d: fmtKm(km(me, n)) }))}` : ''}</div>` : me ? `<div class="area">${esc(t('distance', { d: fmtKm(km(me, n)) }))}</div>` : ''}</div>
      <button class="fav" data-fav aria-pressed="${favs.has(n.id)}" aria-label="${esc(t('favourite'))}: ${esc(n.name)}">${favs.has(n.id) ? '★' : '☆'}</button>
    </div>
    <div class="now"><span class="pill"><span class="dot">${LIGHT[l].sym}</span>${LIGHT[l].label}</span><span class="line">${esc(updatedLine(n))}</span></div>
    ${n.note ? `<div class="note"><b>${esc(n.note)}</b></div>` : ''}
    <div class="row-btns" style="align-items:center">
      ${kv ? `<span class="line">${esc(kv)}</span>` : ''}
      ${ps[0] ? `<span class="line">${esc(ps[0].item)} <span class="price">${esc(ps[0].price)}</span></span>` : ''}
      <span class="rating">${st.count ? `<span class="stars">${starsText(st.avg)}</span><b>${st.avg.toFixed(1)}</b>(${st.count})` : esc(t('noRatings'))}</span>
    </div>
    <div class="row-btns">
      <button class="btn" type="button" data-act="toggle" aria-expanded="${open}">${esc(open ? t('hideDetails') : t('details'))}</button>
      <button class="btn" type="button" data-act="map">${esc(t('showOnMap'))}</button>
      <a class="btn" href="${directions(n)}" target="_blank" rel="noopener">${esc(t('directions'))}</a>
      <button class="btn" type="button" data-act="share">${esc(t('share'))}</button>
    </div>
    ${open ? detailsHtml(n, st, ps) : ''}
  </article>`;
}

function detailsHtml(n, st, ps) {
  const mine = myRatings[n.id];
  return `<div class="details">
    ${n.photos && n.photos.length > 1 ? `<div class="gallery" aria-label="Photos">${n.photos.map((p, i) => `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${i + 1}" loading="lazy"></a>`).join('')}</div>` : ''}
    ${n.host ? `<div class="profile"><div class="avatar">${n.host.avatar ? `<img src="${esc(n.host.avatar)}" alt="">` : '<span aria-hidden="true">👤</span>'}</div><div><h4>${esc(t('host'))}</h4><div class="note">${esc(n.host.name || t('theOwner'))}</div></div></div>` : ''}
    ${n.about ? `<div><h4>${esc(t('about'))}</h4><p class="note" style="margin:4px 0 0">${esc(n.about)}</p></div>` : ''}
    ${kavaLine(n) ? `<div><h4>${esc(t('kava'))}</h4><div class="note">${esc(kavaLine(n))}</div></div>` : ''}
    ${ps.length ? `<div><h4>${esc(t('prices'))}</h4><ul class="plist">${ps.map(p => `<li><span>${esc(p.item)}</span><span class="price">${esc(p.price)}</span></li>`).join('')}</ul></div>` : ''}
    ${n.hours ? `<div><h4>${esc(t('hours'))}</h4><div class="note">${esc(n.hours)}</div></div>` : ''}
    <div class="row-btns">
      <button class="btn" type="button" data-act="alert" aria-pressed="${alerts.has(n.id)}">${esc(alerts.has(n.id) ? t('alertOn') : t('alertMe'))}</button>
      <button class="btn" type="button" data-act="report">${esc(t('wrongLight'))}</button>
    </div>
    <div class="reportbox" hidden>
      <h4>${esc(t('reportTitle'))}</h4>
      <div class="row-btns">${['closed', 'nokava', 'open', 'location'].map(k => `<button class="btn" type="button" data-report="${k}">${esc(t('rep.' + k))}</button>`).join('')}</div>
    </div>
    <div><h4>${esc(t('ratings'))}${st.count ? ` · ${esc(t('ratingsFrom', { avg: st.avg.toFixed(1), n: st.count }))}` : ''}</h4>
      ${settings.comments && st.recent.length ? st.recent.map(r => `<div class="review"><div><span class="stars">${starsText(r.stars)}</span></div>
        ${r.text ? `<div class="note">${esc(r.text)}</div>` : ''}<div class="who">${esc(ago(r.at))}</div></div>`).join('')
        : st.count ? '' : `<p class="hint" style="margin-top:4px">${esc(t('firstRate'))}</p>`}
    </div>
    <form class="rate" data-rate>
      <h4>${esc(mine ? t('yourRating') : t('rateThis'))}</h4>
      <div class="starpick" role="radiogroup" aria-label="Stars">${[1, 2, 3, 4, 5].map(s => `<button type="button" role="radio" data-star="${s}" aria-checked="${!!mine && mine.stars === s}" aria-label="${esc(t('stars', { n: s }))}" class="${mine && mine.stars >= s ? 'on' : ''}">★</button>`).join('')}</div>
      ${settings.comments ? `<label for="rv-${esc(n.id)}">${esc(t('comment'))}<textarea class="field" id="rv-${esc(n.id)}" maxlength="280" placeholder="${esc(t('commentPh'))}">${esc(mine ? mine.text : '')}</textarea></label>` : ''}
      <div class="row-btns"><button class="btn go" type="submit">${esc(mine ? t('updateRating') : t('postRating'))}</button>${mine ? `<button class="btn danger" type="button" data-act="unrate">${esc(t('removeRating'))}</button>` : ''}</div>
      <p class="msg" id="rmsg-${esc(n.id)}"></p>
      <p class="hint">${esc(t('rateNote'))}</p>
    </form>
  </div>`;
}

const seenToday = store.get('kl-seen', {});
function countView(id) {
  const day = new Date(Date.now() + 11 * 3600e3).toISOString().slice(0, 10);
  if (seenToday[id] === day) return;
  seenToday[id] = day; store.set('kl-seen', seenToday);
  api('/api/view', { id, device }).catch(() => {});
}
function openDetails(id, scroll) {
  openId = id; selected = id;
  const n = nakamals.get(id);
  if (n && !inRegion(n)) { region = 'all'; store.set('kl-region', region); }
  renderList(); renderMap(); countView(id);
  if (scroll) document.getElementById('nk-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const picked = {};
$('list').addEventListener('click', e => {
  const item = e.target.closest('.item'); if (!item) return;
  const id = item.dataset.id, n = nakamals.get(id);
  if (e.target.closest('[data-fav]')) { favs.has(id) ? favs.delete(id) : favs.add(id); store.set('kl-favs', [...favs]); return renderList(); }
  const s = e.target.closest('[data-star]');
  if (s) {
    picked[id] = +s.dataset.star;
    item.querySelectorAll('[data-star]').forEach(b => { const v = +b.dataset.star; b.classList.toggle('on', v <= picked[id]); b.setAttribute('aria-checked', v === picked[id]); });
    return;
  }
  const rp = e.target.closest('[data-report]');
  if (rp) return report(id, rp.dataset.report, item);
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'toggle') { openId === id ? (openId = null, renderList()) : openDetails(id, false); }
  if (act === 'map') {
    selected = id; renderList(); renderMap(); countView(id);
    $('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
    map.flyTo([n.lat, n.lng], Math.max(map.getZoom(), 16), { duration: .5 });
    map.once('moveend', () => markers.get(id)?.openPopup());
  }
  if (act === 'share') shareNakamal(n);
  if (act === 'unrate') rate(id, null, '');
  if (act === 'report') { const b = item.querySelector('.reportbox'); b.hidden = !b.hidden; }
  if (act === 'alert') toggleAlert(id);
});
$('list').addEventListener('submit', e => {
  const f = e.target.closest('[data-rate]'); if (!f) return;
  e.preventDefault();
  const id = f.closest('.item').dataset.id;
  const stars = picked[id] || (myRatings[id] && myRatings[id].stars);
  if (!stars) return setMsg('rmsg-' + id, t('pickStars'), false);
  const ta = f.querySelector('textarea');
  rate(id, stars, ta ? clean(ta.value, 280) : (myRatings[id] && myRatings[id].text) || '');
});
async function rate(id, stars, text) {
  try {
    const r = await api('/api/rate', { id, device, stars, text });
    if (stars) myRatings[id] = { stars, text }; else delete myRatings[id];
    store.set('kl-ratings', myRatings);
    delete picked[id];
    if (r.item) nakamals.set(id, r.item);
    document.activeElement?.blur?.();
    renderList(); renderMap();
    toast(stars ? t('thanksRating') : t('ratingRemoved'));
  } catch (err) { setMsg('rmsg-' + id, err.message, false); }
}
async function report(id, kind, item) {
  try { await api('/api/report', { id, device, kind }); item.querySelector('.reportbox').hidden = true; toast(t('reportThanks')); load(); }
  catch (err) { toast(err.message); }
}

// ---------- favourite alerts (web push) ----------
async function toggleAlert(id) {
  if (alerts.has(id)) {
    alerts.delete(id); store.set('kl-alerts', [...alerts]);
    try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) await api('/api/push', { action: 'unsub', id, subscription: sub.toJSON() }); } catch {}
    toast(t('alertOff')); return renderList();
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || BASE !== '/') return toast(t('alertNeedApp'));
  try {
    const { key } = await api('/api/push');
    if (!key) return toast(t('alertUnavailable'));
    if ((await Notification.requestPermission()) !== 'granted') return toast(t('alertDenied'));
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
    await api('/api/push', { action: 'sub', id, subscription: sub.toJSON(), lang: KLi18n.lang });
    alerts.add(id); store.set('kl-alerts', [...alerts]);
    if (!favs.has(id)) { favs.add(id); store.set('kl-favs', [...favs]); }
    toast(t('alertSet')); renderList();
  } catch { toast(t('alertNeedApp')); }
}
function urlB64(s) { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }

// ---------- near me ----------
async function findMe(sort) {
  toast(t('locating'));
  try {
    me = await locate();
    if (meMarker) meMarker.setLatLng([me.lat, me.lng]);
    else meMarker = L.circleMarker([me.lat, me.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#3552c4', fillOpacity: 1 }).addTo(map);
    map.flyTo([me.lat, me.lng], 15, { duration: .8 });
    if (sort) { sortBy = 'near'; $('sort').value = 'near'; }
    region = 'all'; renderList();
  } catch { toast(t('locDenied')); if (sortBy === 'near') { sortBy = 'status'; $('sort').value = 'status'; } }
}
$('locBtn').onclick = () => findMe(true);

document.querySelectorAll('[data-f]').forEach(c => c.addEventListener('click', () => { filter = c.dataset.f; renderList(); }));
document.querySelectorAll('[data-region]').forEach(c => c.addEventListener('click', () => { region = c.dataset.region; store.set('kl-region', region); map.showRegion(region); renderList(); }));
$('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderList(); });
$('sort').addEventListener('change', e => { sortBy = e.target.value; if (sortBy === 'near' && !me) findMe(false); else renderList(); });

// ---------- install as an app ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('installBtn').hidden = true; };

// ---------- language ----------
langButton(() => { renderList(); renderMap(); paintBanner(); });
applyStatic();

// ---------- live data: refresh every 30 seconds; keep the last copy on the phone ----------
let offline = false;
function paintBanner() {
  const b = $('offlineBanner');
  b.hidden = !offline;
  if (offline) b.textContent = loaded ? t('offline', { ago: ago(built) }) : '';
}
function take(d) {
  nakamals = new Map(d.items.map(n => [n.id, n]));
  settings = d.settings || settings; built = d.built || Date.now(); loaded = true;
}
const last = store.get('kl-last', null);
if (last && last.items) take(last);
async function load() {
  try {
    const d = await api('/api/nakamals');
    take(d); offline = false;
    store.set('kl-last', { built: d.built, settings: d.settings, items: d.items });
  } catch {
    offline = true;
    if (!loaded) $('list').innerHTML = `<div class="empty">${esc(t('offlineNone'))}</div>`;
  }
  paintBanner(); renderMap(); renderList(); paintHint();
  // Opened from a shared link (/?n=<id>) or an alert: open that nakamal once.
  const want = new URLSearchParams(location.search).get('n') || (location.hash.startsWith('#n-') ? location.hash.slice(3) : '');
  if (want && !deepDone && nakamals.has(want)) {
    deepDone = true;
    const n = nakamals.get(want);
    openDetails(want, true);
    map.setView([n.lat, n.lng], 16);
  }
}
let deepDone = false;
// The "Near me" shortcut on the home-screen icon.
if (new URLSearchParams(location.search).get('near') === '1') findMe(true);
renderMap(); renderList();
load();
setInterval(() => { if (!document.hidden) load(); else renderList(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
