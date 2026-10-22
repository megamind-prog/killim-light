// Public page: map-first. On phones the list sits in a panel that slides up over the map; on computers it is a
// side panel. Islands, near me, share, ratings, "light is wrong" reports, favourite alerts, and the last lights
// kept on the phone for when the signal drops.
(() => {
const { t, BASE, $, esc, clean, LIGHT, lightOf, ago, updatedLine, priceList, starsText, directions, kavaLine, store, deviceId, km, fmtKm, locate,
  toast, setMsg, api, shareNakamal, makeMap, pinIcon, osmIndex } = KL;
const { applyStatic, langButton } = KLi18n;

let nakamals = new Map(), settings = { comments: false };
let loaded = false, built = 0, filter = 'all', query = '', sortBy = 'status', selected = null, openId = null, me = null;
let region = store.get('kl-region', 'efate');            // an island group id from the map index, or 'all'
let groups = [];                                          // [{ id, name, bbox: [s, w, n, e] }]
const favs = new Set(store.get('kl-favs', []));
let myRatings = store.get('kl-ratings', {});
const alerts = new Set(store.get('kl-alerts', []));
const device = deviceId();
if (!['all', 'green', 'fav', 'specials'].includes(filter)) filter = 'all';
// "More filters": price, kava island, strength, open late.
const more = { price: '', from: '', str: '', late: false };
const priceNum = n => { const m = (n.prices || []).map(p => parseInt(String(p.price).replace(/[^\d]/g, ''), 10)).filter(x => x > 0); return m.length ? Math.min(...m) : null; };
const lateOk = n => !!n.closeTime && (n.closeTime >= '23:00' || n.closeTime < '06:00');
const moreActive = () => [more.price, more.from, more.str, more.late].filter(Boolean).length;
const passMore = n => (!more.price || (priceNum(n) != null && priceNum(n) <= +more.price)) && (!more.from || n.kavaFrom === more.from)
  && (!more.str || n.strength === more.str) && (!more.late || lateOk(n));
function usualLine(n) {
  const d = n.schedule && n.schedule[new Date(Date.now() + 11 * 3600e3).getUTCDay()];
  return d ? t('usuallyToday', { on: d.on, off: d.off }) : t('usuallyNotToday');
}
const vuToday = () => new Date(Date.now() + 11 * 3600e3).toISOString().slice(0, 10);
function spWhen(sp) {
  const d = sp.date === vuToday() ? t('spToday') : sp.date === new Date(Date.now() + 35 * 3600e3).toISOString().slice(0, 10) ? t('spTomorrow') : sp.date.slice(5);
  return d + (sp.from ? ' ' + sp.from : '');
}

// ---------- slide-up panel (phones) ----------
const sheet = $('sheet'), grab = $('grab');
const phone = () => matchMedia('(max-width: 899px)').matches;
function setSheet(state) {
  sheet.dataset.state = state;
  grab.setAttribute('aria-expanded', state === 'open');
  grab.querySelector('b').textContent = t(state === 'open' ? 'hideList' : 'showList');
  if (state !== 'open') sheet.scrollTop = 0;
}
grab.onclick = () => setSheet(sheet.dataset.state === 'open' ? 'peek' : 'open');
$('headline').addEventListener('click', () => { if (phone() && sheet.dataset.state !== 'open') setSheet('open'); });
// Swipe the handle or the top of the panel up or down.
let y0 = null;
sheet.addEventListener('touchstart', e => { if (e.target.closest('.grab, .sidehead') && !e.target.closest('input, select, button:not(.grab)')) y0 = e.touches[0].clientY; }, { passive: true });
sheet.addEventListener('touchend', e => {
  if (y0 == null) return;
  const dy = e.changedTouches[0].clientY - y0; y0 = null;
  if (dy < -40) setSheet('open'); else if (dy > 40 && sheet.scrollTop <= 0) setSheet('peek');
});

// ---------- map ----------
// Lights only show once you're zoomed in to town or village level; further out, nakamals are plain dots.
const STATUS_ZOOM = 13;
const map = makeMap($('map'), { region: ['efate', 'santo', 'tanna'].includes(region) ? region : region === 'all' ? 'all' : 'efate' });
const markers = new Map();
let meMarker = null;
const near = () => map.getZoom() >= STATUS_ZOOM;
const farIcon = sel => L.divIcon({ className: `pin far ${sel ? 'sel' : ''}`, html: '<div></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
map.on('zoomend', () => { renderMap(); paintHint(); });
const paintHint = () => { $('zoomHint').hidden = near() || nakamals.size === 0; };

function popupHtml(n) {
  const l = lightOf(n);
  return `<div class="pop l-${l}"><h3>${esc(n.name)}</h3>${n.claimed === false && n.schedule ? `<span class="pill l-stale"><span class="dot"></span>${esc(usualLine(n))}</span>`
    : `<span class="pill"><span class="dot">${LIGHT[l].sym}</span>${LIGHT[l].label}</span>
    <div class="line">${esc(updatedLine(n))}</div>`}
    ${n.note ? `<div class="note">${esc(n.note)}</div>` : ''}
    <div class="popbtns"><button class="btn go" type="button" data-route="${esc(n.id)}">➜ ${esc(t('directions'))}</button>
    <button class="btn" type="button" data-pop="${esc(n.id)}">${esc(t('details'))}</button></div></div>`;
}
$('map').addEventListener('click', e => {
  const rb = e.target.closest('[data-route]');
  if (rb) { map.closePopup(); return startRoute(rb.dataset.route); }
  const b = e.target.closest('[data-pop]'); if (!b) return;
  map.closePopup();
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
    if (close) { if (!m.getPopup()) m.bindPopup('', { autoPanPaddingBottomRight: [20, phone() ? 220 : 20] }); m.setPopupContent(popupHtml(n)); }
    else if (m.getPopup()) { m.closePopup(); m.unbindPopup(); }
    m.setZIndexOffset(close ? (l === 'green' ? 1000 : l === 'amber' ? 500 : 0) : 0);
  }
}

// ---------- islands ----------
// Which island group a nakamal is on: the group whose map box holds it (nearest box if none).
const islandCache = new Map();
function islandOf(n) {
  if (!groups.length) return n.region;
  const key = n.lat + ',' + n.lng;
  if (islandCache.has(key)) return islandCache.get(key);
  const pad = 0.05;
  let hit = groups.find(g => n.lat >= g.bbox[0] - pad && n.lat <= g.bbox[2] + pad && n.lng >= g.bbox[1] - pad && n.lng <= g.bbox[3] + pad);
  if (!hit) hit = groups.reduce((a, g) => { const d = (n.lat - (g.bbox[0] + g.bbox[2]) / 2) ** 2 + (n.lng - (g.bbox[1] + g.bbox[3]) / 2) ** 2; return !a || d < a.d ? { g, d } : a; }, null)?.g;
  const id = hit ? hit.id : 'other';
  islandCache.set(key, id);
  return id;
}
const islandName = id => id === 'all' ? t('r.all') : (groups.find(g => g.id === id) || {}).name || id;
function paintIslands() {
  const sel = $('island');
  const count = id => [...nakamals.values()].filter(n => id === 'all' || islandOf(n) === id).length;
  sel.innerHTML = `<option value="all">${esc(t('r.all'))}${loaded ? ` (${count('all')})` : ''}</option>` +
    groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}${loaded && count(g.id) ? ` (${count(g.id)})` : ''}</option>`).join('');
  sel.value = groups.some(g => g.id === region) ? region : 'all';
}
$('island').addEventListener('change', e => {
  region = e.target.value; store.set('kl-region', region);
  map.showIsland(groups.find(g => g.id === region) || null);
  renderList();
});
osmIndex().then(ix => {
  groups = (ix && ix.groups) || [];
  if (region !== 'all' && !groups.some(g => g.id === region)) region = 'efate';
  if (!deepDone && !new URLSearchParams(location.search).get('n')) map.showIsland(groups.find(g => g.id === region) || null, false);
  paintIslands(); renderList();
});

// ---------- list ----------
let pendingList = false;
const inRegion = n => region === 'all' || islandOf(n) === region;
function renderList() {
  const rank = { green: 0, amber: 1, reported: 2, stale: 3, closed: 4 };
  const all = [...nakamals.values()], here = all.filter(inRegion);
  const items = here.filter(n => {
    const l = lightOf(n), text = ((n.name || '') + ' ' + (n.area || '')).toLowerCase();
    return (filter === 'all' || filter === l || (filter === 'fav' && favs.has(n.id)) || (filter === 'specials' && (n.specials || []).length)) && passMore(n) && (!query || text.includes(query));
  }).sort((A, B) => {
    if (sortBy === 'near' && me) return km(me, A) - km(me, B);
    if (sortBy === 'rating') return B.rating.avg - A.rating.avg || B.rating.count - A.rating.count || A.name.localeCompare(B.name);
    if (sortBy === 'name') return A.name.localeCompare(B.name);
    if (filter === 'specials') { const a = A.specials[0], b = B.specials[0]; return (a.date + a.from).localeCompare(b.date + b.from); }
    return rank[lightOf(A)] - rank[lightOf(B)] || A.name.localeCompare(B.name);
  });
  const ready = here.filter(n => lightOf(n) === 'green').length;
  $('headline').textContent = !loaded ? t('loading') : ready === 0 ? t('readyNone') : ready === 1 ? t('readyOne') : t('readyNow', { n: ready });
  $('headline').classList.toggle('none', loaded && ready === 0);
  $('subline').textContent = !loaded ? '' : region === 'all' ? t('readyOfAll', { b: here.length, n: here.length }) : t('readyOf', { b: here.length, n: here.length, r: islandName(region) });
  document.querySelectorAll('[data-f]').forEach(c => c.setAttribute('aria-pressed', c.dataset.f === filter));
  if (!loaded) return;
  const box = $('list');
  // Keep a half-typed review when the lights refresh.
  if (box.contains(document.activeElement) && document.activeElement.matches('textarea, input')) { pendingList = true; return; }
  box.innerHTML = items.length ? items.map(itemHtml).join('') : `<div class="empty">${all.length === 0 ? t('noneYet', { owner: BASE + 'owner' })
      : here.length === 0 ? t('noRegion', { r: esc(islandName(region)) }) : filter === 'fav' ? t('noFavs') : filter === 'specials' ? t('noSpecials') : t('noMatch')}</div>`;
  $('moreCount').hidden = !moreActive(); $('moreCount').textContent = moreActive();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingList && !$('list').contains(document.activeElement)) { pendingList = false; renderList(); } }, 50));

function itemHtml(n) {
  const l = lightOf(n), st = n.rating, ps = priceList(n), open = n.id === openId, kv = kavaLine(n);
  const facts = [kv, ps[0] ? `${ps[0].item} ${ps[0].price}` : '', st.count ? `★ ${st.avg.toFixed(1)} (${st.count})` : ''].filter(Boolean);
  const where = [n.area, me ? t('distance', { d: fmtKm(km(me, n)) }) : ''].filter(Boolean).join(' · ');
  return `<article class="item l-${l} ${n.id === selected ? 'sel' : ''} ${open ? 'open' : ''}" data-id="${esc(n.id)}" id="nk-${esc(n.id)}">
    <button class="itemmain" type="button" data-act="toggle" aria-expanded="${open}">
      <span class="itext">
        <span class="ititle"><span class="name">${esc(n.name)}</span></span>
        ${where ? `<span class="imeta">${esc(where)}</span>` : ''}
        ${n.claimed === false && n.schedule ? `<span class="istate"><span class="pill l-stale"><span class="dot"></span>${esc(usualLine(n))}</span></span>`
          : `<span class="istate"><span class="pill"><span class="dot">${LIGHT[l].sym}</span>${LIGHT[l].short}</span><span class="imeta">${esc(updatedLine(n))}</span></span>`}
        ${n.note ? `<span class="inote">${esc(n.note)}</span>` : ''}
        ${(n.specials || []).slice(0, filter === 'specials' ? 3 : 1).map(sp => `<span class="ispecial">${sp.kind === 'event' ? '🎶' : '📣'} <b>${esc(sp.title)}</b> · ${esc(spWhen(sp))}${filter === 'specials' && sp.text ? ` · ${esc(sp.text)}` : ''}</span>`).join('')}
        ${facts.length ? `<span class="ifacts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</span>` : ''}
      </span>
      ${n.photos && n.photos[0] ? `<img class="thumbimg" src="${esc(n.photos[0].url)}" alt="" loading="lazy">` : ''}
    </button>
    <div class="iactions">
      <button class="btn go" type="button" data-act="route">➜ ${esc(t('directions'))}</button>
      <button class="ibtn" type="button" data-act="map" aria-label="${esc(t('showOnMap'))}" title="${esc(t('showOnMap'))}">◎</button>
      <button class="ibtn" type="button" data-act="share" aria-label="${esc(t('share'))}" title="${esc(t('share'))}">↗</button>
      <button class="ibtn fav" type="button" data-fav aria-pressed="${favs.has(n.id)}" aria-label="${esc(t('favourite'))}" title="${esc(t('favourite'))}">${favs.has(n.id) ? '★' : '☆'}</button>
    </div>
    ${open ? detailsHtml(n, st, ps) : ''}
  </article>`;
}

function detailsHtml(n, st, ps) {
  const mine = myRatings[n.id];
  return `<div class="details">
    ${n.photos && n.photos.length ? `<div class="gallery" aria-label="Photos">${n.photos.map((p, i) => `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${i + 1}" loading="lazy"></a>`).join('')}</div>` : ''}
    ${n.host ? `<div class="profile"><div class="avatar">${n.host.avatar ? `<img src="${esc(n.host.avatar)}" alt="">` : '<span aria-hidden="true">👤</span>'}</div><div><h4>${esc(t('host'))}</h4><div class="note">${esc(n.host.name || t('theOwner'))}</div></div></div>` : ''}
    ${(n.specials || []).length ? `<div><h4>${esc(t('tabSpecials'))}</h4>${n.specials.map(sp => `<div class="spline">${sp.kind === 'event' ? '🎶' : '📣'} <b>${esc(sp.title)}</b> · ${esc(spWhen(sp))}${sp.to ? '–' + esc(sp.to) : ''}${sp.text ? `<div class="hint">${esc(sp.text)}</div>` : ''}</div>`).join('')}</div>` : ''}
    ${n.about ? `<p class="note">${esc(n.about)}</p>` : ''}
    <dl class="facts">
      ${kavaLine(n) ? `<div><dt>${esc(t('kava'))}</dt><dd>${esc(kavaLine(n))}</dd></div>` : ''}
      ${n.hours ? `<div><dt>${esc(t('hours'))}</dt><dd>${esc(n.hours)}</dd></div>` : ''}
      ${n.schedule ? `<div><dt>${esc(t('usualTimes'))}</dt><dd>${n.schedule.map((d, i) => d ? `${esc(t('wd').split(',')[i])} ${esc(d.on)}–${esc(d.off)}` : '').filter(Boolean).join('<br>')}</dd></div>` : ''}
    </dl>
    ${ps.length ? `<div><h4>${esc(t('prices'))}</h4><ul class="plist">${ps.map(p => `<li><span>${esc(p.item)}</span><span class="price">${esc(p.price)}</span></li>`).join('')}</ul></div>` : ''}
    ${n.claimed === false ? `<p class="hint">${esc(t('notConfirmed'))} <a class="link" href="${BASE}owner?claim=${encodeURIComponent(n.id)}">${esc(t('claimLink'))}</a></p>` : ''}
    <div class="row-btns">
      <button class="btn" type="button" data-act="alert" aria-pressed="${alerts.has(n.id)}">${esc(alerts.has(n.id) ? t('alertOn') : t('alertMe'))}</button>
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
    <button class="link small" type="button" data-act="report">${esc(t('isWrong'))}</button>
    <div class="reportbox" hidden>
      <h4>${esc(t('reportTitle'))}</h4>
      <div class="row-btns">${['closed', 'nokava', 'open', 'location'].map(k => `<button class="btn" type="button" data-report="${k}">${esc(t('rep.' + k))}</button>`).join('')}</div>
    </div>
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
  if (n && !inRegion(n)) { region = 'all'; store.set('kl-region', region); paintIslands(); }
  if (phone()) setSheet('open');
  renderList(); renderMap(); countView(id);
  if (scroll) requestAnimationFrame(() => document.getElementById('nk-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
function showOnMap(id) {
  const n = nakamals.get(id); if (!n) return;
  selected = id; renderList(); renderMap(); countView(id);
  if (phone()) setSheet('peek');
  map.flyTo([n.lat, n.lng], Math.max(map.getZoom(), 16), { duration: .5 });
  map.once('moveend', () => markers.get(id)?.openPopup());
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
  if (act === 'map') showOnMap(id);
  if (act === 'route') startRoute(id);
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

// ---------- directions inside the app, on our own road map ----------
const WALK = 4.5, DRIVE = 30;                 // km/h, rough Vanuatu averages
let routeLayer = null, routeFor = null, watchId = null, lastRoute = null, lastReroute = 0, lastHere = null;
let routeMode = store.get('kl-route-mode', 'drive');
const card = $('routeCard');
const mins = (m, kmh) => Math.max(1, Math.round(m / 1000 / kmh * 60));
function routeCardHtml(n, body, btns = '') {
  return `<div class="rchead"><b>${esc(t('routeTo', { name: n.name }))}</b><button class="ibtn" type="button" data-rc="end" aria-label="${esc(t('routeEnd'))}">✕</button></div>
    ${body}<div class="rcbtns">${btns}</div>
    <a class="link small" href="${directions(n)}" target="_blank" rel="noopener">${esc(t('routeOtherApp'))}</a>`;
}
function clearRoute() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  routeFor = null; lastRoute = null; card.hidden = true; document.body.classList.remove('routing');
}
function placeMe(p) {
  if (meMarker) meMarker.setLatLng([p.lat, p.lng]);
  else meMarker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'me', html: '<div></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false, zIndexOffset: 3000 }).addTo(map);
}
async function startRoute(id) {
  const n = nakamals.get(id); if (!n) return;
  clearRoute();
  routeFor = id; selected = id; renderList(); renderMap(); countView(id);
  if (phone()) setSheet('peek');
  document.body.classList.add('routing');
  card.hidden = false;
  card.innerHTML = routeCardHtml(n, `<p class="rcline">${esc(t('routeFinding'))}</p>`);
  let here;
  try { here = await locate(); me = here; placeMe(here); }
  catch { if (routeFor !== id) return; card.innerHTML = routeCardHtml(n, `<p class="rcline">${esc(t('routeLoc'))}</p>`, `<button class="btn go" type="button" data-rc="retry">${esc(t('routeRetry'))}</button>`); return; }
  if (routeFor !== id) return;
  await drawRoute(n, here, true);
}
async function drawRoute(n, here, fit) {
  const g = islandOf(n);
  if (groups.length && islandOf(here) !== g) {
    card.innerHTML = routeCardHtml(n, `<p class="rcline">${esc(t('routeIsland'))}</p>`);
    map.flyTo([n.lat, n.lng], 14); return;
  }
  lastHere = here;
  const r = await KLRoute.route(g, [here.lat, here.lng], [n.lat, n.lng], routeMode);
  if (routeFor !== n.id) return;
  if (!r) { card.innerHTML = routeCardHtml(n, `<p class="rcline">${esc(t('routeNone'))}</p>`); return; }
  lastRoute = r;
  if (routeLayer) map.removeLayer(routeLayer);
  const line = [[here.lat, here.lng], ...r.pts, [n.lat, n.lng]];
  routeLayer = L.layerGroup([
    L.polyline(r.pts, { color: '#ffffff', weight: 10, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false }),
    L.polyline(r.pts, { color: '#2f5bd3', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }),
    L.polyline([[here.lat, here.lng], r.pts[0]], { color: '#2f5bd3', weight: 3, dashArray: '2 7', interactive: false }),
    L.polyline([r.pts[r.pts.length - 1], [n.lat, n.lng]], { color: '#2f5bd3', weight: 3, dashArray: '2 7', interactive: false }),
  ]).addTo(map);
  if (fit) map.fitBounds(L.latLngBounds(line), { paddingTopLeft: [30, 70], paddingBottomRight: [30, phone() ? 330 : 270], maxZoom: 17 });
  paintRouteCard(n, r.total);
}
function paintRouteCard(n, left) {
  const r = lastRoute; if (!r) return;
  const off = r.offEnd > 150 ? `<p class="hint">${esc(t('routeOff', { d: fmtKm(r.offEnd / 1000) }))}</p>` : '';
  const following = watchId != null;
  card.innerHTML = routeCardHtml(n,
    `<div class="seg rcmode" role="group" aria-label="Walk or drive">${['walk', 'drive'].map(m => `<button type="button" data-mode="${m}" aria-pressed="${routeMode === m}">${esc(t('mode.' + m))}</button>`).join('')}</div>
     <p class="rcbig">${esc(following ? t('routeLeft', { d: fmtKm(left / 1000) }) : fmtKm(r.total / 1000))} <small>· ${esc(routeMode === 'walk' ? t('minWalk', { m: mins(left, WALK) }) : t('minDrive', { m: mins(left, DRIVE) }))}</small></p>
     <p class="hint">${esc(t(routeMode === 'walk' ? 'modeWalkHint' : 'modeDriveHint'))}</p>${off}
     <p class="hint">${esc(t('routeNote'))}</p>`,
    following ? `<span class="pill l-green"><span class="dot"></span>${esc(t('routeFollowing'))}</span>` : `<button class="btn go" type="button" data-rc="follow">${esc(t('routeFollow'))}</button>`);
}
// Follow me: keep the blue dot on the phone's position, count down the distance, re-plan if they take another road.
function follow() {
  const n = nakamals.get(routeFor); if (!n || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(async pos => {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    me = p; placeMe(p);
    map.panTo([p.lat, p.lng], { animate: true });
    const toGo = KLRoute.metres([p.lat, p.lng], [n.lat, n.lng]);
    if (toGo < 40) { const name = n.name; clearRoute(); toast(t('routeArrived', { name })); return; }
    const r = lastRoute;
    let nearest = Infinity, idx = 0;
    r.pts.forEach((q, i) => { const d = KLRoute.metres([p.lat, p.lng], q); if (d < nearest) { nearest = d; idx = i; } });
    if (nearest > 80 && Date.now() - lastReroute > 15000) { lastReroute = Date.now(); await drawRoute(n, p, false); return; }
    let left = r.offEnd;
    for (let i = idx; i < r.pts.length - 1; i++) left += KLRoute.metres(r.pts[i], r.pts[i + 1]);
    paintRouteCard(n, left + nearest);
  }, () => toast(t('locDenied')), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  map.setZoom(Math.max(map.getZoom(), 17));
  paintRouteCard(n, lastRoute.total);
}
card.addEventListener('click', e => {
  const md = e.target.closest('[data-mode]');
  if (md && md.dataset.mode !== routeMode) {
    routeMode = md.dataset.mode; store.set('kl-route-mode', routeMode);
    const n = nakamals.get(routeFor); if (n && lastHere) drawRoute(n, me || lastHere, watchId == null);
    return;
  }
  const b = e.target.closest('[data-rc]'); if (!b) return;
  const a = b.dataset.rc;
  if (a === 'end') clearRoute();
  if (a === 'retry' && routeFor) startRoute(routeFor);
  if (a === 'follow') follow();
});

// ---------- near me ----------
async function findMe(sort) {
  toast(t('locating'));
  try {
    me = await locate();
    placeMe(me);
    map.flyTo([me.lat, me.lng], 15, { duration: .8 });
    if (sort) { sortBy = 'near'; $('sort').value = 'near'; }
    region = 'all'; paintIslands(); renderList();
  } catch { toast(t('locDenied')); if (sortBy === 'near') { sortBy = 'status'; $('sort').value = 'status'; } }
}
$('locBtn').onclick = () => findMe(true);

document.querySelectorAll('[data-f]').forEach(c => c.addEventListener('click', () => { filter = c.dataset.f; renderList(); }));
$('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderList(); });
$('search').addEventListener('focus', () => { if (phone()) setSheet('open'); });
$('sort').addEventListener('change', e => { sortBy = e.target.value; if (sortBy === 'near' && !me) findMe(false); else renderList(); });

// ---------- more filters ----------
const ISL = ['Pentecost', 'Tanna', 'Malo', 'Santo', 'Ambae', 'Maewo', 'Epi', 'Malekula', 'Efate', 'Other'];
$('fFrom').insertAdjacentHTML('beforeend', ISL.map(i => `<option>${esc(i)}</option>`).join(''));
$('moreBtn').onclick = () => { const p = $('morePanel'); p.hidden = !p.hidden; $('moreBtn').setAttribute('aria-expanded', !p.hidden); if (phone() && !p.hidden) setSheet('open'); };
const readMore = () => { more.price = $('fPrice').value; more.from = $('fFrom').value; more.str = $('fStr').value; more.late = $('fLate').checked; renderList(); };
['fPrice', 'fFrom', 'fStr', 'fLate'].forEach(id => $(id).addEventListener('change', readMore));
$('fClear').onclick = () => { $('fPrice').value = $('fFrom').value = $('fStr').value = ''; $('fLate').checked = false; readMore(); };

// ---------- "alert me when kava is ready near me" ----------
let area = store.get('kl-area', null);          // { km, lat, lng } when switched on
let areaPicking = false;
function paintArea() {
  const b = $('areaBox');
  if (areaPicking) {
    b.innerHTML = `<div class="areapick"><b>${esc(t('areaPick'))}</b><div class="seg">${[1, 3, 10].map(k => `<button type="button" data-km="${k}" aria-pressed="false">${k} km</button>`).join('')}</div>
      <button class="link small" type="button" data-area="cancel">${esc(t('cancel'))}</button><p class="hint">${esc(t('areaNote'))}</p></div>`;
  } else b.innerHTML = area ? `<div class="areaon">${esc(t('areaOn', { km: area.km }))} <button class="link small" type="button" data-area="off">${esc(t('areaStop'))}</button></div>`
    : `<button class="arealink" type="button" data-area="on">${esc(t('areaOff'))}</button>`;
}
$('areaBox').addEventListener('click', async e => {
  const k = e.target.closest('[data-km]'), a = e.target.closest('[data-area]');
  if (a && a.dataset.area === 'on') { areaPicking = true; return paintArea(); }
  if (a && a.dataset.area === 'cancel') { areaPicking = false; return paintArea(); }
  if (a && a.dataset.area === 'off') {
    try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) await api('/api/push', { action: 'area-unsub', subscription: sub.toJSON() }); } catch {}
    area = null; store.set('kl-area', null); toast(t('areaStopped')); return paintArea();
  }
  if (!k) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || BASE !== '/') { areaPicking = false; paintArea(); return toast(t('alertNeedApp')); }
  try {
    const where = await locate();
    const { key } = await api('/api/push');
    if (!key) return toast(t('alertUnavailable'));
    if ((await Notification.requestPermission()) !== 'granted') return toast(t('alertDenied'));
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
    const r = await api('/api/push', { action: 'area-sub', subscription: sub.toJSON(), lat: where.lat, lng: where.lng, km: +k.dataset.km, lang: KLi18n.lang });
    area = { km: r.km, lat: r.lat, lng: r.lng }; store.set('kl-area', area); areaPicking = false;
    toast(t('areaSet')); paintArea();
  } catch { toast(t('locDenied')); }
});
paintArea();

// ---------- install as an app ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('installBtn').hidden = true; };

// ---------- language ----------
langButton(() => { renderList(); renderMap(); paintBanner(); paintIslands(); paintArea(); setSheet(sheet.dataset.state); });
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
let deepDone = false;
async function load() {
  try {
    const d = await api('/api/nakamals');
    take(d); offline = false;
    store.set('kl-last', { built: d.built, settings: d.settings, items: d.items });
  } catch {
    offline = true;
    if (!loaded) $('list').innerHTML = `<div class="empty">${esc(t('offlineNone'))}</div>`;
  }
  paintBanner(); paintIslands(); renderMap(); renderList(); paintHint();
  // Opened from a shared link (/?n=<id>) or an alert: open that nakamal once.
  const want = new URLSearchParams(location.search).get('n') || (location.hash.startsWith('#n-') ? location.hash.slice(3) : '');
  if (want && !deepDone && nakamals.has(want)) {
    deepDone = true;
    const n = nakamals.get(want);
    openDetails(want, true);
    map.setView([n.lat, n.lng], 16);
  }
}
// The "Near me" shortcut on the home-screen icon.
if (new URLSearchParams(location.search).get('near') === '1') findMe(true);
setSheet('peek');
renderMap(); renderList();
load();
setInterval(() => { if (!document.hidden) load(); else renderList(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
// Leaflet needs to know when its box changes size (rotating a phone, resizing a window).
addEventListener('resize', () => map.invalidateSize());
})();
