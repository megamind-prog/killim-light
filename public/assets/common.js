// Shared by every page: lights, helpers, sharing, and the OpenStreetMap-based map of Vanuatu.
(() => {
const t = (k, v) => (window.KLi18n ? KLi18n.t(k, v) : k);
const baseMeta = document.querySelector('meta[name="kl-base"]');
const BASE = baseMeta ? baseMeta.content : '/';   // '/' on the real site; '' (relative) in the preview
const asset = p => BASE + 'assets/' + p;
const MAP_IMG = asset('portvila-osm.jpg');
const MAP_BOUNDS = [[-17.7591498, 168.2995605], [-17.7225262, 168.3380127]];   // detailed central Port Vila street map
const VANUATU_BOUNDS = [[-20.4, 166.4], [-13.0, 170.3]];
const REGIONS = {
  efate: { bounds: [[-17.85, 168.12], [-17.39, 168.62]] },
  santo: { bounds: [[-15.75, 166.5], [-14.6, 167.3]] },
  tanna: { bounds: [[-19.7, 169.1], [-19.3, 169.5]] },
  all:   { bounds: VANUATU_BOUNDS },
};
const ISLANDS = [['Efate', -17.655, 168.43, 'big'], ['Port Vila', -17.7334, 168.3200, 'town'], ['Nguna', -17.449, 168.351, 'isl'], ['Pele', -17.496, 168.407, 'isl'], ['Emao', -17.485, 168.486, 'isl'],
  ['Moso', -17.533, 168.26, 'isl'], ['Lelepa', -17.588, 168.211, 'isl'], ['Hat Island', -17.64, 168.154, 'isl'], ['Iririki', -17.7445, 168.3075, 'isl'],
  ['Espiritu Santo', -15.35, 166.85, 'big'], ['Luganville', -15.515, 167.18, 'town'], ['Malo', -15.68, 167.17, 'isl'], ['Tanna', -19.52, 169.33, 'big'], ['Lenakel', -19.53, 169.27, 'town'],
  ['Malekula', -16.2, 167.5, 'big'], ['Pentecost', -15.7, 168.18, 'big'], ['Ambae', -15.4, 167.85, 'big'], ['Maewo', -15.15, 168.12, 'big'], ['Epi', -16.7, 168.25, 'big'], ['Erromango', -18.8, 169.1, 'big'], ['Aneityum', -20.2, 169.78, 'isl'], ['Banks Islands', -14.0, 167.5, 'isl']];
// OpenStreetMap data: a light coastline for the whole country, then streets per island group, fetched only when you zoom in there.
const getJSON = f => fetch(asset(f)).then(r => r.ok ? r.json() : null).catch(() => null);
let land = null, osmIndex = null; const osmGroups = {};
const LAND_DATA = () => (land ||= getJSON('vanuatu-land.json'));
const OSM_INDEX = () => (osmIndex ||= getJSON('osm/index.json'));
const OSM_GROUP = id => (osmGroups[id] ||= getJSON('osm/' + id + '.json'));
const STREET_ZOOM = 9.5;
const ROAD = {
  pri: { c: '#f7fabf', k: '#c6c591', w: [2, 3, 4, 6, 9, 12, 15, 18], min: 9 },
  sec: { c: '#ffffff', k: '#c5c5c5', w: [1.4, 2.2, 3, 4.5, 7, 10, 13, 16], min: 9 },
  min: { c: '#ffffff', k: '#c9c3b8', w: [1, 1.5, 2, 3, 5, 8, 11, 14], min: 10.25 },
  res: { c: '#ffffff', k: '#c9c3b8', w: [.6, .9, 1.3, 2, 3.5, 6, 9, 12], min: 12 },
  svc: { c: '#ffffff', k: '#c9c3b8', w: [0, 0, .5, .8, 1.5, 3, 5, 7], min: 14 },
  trk: { c: '#a87d3c', dash: '4 3', w: [0, 0, .7, .9, 1.2, 1.6, 2, 2.5], min: 13 },
  riv: { c: '#aad3df', w: [.8, 1.2, 1.6, 2.2, 3, 4, 5, 6], min: 11 },
  str: { c: '#aad3df', w: [0, .6, .8, 1.1, 1.5, 2, 2.5, 3], min: 12 },
  rwy: { c: '#bbbbcc', w: [3, 5, 8, 14, 26, 50, 100, 200], min: 9 },
};
const ROAD_ORDER = ['riv', 'str', 'trk', 'svc', 'res', 'min', 'sec', 'pri', 'rwy'];
const wAt = (st, z) => st.w[Math.max(0, Math.min(7, Math.round(z) - 11))] * (z < 11 ? 0.6 : 1);

// ---------- lights ----------
const STALE_MS = 14 * 3600e3, VU_OFFSET = 11 * 3600e3;
const SYM = { green: '', amber: '', closed: '✕', stale: '', reported: '!', pending: '' };
const LIGHT = new Proxy({}, { get: (_, k) => { const sh = t('ls.' + k); return { label: t('l.' + k), short: sh === 'ls.' + k ? t('l.' + k) : sh, sym: SYM[k] || '' }; } });
const num = v => typeof v === 'number' && isFinite(v);
// The first time the owner's usual closing time comes round after they set the light, the light counts as closed.
function autoClosedAt(n) {
  if (!n.closeTime || !num(n.lightAt)) return null;
  const [h, m] = n.closeTime.split(':').map(Number);
  const local = new Date(n.lightAt + VU_OFFSET);
  let at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - VU_OFFSET;
  if (at <= n.lightAt) at += 864e5;
  return at;
}
function lightOf(n, now = Date.now()) {
  if (n.light === 'closed' || !num(n.lightAt)) return 'closed';
  const ac = autoClosedAt(n);
  if (ac && now >= ac) return 'closed';
  if (now - n.lightAt >= STALE_MS) return 'stale';
  if (n.reports) return 'reported';
  return n.light;
}
function ago(ms) {
  if (!num(ms)) return '';
  const m = Math.max(0, Math.round((Date.now() - ms) / 6e4));
  if (m < 1) return t('ago.now');
  if (m < 60) return t('ago.min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('ago.hour', { n: h });
  return t('ago.day', { n: Math.round(h / 24) });
}
const vuTime = ms => { const d = new Date(ms + VU_OFFSET); const h = d.getUTCHours(), mm = String(d.getUTCMinutes()).padStart(2, '0'); return `${(h % 12) || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtClose = hhmm => { const [h, m] = hhmm.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const REP_WORD = { closed: 'rep.closed', nokava: 'rep.nokava', open: 'rep.open', location: 'rep.location' };
const reportWhat = r => { if (!r || !r.kinds) return ''; const top = Object.entries(r.kinds).sort((a, b) => b[1] - a[1])[0]; return top ? t(REP_WORD[top[0]]).toLowerCase() : ''; };
function updatedLine(n) {
  const l = lightOf(n);
  if (!num(n.lightAt)) return t('lightNever');
  const ac = autoClosedAt(n);
  if (l === 'closed' && n.light !== 'closed' && ac && Date.now() >= ac) return t('lightAutoClosed', { time: fmtClose(n.closeTime) });
  if (l === 'stale') return t('lightStale', { light: LIGHT[n.light].label.toLowerCase(), ago: ago(n.lightAt) });
  if (l === 'reported') return t('reportedWhy', { n: n.reports.count, what: reportWhat(n.reports) });
  return t(n.lightBy ? 'lightBy.' + n.lightBy : 'lightUpdated', { ago: ago(n.lightAt) }) + ((l === 'green' || l === 'amber') && n.closeTime ? ' · ' + t('closesAt', { time: fmtClose(n.closeTime) }) : '');
}

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const priceList = n => (Array.isArray(n.prices) ? n.prices : []).filter(p => p && p.item && p.price).slice(0, 8);
const starsText = v => '★★★★★'.slice(0, Math.round(v)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(v));
const directions = n => `https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lng}`;
const kavaLine = n => [n.kavaFrom && n.kavaFrom !== 'Other' ? t('kavaFrom', { i: n.kavaFrom }) : '', n.strength ? t('st.' + n.strength) : ''].filter(Boolean).join(' · ');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function deviceId() {
  let d = store.get('kl-device', null);
  if (!d) { d = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); store.set('kl-device', d); }
  return d;
}
// Distance in km between two points, for "near me".
function km(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtKm = d => (d < 1 ? `${Math.round(d * 1000 / 10) * 10} m` : `${d < 10 ? d.toFixed(1) : Math.round(d)} km`);
function locate() {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(new Error('none'));
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), no, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el); toastTimer = setTimeout(() => el.remove(), 3400);
}
function setMsg(id, text, ok) { const el = $(id); if (!el) return; el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); }

async function api(path, body) {
  const r = await fetch(path, body === undefined ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error((data && data.error) || t('netError')); e.status = r.status; throw e; }
  return data;
}

// ---------- light schedule editor (owner page and team page) ----------
// days[0] = Sunday ... days[6] = Saturday; each null, { on, off } or { allDay: true } (open 24 hours).
const wdNames = () => t('wd').split(',');
function schedText(days) {
  if (days.every(d => d && d.allDay)) return t('sched247');
  const wd = wdNames();
  return days.map((d, i) => d ? `${wd[i]} ${d.allDay ? t('sched24short') : d.on + '–' + d.off}` : null).filter(Boolean).join(' · ');
}
function schedGridHtml(days) {
  const wd = wdNames();
  return `<div class="schedgrid s4">
      <span></span><b>${esc(t('sched24'))}</b><b>${esc(t('schedOpen'))}</b><b>${esc(t('schedClose'))}</b>
      ${wd.map((name, i) => { const d = days[i], all = !!(d && d.allDay), timed = d && !all; return `<label class="check"><input type="checkbox" data-day="${i}" ${d ? 'checked' : ''}>${esc(name)}</label>
        <label class="check" title="${esc(t('sched24'))}"><input type="checkbox" data-all="${i}" ${all ? 'checked' : ''} ${d ? '' : 'disabled'} aria-label="${esc(name)} ${esc(t('sched24'))}"></label>
        <input class="field" type="time" data-on="${i}" value="${esc(timed ? d.on : '17:00')}" ${timed ? '' : 'disabled'} aria-label="${esc(name)} ${esc(t('schedOpen'))}">
        <input class="field" type="time" data-off="${i}" value="${esc(timed ? d.off : '23:00')}" ${timed ? '' : 'disabled'} aria-label="${esc(name)} ${esc(t('schedClose'))}">`; }).join('')}
    </div>
    <div class="row-btns"><button class="btn" type="button" data-sched="copy">${esc(t('schedCopy'))}</button><button class="btn" type="button" data-sched="247">🕛 ${esc(t('sched247btn'))}</button></div>`;
}
function wireSchedGrid(f) {
  const q = (k, i) => f.querySelector(`[data-${k}="${i}"]`);
  const sync = i => { const on = q('day', i).checked, all = q('all', i).checked; q('all', i).disabled = !on; q('on', i).disabled = q('off', i).disabled = !on || all; };
  for (let i = 0; i < 7; i++) { q('day', i).onchange = q('all', i).onchange = () => sync(i); }
  f.querySelector('[data-sched="copy"]').onclick = () => {
    const first = [0, 1, 2, 3, 4, 5, 6].find(i => q('day', i).checked); if (first === undefined) return;
    for (let i = 0; i < 7; i++) if (q('day', i).checked) { q('all', i).checked = q('all', first).checked; q('on', i).value = q('on', first).value; q('off', i).value = q('off', first).value; sync(i); }
  };
  f.querySelector('[data-sched="247"]').onclick = () => { for (let i = 0; i < 7; i++) { q('day', i).checked = q('all', i).checked = true; sync(i); } };
}
const readSchedGrid = f => [0, 1, 2, 3, 4, 5, 6].map(i => {
  const q = k => f.querySelector(`[data-${k}="${i}"]`);
  return !q('day').checked ? null : q('all').checked ? { allDay: true } : { on: q('on').value, off: q('off').value };
});

// ---------- sharing ----------
const shareUrl = n => location.origin + BASE + 'n/' + encodeURIComponent(n.id);
async function shareNakamal(n) {
  const url = shareUrl(n), text = t('shareText', { name: n.name, light: LIGHT[lightOf(n)].label });
  if (navigator.share) { try { await navigator.share({ title: n.name, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  shareSheet(n, url, text);
}
// Tonight's lights for the whole map (the Facebook Page posts the same link every evening).
async function shareTonight() {
  const url = location.origin + BASE + 'tonight', text = t('shareTonightText');
  if (navigator.share) { try { await navigator.share({ title: 'Killim Light', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  shareSheet({ name: t('tonight') }, url, text);
}
function shareSheet(n, url, text) {
  document.querySelector('.sheet')?.remove();
  const el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', t('share'));
  el.innerHTML = `<div class="sheetbox"><h3>${esc(t('share'))}: ${esc(n.name)}</h3>
    <a class="btn fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Facebook</a>
    <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}" target="_blank" rel="noopener">WhatsApp</a>
    <div class="prow2"><input class="field" readonly value="${esc(url)}" aria-label="Link"><button class="btn" type="button" data-copy>${esc(t('copyLink'))}</button></div>
    <button class="link" type="button" data-close>${esc(t('cancel'))}</button></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', async e => {
    if (e.target === el || e.target.closest('[data-close]')) return el.remove();
    if (e.target.closest('[data-copy]')) {
      const input = el.querySelector('input');
      try { await navigator.clipboard.writeText(url); toast(t('copied')); } catch { input.select(); }
    }
  });
}

// ---------- pictures ----------
// Shrink a phone photo to a JPEG before upload (saves mobile data). square=true crops the centre for a profile picture.
async function resizeToJpeg(file, max = 1600, square = false) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("That file isn't a picture this phone can open. Try a JPEG or PNG photo.");
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  return { blob, w, h };
}
async function uploadImage(kind, id, file) {
  const { blob, w, h } = await resizeToJpeg(file, kind === 'avatar' ? 512 : 1600, kind === 'avatar');
  const q = new URLSearchParams({ kind }); if (id) q.set('id', id);
  const send = () => fetch(BASE + 'api/upload?' + q, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg', 'x-width': w, 'x-height': h }, body: blob });
  let r = await send();
  if (r.status === 401 && window.KLAuth) { try { await KLAuth.refreshSession(); } catch {} r = await send(); }
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error((data && data.error) || t('netError'));
  return data;
}

// ---------- map ----------
const pinIcon = (l, sel) => L.divIcon({ className: `pin l-${l} ${sel ? 'sel' : ''}`, html: `<div>${SYM[l] || ''}</div>`, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14] });

// ---------- map layers: our own map, detailed streets, satellite (with or without labels) ----------
// Satellite: sharp Esri pictures when the team has added an Esri key (ESRI_API_KEY on Netlify), otherwise free
// Sentinel-2 cloudless pictures from EOX (fine for towns and roads, blurry for single buildings).
let MAP_CFG = null;
const mapConfig = () => (MAP_CFG ||= fetch(BASE + 'api/mapconfig').then(r => r.ok ? r.json() : {}).catch(() => ({})));
const BASES = ['killim', 'streets', 'sat', 'satlabels'];
function tileFor(kind, cfg) {
  if (kind === 'streets') return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' });
  if (cfg && cfg.esriKey && !cfg.esriFailed) return L.tileLayer('https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=' + encodeURIComponent(cfg.esriKey), { maxZoom: 19, maxNativeZoom: 18,
    attribution: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> · Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community' });
  return L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg', { maxZoom: 19, maxNativeZoom: 15,
    attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2023)' });
}

function makeMap(el, opts = {}) {
  const start = opts.region && REGIONS[opts.region] ? REGIONS[opts.region].bounds : REGIONS.efate.bounds;
  delete opts.region;
  const layersOpt = opts.layers; delete opts.layers;
  const m = L.map(el, { maxBounds: L.latLngBounds(VANUATU_BOUNDS).pad(0.15), maxBoundsViscosity: 0.8, minZoom: 6, maxZoom: 18, zoomSnap: 0.25, attributionControl: false, preferCanvas: true, ...opts });
  el.style.background = '#aad3df';
  const rnd = L.canvas({ padding: 0.3 });
  const town = L.imageOverlay(MAP_IMG, MAP_BOUNDS, { alt: 'OpenStreetMap street map of central Port Vila', zIndex: 5 });
  const islandLabels = L.layerGroup(ISLANDS.map(([name, lat, lng, k]) => L.marker([lat, lng], { interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'place ' + k, html: `<span>${name}</span>`, iconSize: [0, 0] }) })));
  const groups = [];     // loaded island groups: { layers, places }
  const asked = new Set();
  const fills = [];      // land and lake shapes: hidden when pictures (streets or satellite) are shown underneath
  let base = 'killim', tiles = null;
  const showFills = () => base === 'killim';
  const keep = l => { fills.push(l); if (showFills()) l.addTo(m); return l; };
  // The whole country: OpenStreetMap coastline, simplified.
  LAND_DATA().then(d => { if (d && document.body.contains(el)) { const l = keep(L.polygon(d, { renderer: rnd, interactive: false, stroke: false, fillColor: '#f2efe9', fillOpacity: 1 })); showFills() && l.bringToBack(); } });
  const lab = (d, cls) => L.layerGroup(d.places.filter(p => cls.includes(p[0])).map(([kind, name, lat, lng]) =>
    L.marker([lat, lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'place ' + kind, html: `<span>${esc(name)}</span>`, iconSize: [0, 0] }) })));
  function addGroup(d) {
    if (!d || !document.body.contains(el)) return;
    keep(L.polygon(d.land, { renderer: rnd, interactive: false, stroke: false, fillColor: '#f2efe9', fillOpacity: 1 }));
    if (d.lines.lake) keep(L.polygon(d.lines.lake, { renderer: rnd, interactive: false, stroke: false, fillColor: '#aad3df', fillOpacity: 1 }));
    const layers = ROAD_ORDER.filter(k => d.lines[k]).map(k => {
      const st = ROAD[k];
      const casing = st.k ? L.polyline(d.lines[k], { renderer: rnd, interactive: false, color: st.k, lineCap: 'round', lineJoin: 'round' }) : null;
      const fill = L.polyline(d.lines[k], { renderer: rnd, interactive: false, color: st.c, dashArray: st.dash, lineCap: st.dash ? 'butt' : 'round', lineJoin: 'round', opacity: 1 });
      return { k, st, casing, fill };
    });
    const places = [[lab(d, ['town']), 10, 15], [lab(d, ['village', 'suburb']), 10.25, 99], [lab(d, ['hamlet', 'neighbourhood']), 13.5, 99],
      [lab(d, ['isl']), 11.5, 15], [lab(d, ['islet']), 13, 99]];
    groups.push({ layers, places });
    sync();
  }
  // Fetch the streets for any island group in view once you are zoomed in enough.
  function load() {
    if (!document.body.contains(el) || m.getZoom() < STREET_ZOOM) return;
    const view = m.getBounds().pad(0.25);
    OSM_INDEX().then(ix => (ix ? ix.groups : []).forEach(g => {
      if (asked.has(g.id) || !view.intersects(L.latLngBounds([g.bbox[0], g.bbox[1]], [g.bbox[2], g.bbox[3]]))) return;
      asked.add(g.id); OSM_GROUP(g.id).then(addGroup);
    }));
  }
  // Show more detail as you zoom in, like the OpenStreetMap site.
  function sync() {
    if (!document.body.contains(el)) return;
    const z = m.getZoom();
    const all = groups.flatMap(g => g.layers);
    // Detailed streets bring their own roads and names; satellite alone shows just the pictures.
    const roads = base === 'killim' || base === 'satlabels', names = roads;
    ROAD_ORDER.forEach(k => all.filter(l => l.k === k).forEach(({ st, casing, fill }) => {
      const w = wAt(st, z);
      if (!roads || z < st.min || w <= 0) { casing && m.removeLayer(casing); m.removeLayer(fill); return; }
      if (casing) { casing.setStyle({ weight: w + (z >= 14 ? 2 : 1) }); if (!m.hasLayer(casing)) casing.addTo(m); }
      fill.setStyle({ weight: w }); if (!m.hasLayer(fill)) fill.addTo(m);
    }));
    // Road fills always sit above every casing, so junctions look clean.
    ROAD_ORDER.forEach(k => all.filter(l => l.k === k).forEach(l => m.hasLayer(l.fill) && l.fill.bringToFront()));
    groups.forEach(g => g.places.forEach(([pg, lo, hi]) => (names && z >= lo && z < hi ? pg.addTo(m) : m.removeLayer(pg))));
    base === 'killim' && z >= 15 ? town.addTo(m) : m.removeLayer(town);
    base !== 'streets' && z < 11.5 ? islandLabels.addTo(m) : m.removeLayer(islandLabels);
    el.classList.toggle('onsat', base === 'sat' || base === 'satlabels');
    // Island names for the whole country only make sense zoomed right out.
    islandLabels.eachLayer(mk => { const el2 = mk.getElement && mk.getElement(); if (el2) el2.style.display = (z < 8.5 && !/big|town/.test(el2.className)) ? 'none' : ''; });
  }
  m.on('moveend', load);
  m.on('zoomend', sync);
  // Switch between our map, detailed streets and satellite. The choice is remembered on this phone.
  const attrib = L.control.attribution({ prefix: false });
  m.setBase = async kind => {
    if (!BASES.includes(kind)) kind = 'killim';
    base = kind;
    if (tiles) { m.removeLayer(tiles); tiles = null; }
    if (kind !== 'killim') {
      const t2 = tileFor(kind === 'satlabels' ? 'sat' : kind, kind === 'streets' ? null : await mapConfig());
      if (base !== kind) return;                       // changed again while waiting
      if (!attrib._map) attrib.addTo(m);               // before the pictures, so their credit leaves with them
      tiles = t2.addTo(m);
      // If Esri stops answering (key expired, monthly allowance used up), switch to the free EOX pictures
      // instead of showing grey squares. Remembered until the page is reloaded.
      if (kind !== 'streets' && /arcgis/.test(t2._url)) {
        let ok = 0, bad = 0;
        t2.on('tileload', () => { ok++; });
        t2.on('tileerror', async () => {
          if (++bad < 3 || ok > bad || tiles !== t2) return;
          const cfg = await mapConfig(); cfg.esriFailed = true;
          if (tiles === t2) m.setBase(base);
        });
      }
    }
    fills.slice().reverse().forEach(l => (showFills() ? (l.addTo(m), l.bringToBack()) : m.removeLayer(l)));
    sync();
    m.fire('basechange', { base: kind });
  };
  m.getBase = () => base;
  if (layersOpt !== false) {
    const Ctl = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
      const box = L.DomUtil.create('div', 'layerctl');
      box.innerHTML = `<button type="button" class="layerbtn" aria-expanded="false" aria-label="${esc(t('mapLayers'))}" title="${esc(t('mapLayers'))}">🗺️</button>
        <div class="layermenu" role="menu" hidden>${BASES.map(k => `<button type="button" role="menuitemradio" data-base="${k}">${esc(t('layer.' + k))}</button>`).join('')}</div>`;
      L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
      const btn = box.querySelector('.layerbtn'), menu = box.querySelector('.layermenu');
      const mark = () => menu.querySelectorAll('[data-base]').forEach(b => b.setAttribute('aria-checked', b.dataset.base === base));
      btn.onclick = () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', !menu.hidden); mark(); };
      menu.onclick = e => { const b = e.target.closest('[data-base]'); if (!b) return; store.set('kl-base', b.dataset.base); m.setBase(b.dataset.base); menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
      m.on('basechange', mark);
      return box;
    } });
    new Ctl().addTo(m);
  }
  const saved = layersOpt === false ? 'killim' : store.get('kl-base', 'killim');
  if (saved !== 'killim') m.setBase(saved);
  m.fitBounds(start);
  m.showRegion = r => m.flyToBounds((REGIONS[r] || REGIONS.efate).bounds, { duration: .8 });
  // Fly to one island group from the OpenStreetMap index (bbox = [south, west, north, east]), or the whole country.
  m.showIsland = (g, animate = true) => {
    const b = g ? [[g.bbox[0], g.bbox[1]], [g.bbox[2], g.bbox[3]]] : VANUATU_BOUNDS;
    // On phones the list panel covers the bottom of the map: keep the island above it.
    const under = matchMedia('(max-width: 899px)').matches && document.querySelector('.side') ? 200 : 16;
    const pad = { paddingTopLeft: [16, 60], paddingBottomRight: [16, under] };
    animate ? m.flyToBounds(b, { duration: .8, ...pad }) : m.fitBounds(b, pad);
  };
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { if (m._loaded && document.body.contains(el)) m.invalidateSize(); });
    ro.observe(el); m.on('unload', () => ro.disconnect());
  }
  return m;
}

// A map where the owner taps or drags a pin to set the nakamal's location.
function makePicker(el, textEl, start, locBtn) {
  const picker = makeMap(el, { region: start && num(start[0]) ? null : 'efate' });
  let marker = null, value = null;
  const place = ll => {
    if (!L.latLngBounds(VANUATU_BOUNDS).contains(ll)) { textEl.textContent = t('pinOff'); return; }
    value = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
    if (!marker) {
      marker = L.marker(ll, { draggable: true, icon: pinIcon('green', true) }).addTo(picker);
      marker.on('dragend', () => place(marker.getLatLng()));
    } else marker.setLatLng(ll);
    textEl.textContent = t('pinPlaced');
  };
  if (start && num(start[0])) { place(L.latLng(start[0], start[1])); picker.setView(start, 15); }
  picker.on('click', e => place(e.latlng));
  if (locBtn) locBtn.onclick = async () => {
    textEl.textContent = t('locating');
    try { const p = await locate(); place(L.latLng(p.lat, p.lng)); picker.setView([p.lat, p.lng], 17); }
    catch { textEl.textContent = t('locDenied'); }
  };
  return { get value() { return value; }, remove: () => picker.remove() };
}

// Installable app: register the offline helper (real site only).
if ('serviceWorker' in navigator && BASE === '/' && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

window.KL = { t, BASE, asset, resizeToJpeg, uploadImage, $, esc, clean, num, LIGHT, lightOf, autoClosedAt, ago, vuTime, fmtClose, updatedLine, reportWhat,
  priceList, starsText, directions, kavaLine, store, deviceId, km, fmtKm, locate, toast, setMsg, api, shareNakamal, shareUrl, shareTonight, schedText, schedGridHtml, wireSchedGrid, readSchedGrid,
  makeMap, makePicker, pinIcon, REGIONS, osmIndex: OSM_INDEX };
})();
