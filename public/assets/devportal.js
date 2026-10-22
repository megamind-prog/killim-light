// Developers page: embed builder, free API keys, usage dashboard and webhooks.
(() => {
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SITE = location.origin;

// ---------- embed builder ----------
const bf = $('builder');
function build() {
  const f = new FormData(bf), q = new URLSearchParams({ region: f.get('region'), lang: f.get('lang') });
  const spot = f.get('spot');
  if (spot) { const [lat, lng, zoom] = spot.split(','); q.set('lat', lat); q.set('lng', lng); q.set('zoom', zoom); }
  if (f.get('green')) q.set('light', 'green');
  const src = `/embed?${q}`, h = f.get('height');
  $('bPreview').src = src; $('bPreview').style.height = h + 'px';
  $('bCode').textContent = `<iframe src="${SITE}${src}"\n        width="100%" height="${h}" style="border:0;border-radius:12px"\n        loading="lazy" title="Killim Light: live nakamal map"></iframe>`;
}
bf.addEventListener('change', build); build();

// ---------- keys ----------
const call = async (path, opts = {}) => {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
};
const setMsg = (id, text, ok) => { const el = $(id); el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); };
$('keyForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await call('/api/v1/keys', { method: 'POST', body: JSON.stringify(Object.fromEntries(f)) });
    e.target.hidden = true;
    $('newKey').hidden = false;
    $('newKey').innerHTML = `<div class="keybox"><b>Your key</b><code id="theKey">${esc(r.key)}</code>
      <p class="hint">Copy it now and keep it somewhere safe: we only store a fingerprint, so we can't show it again.</p>
      <div class="row-btns"><button class="btn" type="button" id="copyKey">Copy key</button><button class="btn go" type="button" id="openDash">Open my dashboard</button></div></div>`;
    $('copyKey').onclick = () => navigator.clipboard.writeText(r.key).then(() => ($('copyKey').textContent = 'Copied ✓')).catch(() => {});
    $('openDash').onclick = () => { document.querySelector('#meForm [name=key]').value = r.key; loadDash(r.key); };
  } catch (err) { setMsg('keyMsg', err.message, false); }
};

// ---------- dashboard ----------
let current = null;
$('meForm').onsubmit = e => { e.preventDefault(); loadDash(new FormData(e.target).get('key').trim()); };
async function loadDash(key) {
  const d = $('dash');
  try {
    const me = await call('/api/v1/keys/me', { headers: { 'x-api-key': key } });
    current = key;
    const max = Math.max(1, ...me.usage.map(u => u.count)), total = me.usage.reduce((a, u) => a + u.count, 0);
    d.innerHTML = `<div class="dash">
      <p><b>${esc(me.name)}</b> · ${total} request${total === 1 ? '' : 's'} in the last 30 days</p>
      <div class="bars" role="img" aria-label="Requests per day">${me.usage.map(u => `<span style="height:${Math.round(u.count / max * 100)}%" title="${esc(u.day)}: ${u.count}"></span>`).join('')}</div>
      <div class="barlabels"><span>${esc(me.usage[0].day)}</span><span>${esc(me.usage.at(-1).day)}</span></div>
      <h3>Webhooks</h3>
      ${me.webhooks.length ? me.webhooks.map(h => `<div class="sprow"><div><b>${esc(h.url)}</b><div class="hint">${esc(h.events.join(', '))} · ${h.disabled ? 'paused after failures' : 'active'}${h.lastStatus != null ? ` · last reply ${h.lastStatus || 'no answer'}` : ''}</div></div>
        <div class="row-btns"><button class="btn" type="button" data-test="${esc(h.id)}">Send test</button><button class="btn danger" type="button" data-del="${esc(h.id)}">Delete</button></div></div>`).join('') : '<p class="hint">No webhooks yet.</p>'}
      ${me.webhooks.length < 3 ? `<form class="authform" id="hookForm">
        <label>Your https:// address<input class="field" name="url" type="url" required placeholder="https://your-app.example/killim"></label>
        <div class="row"><label class="check"><input type="checkbox" name="light" checked> light.changed</label><label class="check"><input type="checkbox" name="special" checked> special.created</label></div>
        <div class="row-btns"><button class="btn go" type="submit">Add webhook</button></div><p class="msg" id="hookMsg"></p></form>` : ''}
      <div id="hookSecret"></div></div>`;
    wireDash();
  } catch (err) { d.innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
}
function wireDash() {
  const H = { 'x-api-key': current };
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await call('/api/v1/webhooks/' + b.dataset.del, { method: 'DELETE', headers: H }); loadDash(current); });
  document.querySelectorAll('[data-test]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { const r = await call(`/api/v1/webhooks/${b.dataset.test}/test`, { method: 'POST', headers: H }); b.textContent = r.ok ? `Delivered ✓ (${r.status})` : `Failed (${r.status || 'no answer'})`; }
    catch (err) { b.textContent = err.message; }
  });
  const hf = $('hookForm'); if (!hf) return;
  hf.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(hf), events = [f.get('light') && 'light.changed', f.get('special') && 'special.created'].filter(Boolean);
    try {
      const r = await call('/api/v1/webhooks', { method: 'POST', headers: H, body: JSON.stringify({ url: f.get('url'), events }) });
      await loadDash(current);
      $('hookSecret').innerHTML = `<div class="keybox"><b>Signing secret for this webhook</b><code>${esc(r.secret)}</code><p class="hint">Shown once. Use it to check the x-killim-signature header.</p></div>`;
    } catch (err) { setMsg('hookMsg', err.message, false); }
  };
}
})();
