// Team page (/chief): full control. Verify, add, edit and delete nakamals; see and manage every account;
// make phone + PIN logins; deal with customer reports; move nakamals between logins; switch comments on/off.
(() => {
const { t, $, esc, clean, LIGHT, updatedLine, reportWhat, directions, toast, makePicker, ago } = KL;
const { start, authed, signOut } = KLAuthUI;
const box = $('box');
const KAVA = ['Pentecost', 'Tanna', 'Malo', 'Santo', 'Ambae', 'Maewo', 'Epi', 'Malekula', 'Efate', 'Other'];
let list = [], accounts = [], log = [], devkeys = [], osm = [], social = null, myId = null, settings = { comments: false }, filter = 'all', lastLogin = null, drawer = null;
let view = 'today', addMode = 'many', bulk = [], bulkPicker = null, accSearch = '', nakSearch = '', editing = null, picker = null;

start({
  box, allowSignup: false, title: () => 'Team login', intro: () => 'For the Killim Light team only.',
  onUser: async user => {
    $('who').hidden = false;
    $('who').innerHTML = `<span>${esc(user.email || '')}</span> <button class="link" type="button" id="out">Log out</button>`;
    $('out').onclick = signOut;
    await reload();
    setInterval(() => { if (!document.hidden && !editing && view !== 'add' && !bulk.length && !box.contains(document.activeElement)) reload(true); }, 60000);
  },
});

async function reload(quiet) {
  try { const r = await authed('/api/admin'); take(r); myId = r.myId || myId; render(); }
  catch (e) {
    if (quiet) return;
    box.innerHTML = e.status === 403
      ? `<div class="card login"><h3>Team page</h3><p>This page is only for the Killim Light team. You're logged in with an account that isn't on the team list.</p><a class="btn" href="/">Open the nakamal map</a></div>`
      : `<div class="card"><h3>Couldn't load</h3><p class="hint">${esc(e.message)}</p><button class="btn" id="retry">Try again</button></div>`;
    if ($('retry')) $('retry').onclick = () => reload();
  }
}
async function act(body, okText) {
  try {
    const r = await authed('/api/admin', body);
    take(r);
    if (r.login) lastLogin = r.login;
    toast(okText || 'Saved'); render(); return r;
  } catch (e) { toast(e.message); return null; }
}

function take(r) { list = r.nakamals || list; accounts = r.accounts || accounts; log = r.log || log; devkeys = r.devkeys || devkeys; osm = r.osm || osm; social = r.social || social; settings = r.settings || settings; }
const wide = () => matchMedia('(min-width: 900px)').matches;
const day = v => v ? new Date(v).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function render() {
  if (picker) { picker.remove(); picker = null; }
  if (view !== 'add' && bulkPicker) { bulkPicker.remove(); bulkPicker = null; }
  if (view === 'add' && addMode === 'many') syncBulk();
  const pending = list.filter(n => !n.status.approved), reported = list.filter(n => n.reports);
  const todo = pending.length + reported.length + list.filter(n => n.status.claim).length;
  const tabs = [['today', `Today${todo ? ` <span class="badge">${todo}</span>` : ''}`], ['nak', `Nakamals <small>${list.length}</small>`], ['acc', `Accounts <small>${accounts.length}</small>`],
    ['log', 'Activity'], ['tools', 'Tools & settings']];
  const nav = `<nav class="chiefnav" role="tablist" aria-label="Team page">${tabs.map(([k, l]) => `<button type="button" role="tab" data-view="${k}" aria-selected="${view === k}">${l}</button>`).join('')}
      <button type="button" class="addbtn" data-view="add" aria-selected="${view === 'add'}">+ Add nakamal</button></nav>`;
  const loginCard = lastLogin ? `<div class="card logincard"><h2>${lastLogin.reset ? 'New PIN' : 'New phone login'}: give this to the owner</h2>
      <div class="bigcode"><span>Phone <b>${esc(lastLogin.phone)}</b></span><span>PIN <b>${esc(lastLogin.pin)}</b></span></div>
      <p class="hint">They log in on the owner page by typing their phone number and this PIN. Write it down for them now; it isn't shown again.</p>
      <button class="link" type="button" id="hideLogin">Done</button></div>` : '';
  const body = view === 'acc' ? accountsHtml() : view === 'add' ? addHtml() : view === 'log' ? logHtml(log) : view === 'tools' ? toolsHtml() : view === 'nak' ? nakHtml() : todayHtml();
  box.innerHTML = nav + loginCard + body + (drawer && view !== 'add' ? drawerHtml() : '');
  box.querySelectorAll('[data-view]').forEach(c => c.onclick = () => { view = c.dataset.view; editing = null; drawer = null; render(); scrollTo({ top: 0 }); });
  if ($('hideLogin')) $('hideLogin').onclick = () => { lastLogin = null; render(); };
  box.querySelectorAll('[data-go-acc]').forEach(b => b.onclick = () => { view = 'acc'; accSearch = b.dataset.goAcc; drawer = null; render(); });
  box.querySelectorAll('[data-open]').forEach(r => r.onclick = e => { if (e.target.closest('a')) return; drawer = r.dataset.open; editing = null; render(); });
  if ($('drawerClose')) $('drawerClose').onclick = $('drawerBack').onclick = () => { drawer = null; editing = null; render(); };
  if (view === 'acc') wireAccounts();
  else if (view === 'add') wireAdd();
  else if (view === 'tools') wireTools();
  else if (view === 'nak') wireNak();
  box.querySelectorAll('.adm').forEach(wireRow);
  if (editing) openEdit(editing);
}

// ---------- Today: only what needs the team ----------
function todayHtml() {
  const live = list.filter(n => n.status.approved), pending = list.filter(n => !n.status.approved), reported = list.filter(n => n.reports);
  const claims = list.filter(n => n.status.claim);
  const ready = live.filter(n => n.shown === 'green').length, idle = accounts.filter(a => !a.nakamals.length && !a.team);
  const stat = (n, label, cls = '') => `<div class="stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  const clear = !pending.length && !reported.length && !claims.length;
  return `<div class="stats">${stat(ready, 'kava ready now', 'l-green')}${stat(live.length, 'on the public map')}${stat(pending.length, 'waiting for a visit', pending.length ? 'l-amber' : '')}${stat(reported.length, 'reported lights', reported.length ? 'l-closed' : '')}</div>
    ${clear ? `<div class="card allclear"><h3>All clear ✓</h3><p class="hint">No registrations waiting and no reported lights.</p></div>` : ''}
    ${pending.length ? `<div class="card"><h2>Waiting for a visit (${pending.length})</h2>${pending.map(listRow).join('')}</div>` : ''}
    ${reported.length ? `<div class="card"><h2>Reported by customers (${reported.length})</h2>${reported.map(listRow).join('')}</div>` : ''}
    ${claims.length ? `<div class="card"><h2>Owners claiming a listing (${claims.length})</h2>${claims.map(listRow).join('')}<p class="hint">Call them to check they really run it, then open it and tap “Give it to them”.</p></div>` : ''}
    ${idle.length ? `<div class="card"><h2>Accounts with no nakamal yet (${idle.length})</h2>
      ${idle.slice(0, 8).map(a => `<div class="lrow"><div class="lmain"><b>${esc((a.contact && a.contact.owner) || a.name || a.email || a.phone)}</b><span class="hint">${esc(a.email || '☎ ' + a.phone)} · joined ${day(a.createdAt)}</span></div><button class="btn" type="button" data-go-acc="${esc(a.email || a.phone || '')}">Open</button></div>`).join('')}
      <p class="hint">Usually an owner who started signing up but didn't register their nakamal. Give them a call.</p></div>` : ''}
    <div class="card"><div class="ohead"><h2>Recent activity</h2><button class="link" type="button" data-view="log">See all</button></div>${logList(log.slice(0, 8))}</div>`;
}
// One compact line per nakamal; tapping it opens the full controls in the side panel.
function listRow(n) {
  const st = n.status, v = st.visit || {}, ok = !!st.approved, l = ok ? n.shown : 'pending';
  const what = n.status.claim ? `🙋 Claimed by ${n.status.claim.login}` : n.reports ? `⚠️ ${n.reports.count} report${n.reports.count === 1 ? '' : 's'}: ${reportWhat(n.reports)}` : ok ? updatedLine(n) : v.visited ? 'Visited · ready to approve' : v.date ? 'Visit booked ' + v.date : 'Registered ' + day(n.createdAt);
  return `<div class="lrow ${drawer === n.id ? 'sel' : ''}" data-open="${esc(n.id)}" role="button" tabindex="0">
    <span class="ldot l-${l}"><span class="dot">${LIGHT[l] ? LIGHT[l].sym : ''}</span></span>
    <div class="lmain"><b>${esc(n.name)}</b><span class="hint">${esc([n.area, (n.contact && n.contact.owner) || '', (n.contact && n.contact.phone) || ''].filter(Boolean).join(' · '))}</span></div>
    <span class="lwhat hint">${esc(what)}</span><span class="chev" aria-hidden="true">›</span></div>`;
}

// ---------- Nakamals: a table on computers, a list on phones ----------
function nakHtml() {
  const pending = list.filter(n => !n.status.approved), live = list.filter(n => n.status.approved), reported = list.filter(n => n.reports);
  const q = nakSearch.toLowerCase();
  const shown = (filter === 'pending' ? pending : filter === 'live' ? live : filter === 'reported' ? reported : list)
    .filter(n => !q || [n.name, n.area, n.ownerEmail, n.contact && n.contact.owner, n.contact && n.contact.phone].some(v => v && String(v).toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const status = n => n.status.approved ? 'On the map' : (n.status.visit || {}).visited ? 'Visited' : 'Waiting';
  return `<div class="card">
      <div class="ohead"><h3>Nakamals</h3><a class="btn" href="/" target="_blank" rel="noopener">Open public map ↗</a></div>
      <div class="segrow wrapme">
        <div class="seg" role="group" aria-label="Show">
          ${[['all', 'All', list.length], ['live', 'On the map', live.length], ['pending', 'Waiting', pending.length], ['reported', 'Reported', reported.length]].map(([k, l, c]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l} <small>${c}</small></button>`).join('')}
        </div>
        <input class="field" type="search" id="nakSearch" placeholder="Search name, area, owner or phone" value="${esc(nakSearch)}" aria-label="Search nakamals">
      </div>
      ${!shown.length ? `<p class="hint">${q ? 'Nothing matches that search.' : 'None here.'}</p>` : wide() ? `<table class="ntable">
        <thead><tr><th>Nakamal</th><th>Light</th><th>Status</th><th>Owner</th><th>Login</th><th>Updated</th></tr></thead>
        <tbody>${shown.map(n => `<tr data-open="${esc(n.id)}" class="${drawer === n.id ? 'sel' : ''}" tabindex="0">
          <td><b>${esc(n.name)}</b><div class="hint">${esc(n.area || '')}</div></td>
          <td>${n.status.approved ? `<span class="pill l-${n.shown}"><span class="dot">${LIGHT[n.shown].sym}</span>${LIGHT[n.shown].short}</span>` : '—'}${n.reports ? ' ⚠️' : ''}</td>
          <td>${status(n)}</td>
          <td>${esc((n.contact && n.contact.owner) || '—')}<div class="hint">${esc((n.contact && n.contact.phone) || '')}</div></td>
          <td class="hint">${n.owner ? esc(n.ownerEmail || 'phone + PIN') : 'none'}</td>
          <td class="hint">${n.lightAt ? esc(ago(n.lightAt)) : '—'}</td></tr>`).join('')}</tbody></table>`
      : shown.map(listRow).join('')}
    </div>`;
}
function wireNak() {
  box.querySelectorAll('[data-f]').forEach(c => c.onclick = () => { filter = c.dataset.f; render(); });
  $('nakSearch').oninput = e => { nakSearch = e.target.value; const pos = e.target.selectionStart; render(); $('nakSearch').focus(); $('nakSearch').setSelectionRange(pos, pos); };
  box.querySelectorAll('tr[data-open], .lrow[data-open]').forEach(r => r.onkeydown = e => { if (e.key === 'Enter') r.click(); });
}
// The side panel with every control for one nakamal.
function drawerHtml() {
  const n = list.find(x => x.id === drawer);
  if (!n) { drawer = null; return ''; }
  return `<div class="drawerback" id="drawerBack"></div><aside class="drawer" aria-label="${esc(n.name)}">
    <div class="drawerhead"><b>${esc(n.name)}</b><button class="ibtn" type="button" id="drawerClose" aria-label="Close">✕</button></div>
    ${rowHtml(n)}</aside>`;
}

// ---------- Tools & settings ----------
function toolsHtml() {
  const live = list.filter(n => n.status.approved);
  return `${socialCard()}

    <div class="card"><h2>Switch every light at once</h2>
      <div class="row"><label for="bulkScope">Which nakamals<select class="field" id="bulkScope">
        <option value="live">Only those on the public map (${live.length})</option><option value="all">All, including waiting (${list.length})</option></select></label></div>
      <div class="lights small">${['green', 'amber', 'closed'].map(k => `<button class="light l-${k}" type="button" data-bulk="${k}"><span class="bulb">${LIGHT[k].sym}</span>${LIGHT[k].label}</button>`).join('')}</div>
      <div class="row-btns" id="bulkConfirm" hidden><button class="btn go" type="button" id="bulkYes"></button><button class="btn" type="button" id="bulkNo">Cancel</button></div>
      <p class="hint">For example, everything closed after a cyclone warning or on a public holiday. Owners can change their own light again afterwards.</p></div>

    <div class="card"><h2>Phone + PIN login for an owner without email</h2>
      <form id="plForm" class="authform">
        <div class="row">
          <label for="plName">Owner's name<input class="field" id="plName" maxlength="80" required></label>
          <label for="plPhone">Phone number<input class="field" id="plPhone" type="tel" maxlength="20" required placeholder="555 1234"></label></div>
        <label for="plNak">Give them this nakamal (optional)<select class="field" id="plNak"><option value="">— None yet: they'll register it themselves —</option>
          ${list.map(n => `<option value="${esc(n.id)}">${esc(n.name)}${n.owner ? ' (has a login)' : ''}</option>`).join('')}</select></label>
        <div class="row-btns"><button class="btn go" type="submit">Create login + PIN</button><button class="btn" type="button" id="plReset">Reset PIN for this phone</button></div>
      </form></div>

    <div class="card"><h2>Settings</h2>
      <label class="check" for="setComments"><input type="checkbox" id="setComments" ${settings.comments ? 'checked' : ''}>Show written comments with ratings</label>
      <p class="hint">Off: customers give stars only. On: they can write a short comment, shown publicly. Turn on only when someone can watch for unkind comments.</p></div>

    ${osmCard()}

    <div class="card"><h2>Developers using the open data (${devkeys.length})</h2>
      ${devkeys.length ? devkeys.sort((a, b) => b.week - a.week).map(k => `<div class="sprow"><div><b>${esc(k.name)}</b>${k.revoked ? ' <span class="pill l-closed">switched off</span>' : ''}
        <div class="hint">${esc(k.email)} · ${k.week} request${k.week === 1 ? '' : 's'} this week · ${k.hooks} webhook${k.hooks === 1 ? '' : 's'}${k.use ? ' · ' + esc(k.use) : ''}</div></div>
        <button class="btn ${k.revoked ? '' : 'danger'}" type="button" data-key="${esc(k.id)}" data-restore="${k.revoked ? 1 : ''}">${k.revoked ? 'Switch on' : 'Switch off'}</button></div>`).join('')
        : '<p class="hint">No API keys yet. Developers get one free on the developers page.</p>'}
      <p class="hint">Switching a key off stops its requests and deletes its webhooks. Apps without a key still work.</p></div>

    <div class="card"><h2>Download</h2><p class="hint">One spreadsheet with every nakamal and every account. Opens in Excel or Google Sheets.</p>
      <div class="row-btns"><button class="btn" id="csv" type="button">⬇ Download everything</button></div></div>

    <details class="card"><summary><b>How it works</b></summary>
      <ol class="steps" style="max-width:none;margin-top:8px">
        <li>Owners create an account on the <a class="link" href="/owner" target="_blank">owner page</a>, or you make them a phone + PIN login above, and register each nakamal. It shows under <b>Today</b> as waiting.</li>
        <li>Call them, book a visit, meet them at the nakamal, then tick <b>We visited</b> and approve.</li>
        <li><b>Reported</b>: when 3 or more phones say a light is wrong, the light turns grey on the map. Call the owner, then clear the reports.</li>
        <li><b>Owner lost access?</b> Reset their PIN, set a new password under <b>Accounts</b>, or move the nakamal to another login.</li>
      </ol>
      <p class="hint">This page isn't linked from the public site. Only the emails on the team list can open it.</p></details>`;
}
// ---------- Facebook Page: the app posts for itself ----------
const SOCIAL_KINDS = [
  ['evening', 'Tonight\'s kava lights', 'every evening'],
  ['weekly', 'New on Killim Light this week', 'Fridays at 12:00'],
  ['tip', 'Tip of the week', 'Mondays at 12:00'],
];
function socialCard() {
  if (!social) return '';
  const cfg = social.settings, on = social.connected;
  const when = at => new Date(at).toLocaleString('en-GB', { timeZone: 'Pacific/Efate', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="card"><h2>Facebook Page: posts itself</h2>
    <p class="hint">${on ? '<b>✓ Connected.</b> Killim Light posts these on its own, from the live lights. Nothing to do while the team rests.'
      : '<b>Not connected yet.</b> Until it is, copy each post below and paste it on the Page yourself. Steps to connect are at the bottom of this card.'}</p>
    <label class="check" for="soEvening"><input type="checkbox" id="soEvening" ${cfg.evening ? 'checked' : ''}><span>Every evening at <input class="field" type="time" id="soAt" value="${esc(cfg.eveningAt)}" style="width:auto;display:inline-block;padding:2px 6px"> : tonight's kava lights and specials (skipped if no light is green)</span></label>
    <label class="check" for="soWeekly"><input type="checkbox" id="soWeekly" ${cfg.weekly ? 'checked' : ''}><span>Fridays at 12:00: new nakamals and newly claimed ones (skipped if nothing is new)</span></label>
    <label class="check" for="soTips"><input type="checkbox" id="soTips" ${cfg.tips ? 'checked' : ''}><span>Mondays at 12:00: a tip that invites owners and shows customers a feature (six tips take turns)</span></label>
    <div class="row-btns"><button class="btn go" type="button" id="soSave">Save times</button></div>
    ${SOCIAL_KINDS.map(([k, name, w]) => {
      const text = social.preview[k];
      return `<details class="sprow" style="display:block"><summary><b>${esc(name)}</b> <span class="hint">· ${esc(w)} · ${text ? 'preview of the next post' : 'nothing to post right now'}</span></summary>
        ${text ? `<textarea class="field socialprev" rows="13" readonly id="soText-${k}" aria-label="${esc(name)}">${esc(text)}</textarea>
        <div class="row-btns"><button class="btn" type="button" data-socopy="${k}">Copy text</button>
          ${on ? `<button class="btn go" type="button" data-sopost="${k}">Post now</button>` : '<a class="btn" href="https://www.facebook.com/" target="_blank" rel="noopener">Open Facebook</a>'}</div>` : ''}</details>`;
    }).join('')}
    ${social.posts.length ? `<h3 style="margin-top:14px">Recent posts</h3><div class="socialposts">${social.posts.map(p => `<div class="hint">${p.ok ? '✓' : '⚠'} ${esc(when(p.at))} · ${esc((SOCIAL_KINDS.find(x => x[0] === p.kind) || [, p.kind])[1])} · ${esc(p.by)}
      ${p.ok && p.id ? ` · <a class="link" href="https://www.facebook.com/${encodeURIComponent(p.id)}" target="_blank" rel="noopener">see post</a>` : ''}${p.error ? ` · <span style="color:var(--red)">${esc(p.error)}</span>` : ''}</div>`).join('')}</div>` : ''}
    <details style="margin-top:12px"><summary><b>How to connect the Facebook Page</b> (once, about 15 minutes, on a computer)</summary>
      <ol class="steps" style="max-width:none;margin-top:8px">
        <li>Make the <b>Killim Light</b> Facebook Page if you haven't yet. You must be its admin.</li>
        <li>Go to <a class="link" href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → <b>Create app</b>. Any name, e.g. "Killim Light poster". You don't need to publish the app or send it for review: it only posts to your own Page.</li>
        <li>Open <a class="link" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener">Graph API Explorer</a>, pick your app, add the permissions <b>pages_manage_posts</b>, <b>pages_read_engagement</b> and <b>pages_show_list</b>, then <b>Generate Access Token</b> and allow your Page.</li>
        <li>Open the <a class="link" href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noopener">Access Token Debugger</a>, paste that token and press <b>Extend Access Token</b>. Copy the long one it gives you.</li>
        <li>Back in Graph API Explorer, paste the long token and run <code>me/accounts</code>. Find your Page: copy its <b>id</b> and its <b>access_token</b> (this Page token doesn't expire).</li>
        <li>In Netlify: <b>Project configuration → Environment variables → Add a variable</b>. Add <code>FB_PAGE_ID</code> = the Page id, and <code>FB_PAGE_TOKEN</code> = the Page token (tick <b>Contains secret values</b>). Then <b>Deploys → Trigger deploy</b>.</li>
        <li>Come back here: the card says <b>Connected</b>. Press <b>Post now</b> on the tip to test.</li>
      </ol>
      <p class="hint">Keep the token secret: never paste it in a chat, an email or the code. If it leaks, change your Facebook password and make a new one. If the Page token stops working, the error shows above under Recent posts.</p></details>
  </div>`;
}
function wireSocial() {
  if (!$('soSave')) return;
  $('soSave').onclick = () => act({ action: 'socialSettings', evening: $('soEvening').checked, eveningAt: $('soAt').value, weekly: $('soWeekly').checked, tips: $('soTips').checked }, 'Facebook times saved');
  box.querySelectorAll('[data-socopy]').forEach(b => b.onclick = async () => {
    const ta = $('soText-' + b.dataset.socopy);
    try { await navigator.clipboard.writeText(ta.value); toast('Copied: paste it on the Facebook Page'); } catch { ta.select(); }
  });
  box.querySelectorAll('[data-sopost]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Posting…'; act({ action: 'socialPost', kind: b.dataset.sopost }, 'Posted to the Facebook Page').then(r => { if (!r) render(); }); });
}
function osmCard() {
  const fresh = osm.filter(o => !o.imported && !o.near), done = osm.filter(o => o.imported).length;
  return `<div class="card"><h2>Import nakamals from OpenStreetMap</h2>
    <p class="hint">${osm.length} nakamals and kava bars are mapped on OpenStreetMap for Vanuatu. ${done ? `${done} already imported. ` : ''}Imported ones go on the map with no owner, grey "usually open" hours and a "Claim it" link for the owner. Untick any you know are closed.</p>
    ${fresh.length ? `<div class="osmlist">${fresh.map(o => `<label class="check"><input type="checkbox" data-osm="${esc(o.osm)}" checked><span><b>${esc(o.name)}</b> <span class="hint">${esc(o.area)}</span></span></label>`).join('')}</div>
      <div class="row"><label>Usually open<input class="field" type="time" id="oOn" value="17:00"></label><label>Until<input class="field" type="time" id="oOff" value="23:00"></label></div>
      <div class="row-btns"><button class="btn go" type="button" id="osmGo">Import ${fresh.length} nakamal${fresh.length === 1 ? '' : 's'}</button></div>` : '<p class="hint">Nothing new to import.</p>'}
    ${osm.filter(o => o.near && !o.imported).length ? `<p class="hint">Skipped because something is already on our map there: ${osm.filter(o => o.near && !o.imported).map(o => `${esc(o.name)} (near ${esc(o.near)})`).join(', ')}.</p>` : ''}
    <p class="hint">Map data © OpenStreetMap contributors (ODbL). Names that were just "Kava bar" or "Nakamal" were given their area's name: rename them after a visit.</p></div>`;
}
function wireTools() {
  wireSocial();
  let bulk = null;
  box.querySelectorAll('[data-bulk]').forEach(b => b.onclick = () => {
    bulk = b.dataset.bulk;
    const scope = $('bulkScope').value, count = scope === 'all' ? list.length : list.filter(n => n.status.approved).length;
    $('bulkYes').textContent = `Yes, set ${count} nakamal${count === 1 ? '' : 's'} to “${LIGHT[bulk].label}”`;
    $('bulkConfirm').hidden = false;
  });
  $('bulkNo').onclick = () => { bulk = null; $('bulkConfirm').hidden = true; };
  $('bulkYes').onclick = () => bulk && act({ action: 'lightAll', light: bulk, scope: $('bulkScope').value }, `All set to ${LIGHT[bulk].label}`);
  $('setComments').onchange = e => act({ action: 'settings', comments: e.target.checked }, e.target.checked ? 'Comments switched on' : 'Comments switched off');
  $('plForm').onsubmit = e => { e.preventDefault(); act({ action: 'createLogin', name: clean($('plName').value, 80), phone: $('plPhone').value, id: $('plNak').value }, 'Login created'); };
  $('plReset').onclick = () => act({ action: 'resetPin', phone: $('plPhone').value }, 'PIN reset');
  $('csv').onclick = downloadAll;
  if ($('osmGo')) {
    box.querySelectorAll('[data-osm]').forEach(c => c.onchange = () => { const n = box.querySelectorAll('[data-osm]:checked').length; $('osmGo').textContent = `Import ${n} nakamal${n === 1 ? '' : 's'}`; $('osmGo').disabled = !n; });
    $('osmGo').onclick = () => {
      const on = $('oOn').value, off = $('oOff').value;
      const sel = [...box.querySelectorAll('[data-osm]:checked')].map(c => c.dataset.osm);
      act({ action: 'importOsm', osm: sel, days: [0, 1, 2, 3, 4, 5, 6].map(() => ({ on, off })) }, `${sel.length} nakamals imported`);
    };
  }
  box.querySelectorAll('[data-key]').forEach(b => b.onclick = () => act({ action: 'revokeKey', keyId: b.dataset.key, restore: !!b.dataset.restore }, b.dataset.restore ? 'Key switched on' : 'Key switched off'));
}

// ---------- Activity log ----------
const said = {
  light: e => `set ${e.name} to ${LIGHT[e.detail] ? LIGHT[e.detail].label : e.detail}`, lightAll: e => `switched every light to ${LIGHT[(e.detail || '').split(' ')[0]] ? LIGHT[e.detail.split(' ')[0]].label : ''} (${(e.detail || '').split('· ')[1] || ''})`,
  visit: e => `updated the visit for ${e.name}${e.detail ? ` (${e.detail})` : ''}`, approve: e => `approved ${e.name}: now on the public map`, hide: e => `hid ${e.name} from the map`,
  delete: e => `deleted ${e.name}`, clearReports: e => `cleared the reports on ${e.name}`, removePhoto: e => `removed a photo from ${e.name}`, removeAvatar: e => `removed the profile picture of ${e.name}'s owner`,
  assign: e => `moved ${e.name} to ${e.detail}`, unassign: e => `removed the owner login from ${e.name}`, edit: e => `edited ${e.name}`, addNakamal: e => `added ${e.name} (${e.detail})`,
  createLogin: e => `made a phone login for ${e.detail}`, resetPin: e => `made a new PIN for ${e.detail}`, setPassword: e => `set a new password for ${e.detail}`,
  editAccount: e => `edited the account ${e.detail}`, deleteAccount: e => `deleted the account ${e.detail}`, settings: e => `switched ${e.detail}`,
  register: e => `registered ${e.name}`, note: e => e.detail ? `changed the note on ${e.name}: “${e.detail}”` : `cleared the note on ${e.name}`, update: e => `edited the page of ${e.name}`,
  kava: e => `edited the kava details of ${e.name}`, special: e => `posted a special at ${e.name}: “${e.detail}”`, schedule: e => `turned the light schedule ${e.detail} for ${e.name}`, bulkAdd: e => `added ${e.detail}`, importOsm: e => `imported ${e.detail}`, claim: e => `asked to take over ${e.name}`, approveClaim: e => `handed ${e.name} to ${e.detail}`, rejectClaim: e => `turned down a claim on ${e.name}`, removeSpecial: e => `removed a special at ${e.name}`, revokeKey: e => `switched off the API key of ${e.detail}`, prices: e => `edited the prices of ${e.name}`, addPhoto: e => `added a photo to ${e.name}`, remove: e => `removed ${e.name}`,
};
function logList(entries) {
  if (!entries.length) return '<p class="hint">Nothing yet. Changes by the team and by owners show here.</p>';
  return `<ul class="loglist">${entries.map(e => `<li><span class="lwho ${e.role}">${esc(e.who)}${e.role === 'team' ? ' <small>team</small>' : ''}</span>
    <span class="lsay">${esc((said[e.action] || (x => `${x.action} ${x.name || ''}`))(e))}</span><span class="hint" title="${esc(new Date(e.at).toLocaleString())}">${esc(ago(e.at))}</span></li>`).join('')}</ul>`;
}
function logHtml(entries) {
  return `<div class="card"><h3>Activity</h3><p class="hint">Who changed what, newest first. Kept for 90 days.</p>${logList(entries)}</div>`;
}

function rowHtml(n) {
  const st = n.status, v = st.visit || {}, ok = !!st.approved, l = ok ? n.shown : 'pending';
  const sameOwner = n.owner ? list.filter(x => x.owner === n.owner).length : 1;
  const login = !n.owner ? '<b>none yet</b>, make or assign one below' : n.ownerEmail ? `<b>${esc(n.ownerEmail)}</b>` : `<b>phone + PIN</b> (${esc((n.contact && n.contact.phone) || '')})`;
  return `<div class="adm" data-id="${esc(n.id)}">
    <div class="head"><span class="pill l-${l}"><span class="dot">${LIGHT[l].sym}</span>${ok ? 'On map · ' + LIGHT[l].short : v.visited ? 'Visited · ready to approve' : v.date ? 'Visit booked ' + esc(v.date) : 'Waiting for a visit'}</span><b>${esc(n.name)}</b></div>
    <div class="line">${esc(n.area || 'No area given')} · registered ${n.createdAt ? new Date(n.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}${ok ? ' · ' + esc(updatedLine(n)) + ` · ${n.viewsWeek || 0} view${n.viewsWeek === 1 ? '' : 's'} this week` : ''}</div>
    ${n.status.claim ? `<div class="pendingnote hint">🙋 <b>${esc(n.status.claim.login)}</b> says they run this nakamal${n.claimContact ? ` · ${esc(n.claimContact.owner)} · <b style="user-select:all">${esc(n.claimContact.phone)}</b>` : ''}.
      <div class="row-btns"><button class="btn go" type="button" data-a="approveclaim">Give it to them</button><button class="btn" type="button" data-a="rejectclaim">Not theirs</button></div></div>` : ''}
    ${(n.specials || []).map(sp => `<p class="hint">📣 <b>${esc(sp.title)}</b> · ${esc(sp.date)}${sp.from ? ' ' + esc(sp.from) : ''} <button class="link" type="button" data-a="rmspecial" data-sp="${esc(sp.id)}">Remove</button></p>`).join('')}
    ${n.reports ? `<p class="pendingnote hint">⚠️ ${n.reports.count} customer${n.reports.count === 1 ? '' : 's'} report: ${esc(reportWhat(n.reports))}. <button class="link" data-a="clearrep">Clear reports</button></p>` : ''}
    <div class="contact">
      <span>Owner: <b>${esc((n.contact && n.contact.owner) || 'not given')}</b> · Phone: <b style="user-select:all">${esc((n.contact && n.contact.phone) || 'not given')}</b></span>
      <span>Login: ${login}${sameOwner > 1 ? ` (${sameOwner} nakamals)` : ''}</span>
      <a href="${directions(n)}" target="_blank" rel="noopener">Directions to the pin ↗</a></div>
    <div class="lights small rowlights" role="group" aria-label="Light for ${esc(n.name)}">${['green', 'amber', 'closed'].map(k => `<button class="light l-${k}" type="button" data-light="${k}" aria-pressed="${n.shown === k}"><span class="bulb">${LIGHT[k].sym}</span>${LIGHT[k].label}</button>`).join('')}</div>
    <p class="hint">⏰ ${n.schedule && n.schedule.enabled ? 'Light schedule: ' + esc(KL.schedText(n.schedule.days)) : 'No light schedule'} · <button class="link" type="button" data-a="sched">Change</button></p>
    <form class="schedbox authform" hidden>
      <label class="check"><input type="checkbox" data-sched-on ${!n.schedule || n.schedule.enabled ? 'checked' : ''}>Schedule on</label>
      ${KL.schedGridHtml((n.schedule && n.schedule.days) || [0, 1, 2, 3, 4, 5, 6].map(() => ({ on: '17:00', off: '23:00' })))}
      <p class="hint">Tick <b>24 h</b> (or press Open 24/7) for nakamals that never close: the light stays green all day and never shows "no update". A closing time earlier than the opening time means after midnight.</p>
      <div class="row-btns"><button class="btn go" type="submit">Save schedule</button></div></form>
    ${(n.photos && n.photos.length) || (n.host && n.host.avatar) ? `<div class="thumbs small">
      ${n.host && n.host.avatar ? `<figure class="thumb"><img src="${esc(n.host.avatar)}" alt="Owner profile picture"><span class="tag">Profile</span><button class="x" type="button" data-a="rmavatar" aria-label="Remove profile picture">✕</button></figure>` : ''}
      ${(n.photos || []).map((p, i) => `<figure class="thumb"><a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="Photo ${i + 1}" loading="lazy"></a><button class="x" type="button" data-a="rmphoto" data-photo="${esc(p.id)}" aria-label="Remove photo ${i + 1}">✕</button></figure>`).join('')}
    </div>` : ''}
    ${ok ? '' : `<div class="row">
      <label for="vd-${esc(n.id)}">Visit date<input class="field" type="date" id="vd-${esc(n.id)}" value="${esc(v.date || '')}"></label>
      <label for="vn-${esc(n.id)}">Visit notes<input class="field" id="vn-${esc(n.id)}" maxlength="200" value="${esc(v.notes || '')}" placeholder="Who you met, anything to fix"></label></div>
      <label class="check" for="vv-${esc(n.id)}"><input type="checkbox" id="vv-${esc(n.id)}" ${v.visited ? 'checked' : ''}>We visited and met the owner</label>`}
    <div class="row-btns">
      ${ok ? '<button class="btn" data-a="hide">Hide from map</button>' : `<button class="btn" data-a="savevisit">Save visit</button>
        <button class="btn go" data-a="approve" ${v.visited ? '' : 'disabled title="Tick We visited first"'}>Approve</button>`}
      <button class="btn" data-a="edit">Edit everything</button>
      <button class="btn" data-a="support">Support tools</button>
      <button class="btn danger" data-a="del">${ok ? 'Delete' : 'Reject and delete'}</button><button class="btn danger" data-a="delyes" hidden>Yes, delete</button>
    </div>
    <div class="support" hidden>
      <div><h4>Move to another login</h4>
        <p class="hint">Type the owner's email, or the phone number of a phone + PIN login. Their name, phone, ratings and approval move with the nakamal.</p>
        <div class="prow2"><input class="field" type="text" id="mv-${esc(n.id)}" placeholder="Email or phone number" aria-label="Owner's email or phone">
          <button class="btn" data-a="moveone">Move this one</button>${n.owner && sameOwner > 1 ? `<button class="btn" data-a="moveall">Move all ${sameOwner}</button>` : ''}</div></div>
      ${n.owner ? `<div><h4>Remove the owner login</h4><p class="hint">The nakamal stays, with the owner's name and phone kept for the team. Nobody can change its light until you give it to a login again.</p>
        <button class="btn" data-a="unassign">Remove owner login</button></div>` : ''}
    </div>
    <div class="editbox" hidden></div>
  </div>`;
}

function wireRow(row) {
  const id = row.dataset.id, n = list.find(x => x.id === id);
  const vv = row.querySelector('[id^="vv-"]');
  if (vv) vv.onchange = () => {
    const ap = row.querySelector('[data-a=approve]'); if (ap) ap.disabled = !vv.checked;
    act({ action: 'visit', id, date: row.querySelector('[type=date]').value, notes: clean(row.querySelector('[id^="vn-"]').value, 200), visited: vv.checked }, vv.checked ? 'Marked as visited' : 'Visit unticked');
  };
  row.querySelectorAll('[data-light]').forEach(b => b.onclick = () => act({ action: 'light', id, light: b.dataset.light }, `${n.name}: ${LIGHT[b.dataset.light].label}`));
  const sf = row.querySelector('.schedbox');
  if (sf) {
    KL.wireSchedGrid(sf);
    sf.onsubmit = e => { e.preventDefault(); act({ action: 'schedule', id, enabled: sf.querySelector('[data-sched-on]').checked, days: KL.readSchedGrid(sf) }, `${n.name}: schedule saved`); };
  }
  row.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, target = () => clean(row.querySelector('[id^="mv-"]').value, 120);
    if (a === 'savevisit') act({ action: 'visit', id, date: row.querySelector('[type=date]').value, notes: clean(row.querySelector('[id^="vn-"]').value, 200), visited: !!(vv && vv.checked) }, 'Visit saved');
    if (a === 'approve') act({ action: 'approve', id }, 'Approved: now on the public map');
    if (a === 'hide') act({ action: 'hide', id }, 'Hidden from the map');
    if (a === 'clearrep') act({ action: 'clearReports', id }, 'Reports cleared');
    if (a === 'sched') { sf.hidden = !sf.hidden; return; }
    if (a === 'support') row.querySelector('.support').hidden = !row.querySelector('.support').hidden;
    if (a === 'edit') { if (editing === id) { editing = null; render(); } else { editing = id; render(); } }
    if (a === 'unassign') act({ action: 'unassign', id }, 'Owner login removed');
    if (a === 'del') row.querySelector('[data-a=delyes]').hidden = false;
    if (a === 'delyes') act({ action: 'delete', id }, 'Deleted');
    if (a === 'approveclaim') act({ action: 'approveClaim', id }, 'Handed over to the owner');
    if (a === 'rejectclaim') act({ action: 'rejectClaim', id }, 'Claim turned down');
    if (a === 'rmspecial') act({ action: 'removeSpecial', id, specialId: b.dataset.sp }, 'Special removed');
    if (a === 'rmphoto') act({ action: 'removePhoto', id, photoId: b.dataset.photo }, 'Photo removed');
    if (a === 'rmavatar') act({ action: 'removeAvatar', id }, 'Profile picture removed');
    if (a === 'moveone') act({ action: 'assign', id, email: target() }, 'Moved to ' + target());
    if (a === 'moveall') act({ action: 'assign', fromOwner: n.owner, email: target() }, 'All moved to ' + target());
  });
}

// ---------- edit or add a nakamal: every field ----------
function fieldsHtml(n, c) {
  const prices = (n.prices || []).map(p => `${p.item}: ${p.price}`).join('\n');
  return `<div class="row">
      <label for="eName">Nakamal name<input class="field" id="eName" maxlength="80" value="${esc(n.name || '')}" required></label>
      <label for="eArea">Area<input class="field" id="eArea" maxlength="80" value="${esc(n.area || '')}" placeholder="e.g. Nambatu, Port Vila"></label></div>
    <label for="eAbout">About<textarea class="field" id="eAbout" maxlength="400" rows="2">${esc(n.about || '')}</textarea></label>
    <div class="row">
      <label for="eHours">Opening hours<input class="field" id="eHours" maxlength="80" value="${esc(n.hours || '')}" placeholder="e.g. 5pm to 11pm"></label>
      <label for="eNote">Note on the page<input class="field" id="eNote" maxlength="120" value="${esc(n.note || '')}"></label></div>
    <div class="row">
      <label for="eFrom">Kava from<select class="field" id="eFrom"><option value="">Not saying</option>${KAVA.map(i => `<option ${n.kavaFrom === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
      <label for="eStr">Strength<select class="field" id="eStr"><option value="">Not saying</option>${['mild', 'medium', 'strong'].map(s => `<option value="${s}" ${n.strength === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
      <label for="eClose">Closes at<input class="field" id="eClose" type="time" value="${esc(n.closeTime || '')}"></label></div>
    <label for="ePrices">Prices, one per line as <i>item: price</i><textarea class="field" id="ePrices" rows="3" placeholder="Shell: 100 vt&#10;Bottle: 500 vt">${esc(prices)}</textarea></label>
    <div class="row">
      <label for="eOwner">Owner's name (team only)<input class="field" id="eOwner" maxlength="80" value="${esc((c && c.owner) || '')}"></label>
      <label for="ePhone">Owner's phone (team only)<input class="field" id="ePhone" type="tel" maxlength="30" value="${esc((c && c.phone) || '')}"></label></div>
    <h4>Location</h4>
    <button class="btn" type="button" id="useLoc">${esc(t('useMyLoc'))}</button>
    <div class="picker" id="picker"></div>
    <p class="hint" id="locText">${esc(n.lat ? t('pinOk') : t('pinNone'))}</p>`;
}
function readFields() {
  const v = picker && picker.value;
  return {
    name: clean($('eName').value, 80), area: clean($('eArea').value, 80), about: clean($('eAbout').value, 400), hours: clean($('eHours').value, 80),
    note: clean($('eNote').value, 120), kavaFrom: $('eFrom').value, strength: $('eStr').value, closeTime: $('eClose').value,
    prices: $('ePrices').value.split('\n').map(l => { const i = l.lastIndexOf(':'); return i > 0 ? { item: clean(l.slice(0, i), 40), price: clean(l.slice(i + 1), 24) } : null; }).filter(p => p && p.item && p.price),
    contact: { owner: clean($('eOwner').value, 80), phone: clean($('ePhone').value, 30) },
    lat: v ? v.lat : null, lng: v ? v.lng : null,
  };
}
function openEdit(id) {
  const n = list.find(x => x.id === id), row = box.querySelector(`.adm[data-id="${CSS.escape(id)}"]`);
  if (!n || !row) { editing = null; return; }
  const eb = row.querySelector('.editbox');
  eb.hidden = false;
  eb.innerHTML = `<form class="authform support" id="editForm"><h4>Edit ${esc(n.name)}</h4>${fieldsHtml(n, n.contact)}
    <div class="row-btns"><button class="btn go" type="submit">Save changes</button><button class="btn" type="button" id="editCancel">Cancel</button></div></form>`;
  picker = makePicker($('picker'), $('locText'), [n.lat, n.lng], $('useLoc'));
  $('editCancel').onclick = () => { editing = null; render(); };
  $('editForm').onsubmit = async e => {
    e.preventDefault();
    const r = await act({ action: 'edit', id, ...readFields() }, 'Changes saved');
    if (r) { editing = null; render(); }
  };
  eb.scrollIntoView({ block: 'nearest' });
}

function addHtml() {
  const modes = `<div class="seg" role="group" aria-label="How many"><button type="button" data-addmode="many" aria-pressed="${addMode === 'many'}">Many at once</button><button type="button" data-addmode="one" aria-pressed="${addMode === 'one'}">One, with every detail</button></div>`;
  if (addMode === 'one') return `<div class="card"><h2>Add a nakamal</h2>${modes}
    <p class="hint">For nakamals the team adds itself. You can give it to an owner's login now or later (Support tools → Move to another login).</p>
    <form class="authform" id="addForm">${fieldsHtml({}, null)}
      <label for="aLogin">Owner's login (optional)<input class="field" id="aLogin" maxlength="120" placeholder="Their email, or the phone number of a phone + PIN login"></label>
      <label class="check" for="aApprove"><input type="checkbox" id="aApprove">We've visited: put it on the public map straight away</label>
      <div class="row-btns"><button class="btn go" type="submit">Add nakamal</button></div></form></div>`;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `<div class="card"><h2>Add many nakamals</h2>${modes}
    <p class="hint">Tap the map where each nakamal is, then type its name. They go on the map with no owner and the usual hours below; the pin stays grey ("usually open") until the owner joins and sets the light. Owners can claim their listing from its page.</p>
    <div class="picker big" id="bulkMap"></div>
    <div id="bulkRows">${bulk.length ? bulk.map((b, i) => `<div class="bulkrow"><span class="num">${i + 1}</span>
      <input class="field" data-bname="${i}" maxlength="80" placeholder="Nakamal name" value="${esc(b.name)}" aria-label="Name ${i + 1}">
      <input class="field" data-barea="${i}" maxlength="80" placeholder="Area (optional)" value="${esc(b.area)}" aria-label="Area ${i + 1}">
      <button class="ibtn" type="button" data-bdel="${i}" aria-label="Remove ${i + 1}">✕</button></div>`).join('') : '<p class="hint">No pins yet. Tap the map to add the first nakamal.</p>'}</div>
    <h4>Usual hours for all of them</h4>
    <div class="row"><label>Open<input class="field" type="time" id="bOn" value="17:00"></label><label>Close<input class="field" type="time" id="bOff" value="23:00"></label></div>
    <div class="daypick">${wd.map((d, i) => `<label class="check"><input type="checkbox" data-bday="${i}" checked>${d}</label>`).join('')}</div>
    <label class="check"><input type="checkbox" id="bApprove" checked>Put them on the public map now</label>
    <div class="row-btns"><button class="btn go" type="button" id="bSave" ${bulk.length ? '' : 'disabled'}>Add ${bulk.length || ''} nakamal${bulk.length === 1 ? '' : 's'}</button>${bulk.length ? '<button class="btn" type="button" id="bClear">Clear all</button>' : ''}</div></div>`;
}
function wireAdd() {
  box.querySelectorAll('[data-addmode]').forEach(b => b.onclick = () => { addMode = b.dataset.addmode; render(); });
  if (addMode === 'one') {
    picker = makePicker($('picker'), $('locText'), null, $('useLoc'));
    $('addForm').onsubmit = async e => {
      e.preventDefault();
      const f = readFields();
      if (f.lat == null) { toast('Tap the map to show where the nakamal is.'); return; }
      const approve = $('aApprove').checked;
      const r = await act({ action: 'addNakamal', ...f, ownerLogin: clean($('aLogin').value, 120), approve }, approve ? 'Added and on the map' : 'Added: waiting for a visit');
      if (r) { view = 'nak'; filter = approve ? 'live' : 'pending'; render(); }
    };
    return;
  }
  // Many at once: one map, a numbered pin per nakamal.
  const keep = bulkPicker && bulkPicker.getCenter ? { c: bulkPicker.getCenter(), z: bulkPicker.getZoom() } : null;
  if (bulkPicker) { bulkPicker.remove(); bulkPicker = null; }
  const m = KL.makeMap($('bulkMap'), { region: 'efate' });
  if (keep) m.setView(keep.c, keep.z, { animate: false });
  bulkPicker = m;
  const numIcon = i => L.divIcon({ className: 'bulkpin', html: `<div>${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  bulk.forEach((b, i) => L.marker([b.lat, b.lng], { icon: numIcon(i), draggable: true }).addTo(m).on('dragend', e => { const ll = e.target.getLatLng(); b.lat = +ll.lat.toFixed(6); b.lng = +ll.lng.toFixed(6); }));
  // Existing nakamals as small grey dots, so nobody gets added twice.
  list.forEach(n => L.circleMarker([n.lat, n.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#7d7466', fillOpacity: 1 }).bindTooltip(n.name).addTo(m));
  m.on('click', e => {
    if (bulk.length >= 50) return toast('Up to 50 at a time.');
    syncBulk();
    bulk.push({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6), name: '', area: '' });
    render();
    const f = box.querySelector(`[data-bname="${bulk.length - 1}"]`); if (f) f.focus();
  });
  box.querySelectorAll('[data-bdel]').forEach(b => b.onclick = () => { syncBulk(); bulk.splice(+b.dataset.bdel, 1); render(); });
  if ($('bClear')) $('bClear').onclick = () => { bulk = []; render(); };
  $('bSave').onclick = async () => {
    syncBulk();
    const empty = bulk.findIndex(b => b.name.trim().length < 2);
    if (empty >= 0) { toast(`Type a name for pin ${empty + 1}.`); box.querySelector(`[data-bname="${empty}"]`)?.focus(); return; }
    const on = $('bOn').value, off = $('bOff').value;
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => box.querySelector(`[data-bday="${i}"]`).checked ? { on, off } : null);
    const r = await act({ action: 'bulkAdd', items: bulk.map(b => ({ name: b.name.trim(), area: b.area.trim(), lat: b.lat, lng: b.lng })), days, approve: $('bApprove').checked }, `${bulk.length} nakamal${bulk.length === 1 ? '' : 's'} added`);
    if (r) { bulk = []; if (bulkPicker) { bulkPicker.remove(); bulkPicker = null; } view = 'nak'; filter = 'all'; render(); }
  };
}
function syncBulk() {
  bulk.forEach((b, i) => { const n = box.querySelector(`[data-bname="${i}"]`), a = box.querySelector(`[data-barea="${i}"]`); if (n) b.name = n.value; if (a) b.area = a.value; });
}

// ---------- accounts: everyone registered, in one place ----------
const typeLabel = a => a.loginType === 'phone' ? '☎ Phone + PIN' : a.loginType === 'google' ? 'Google' : 'Email + password';
function accountsHtml() {
  const q = accSearch.toLowerCase();
  const shown = accounts.filter(a => !q || [a.name, a.email, a.phone, a.contact && a.contact.owner, a.contact && a.contact.phone, a.profile && a.profile.name, ...a.nakamals.map(n => n.name)]
    .some(v => v && String(v).toLowerCase().includes(q)));
  const noNak = accounts.filter(a => !a.nakamals.length).length;
  return `<div class="card"><h2>Accounts</h2>
      <p class="hint">${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${accounts.filter(a => a.team).length} on the team · ${noNak} with no nakamal yet. Owner phone numbers and emails here are team only and never public.</p>
      <input class="field" type="search" id="accSearch" placeholder="Search name, email, phone or nakamal" value="${esc(accSearch)}" aria-label="Search accounts">
      ${shown.length ? shown.map(accHtml).join('') : `<p class="hint">${q ? 'Nothing matches that search.' : 'No accounts yet.'}</p>`}</div>`;
}
function accHtml(a) {
  const me = a.id === myId;
  return `<div class="adm acc" data-uid="${esc(a.id)}">
    <div class="head">${a.profile && a.profile.avatar ? `<img class="accpic" src="${esc(a.profile.avatar)}" alt="">` : ''}
      <b>${esc((a.contact && a.contact.owner) || a.name || (a.profile && a.profile.name) || a.email || a.phone || 'No name')}</b>
      ${a.team ? '<span class="pill l-green">Team</span>' : ''}${me ? '<span class="pill">You</span>' : ''}${a.confirmed ? '' : '<span class="pill l-amber">Email not confirmed</span>'}</div>
    <div class="contact">
      <span>Login: <b style="user-select:all">${esc(a.email || a.phone || '')}</b> · ${typeLabel(a)}</span>
      <span>Phone for the team: <b style="user-select:all">${esc((a.contact && a.contact.phone) || 'not given')}</b>${a.profile && a.profile.name ? ` · Shown publicly as <b>${esc(a.profile.name)}</b>` : ''}</span>
      <span>Joined ${day(a.createdAt)} · Last login ${day(a.lastSignInAt)}</span>
      <span>Nakamals: ${a.nakamals.length ? a.nakamals.map(n => `<button class="link" type="button" data-goto="${esc(n.id)}">${esc(n.name)}</button>${n.approved ? '' : ' (waiting)'}`).join(', ') : '<b>none yet</b>'}</span></div>
    <div class="row-btns">
      <button class="btn" data-a="aedit">Edit details</button>
      ${a.loginType === 'phone' ? '<button class="btn" data-a="apin">Make a new PIN</button>' : a.loginType === 'email' ? '<button class="btn" data-a="apw">Set a new password</button>' : ''}
      ${me || a.team ? '' : '<button class="btn danger" data-a="adel">Delete account</button>'}</div>
    <form class="support authform" data-box="edit" hidden>
      <div class="row"><label>Owner's name<input class="field" name="owner" maxlength="80" value="${esc((a.contact && a.contact.owner) || a.name || '')}"></label>
        <label>Phone for the team<input class="field" name="phone" type="tel" maxlength="30" value="${esc((a.contact && a.contact.phone) || '')}"></label></div>
      <label>Name shown publicly as host<input class="field" name="profileName" maxlength="60" value="${esc((a.profile && a.profile.name) || '')}"></label>
      <div class="row-btns"><button class="btn go" type="submit">Save</button></div></form>
    <form class="support authform" data-box="pw" hidden>
      <label>New password (at least 8 characters)<input class="field" name="pw" type="text" minlength="8" maxlength="72" autocomplete="off"></label>
      <p class="hint">Tell the owner their new password in person or by phone. They can change it after logging in with "Forgot password".</p>
      <div class="row-btns"><button class="btn go" type="submit">Set password</button></div></form>
    <div class="support" data-box="del" hidden>
      <h4>Delete ${esc(a.email || a.phone || 'this account')}?</h4>
      <p class="hint">The login, their profile picture and contact details are removed for good.${a.nakamals.length ? ` They have ${a.nakamals.length} nakamal${a.nakamals.length === 1 ? '' : 's'}:` : ''}</p>
      ${a.nakamals.length ? `<label class="check"><input type="radio" name="keep-${esc(a.id)}" value="keep" checked>Keep the nakamal${a.nakamals.length === 1 ? '' : 's'} with no owner login (you can give ${a.nakamals.length === 1 ? 'it' : 'them'} to a new login later)</label>
        <label class="check"><input type="radio" name="keep-${esc(a.id)}" value="delete">Delete the nakamal${a.nakamals.length === 1 ? '' : 's'} too, with photos and ratings</label>` : ''}
      <div class="row-btns"><button class="btn danger" data-a="adelyes">Yes, delete account</button><button class="btn" data-a="adelno">Cancel</button></div></div>
  </div>`;
}
function wireAccounts() {
  $('accSearch').oninput = e => { accSearch = e.target.value; const pos = e.target.selectionStart; render(); $('accSearch').focus(); $('accSearch').setSelectionRange(pos, pos); };
  box.querySelectorAll('.acc').forEach(row => {
    const uid = row.dataset.uid, a = accounts.find(x => x.id === uid);
    const show = k => row.querySelectorAll('[data-box]').forEach(b => b.hidden = b.dataset.box !== k || !b.hidden);
    row.querySelector('[data-box=edit]').onsubmit = e => { e.preventDefault(); const f = e.target;
      act({ action: 'editAccount', userId: uid, owner: clean(f.owner.value, 80), phone: clean(f.phone.value, 30), profileName: clean(f.profileName.value, 60) }, 'Account saved'); };
    row.querySelector('[data-box=pw]').onsubmit = e => { e.preventDefault();
      act({ action: 'setPassword', userId: uid, password: e.target.pw.value }, 'New password set for ' + a.email); };
    row.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) { view = 'nak'; filter = 'all'; nakSearch = ''; drawer = g.dataset.goto; render(); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const k = b.dataset.a;
      if (k === 'aedit') show('edit');
      if (k === 'apw') show('pw');
      if (k === 'adel') show('del');
      if (k === 'adelno') show('');
      if (k === 'apin') act({ action: 'setPassword', userId: uid }, 'New PIN made');
      if (k === 'adelyes') {
        const r = row.querySelector(`input[name="keep-${CSS.escape(uid)}"]:checked`);
        act({ action: 'deleteAccount', userId: uid, deleteNakamals: !!r && r.value === 'delete' }, 'Account deleted');
      }
    });
  });
}

// ---------- one spreadsheet with everything ----------
function downloadAll() {
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Nakamal', 'Status', 'Light', 'Area', 'Latitude', 'Longitude', 'Owner name', 'Owner phone', 'Login', 'Kava from', 'Strength', 'Closes', 'Hours', 'Prices', 'Note', 'Rating', 'Ratings', 'Views this week', 'Registered', 'Visit date', 'Visit notes']];
  list.forEach(n => rows.push([n.name, n.status.approved ? 'On the map' : 'Waiting', n.shown, n.area, n.lat, n.lng, n.contact && n.contact.owner, n.contact && n.contact.phone,
    n.ownerEmail || (n.owner ? 'phone + PIN' : ''), n.kavaFrom, n.strength, n.closeTime, n.hours, (n.prices || []).map(p => p.item + ' ' + p.price).join('; '), n.note,
    n.rating && n.rating.avg, n.rating && n.rating.count, n.viewsWeek, n.createdAt && new Date(n.createdAt).toISOString().slice(0, 10), n.status.visit && n.status.visit.date, n.status.visit && n.status.visit.notes]));
  rows.push([], ['Account', 'Login type', 'Owner name', 'Phone for the team', 'Public host name', 'Team', 'Joined', 'Last login', 'Nakamals']);
  accounts.forEach(a => rows.push([a.email || a.phone, typeLabel(a), a.contact && a.contact.owner, a.contact && a.contact.phone, a.profile && a.profile.name, a.team ? 'yes' : '',
    a.createdAt && a.createdAt.slice(0, 10), a.lastSignInAt && a.lastSignInAt.slice(0, 10), a.nakamals.map(n => n.name).join('; ')]));
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `killim-light-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  toast('Downloaded: open it in Excel or Google Sheets');
}
})();
