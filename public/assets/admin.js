// Team page (/chief): full control. Verify, add, edit and delete nakamals; see and manage every account;
// make phone + PIN logins; deal with customer reports; move nakamals between logins; switch comments on/off.
(() => {
const { t, $, esc, clean, LIGHT, updatedLine, reportWhat, directions, toast, makePicker } = KL;
const { start, authed, signOut } = KLAuthUI;
const box = $('box');
const KAVA = ['Pentecost', 'Tanna', 'Malo', 'Santo', 'Ambae', 'Maewo', 'Epi', 'Malekula', 'Efate', 'Other'];
let list = [], accounts = [], myId = null, settings = { comments: false }, filter = 'pending', lastLogin = null;
let view = 'nak', accSearch = '', nakSearch = '', editing = null, picker = null;

start({
  box, allowSignup: false, title: () => 'Team login', intro: () => 'For the Killim Light team only.',
  onUser: async user => {
    $('who').hidden = false;
    $('who').innerHTML = `<span>${esc(user.email || '')}</span> <button class="link" type="button" id="out">Log out</button>`;
    $('out').onclick = signOut;
    await reload();
    setInterval(() => { if (!document.hidden && !editing && view !== 'add' && !box.contains(document.activeElement)) reload(true); }, 60000);
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

function take(r) { list = r.nakamals || list; accounts = r.accounts || accounts; settings = r.settings || settings; }
const day = v => v ? new Date(v).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function render() {
  if (picker) { picker.remove(); picker = null; }
  const tabs = `<div class="card"><div class="tools" role="tablist" aria-label="Team page">
      <button class="chip" data-view="nak" aria-pressed="${view === 'nak'}">Nakamals (${list.length})</button>
      <button class="chip" data-view="acc" aria-pressed="${view === 'acc'}">Accounts (${accounts.length})</button>
      <button class="chip" data-view="add" aria-pressed="${view === 'add'}">+ Add a nakamal</button>
      <button class="chip" id="csv" type="button">⬇ Download everything</button></div></div>`;
  const loginCard = lastLogin ? `<div class="card logincard"><h2>${lastLogin.reset ? 'New PIN' : 'New phone login'}: give this to the owner</h2>
      <div class="bigcode"><span>Phone <b>${esc(lastLogin.phone)}</b></span><span>PIN <b>${esc(lastLogin.pin)}</b></span></div>
      <p class="hint">They log in on the owner page by typing their phone number and this PIN. Write it down for them now; it isn't shown again.</p>
      <button class="link" type="button" id="hideLogin">Done</button></div>` : '';
  if (view === 'acc') box.innerHTML = tabs + loginCard + accountsHtml();
  else if (view === 'add') box.innerHTML = tabs + addHtml();
  else box.innerHTML = tabs + loginCard + nakHtml();
  box.querySelectorAll('[data-view]').forEach(c => c.onclick = () => { view = c.dataset.view; editing = null; render(); });
  $('csv').onclick = downloadAll;
  if ($('hideLogin')) $('hideLogin').onclick = () => { lastLogin = null; render(); };
  if (view === 'acc') wireAccounts();
  else if (view === 'add') wireAdd();
  else wireNak();
}

function nakHtml() {
  const pending = list.filter(n => !n.status.approved), live = list.filter(n => n.status.approved);
  const reported = list.filter(n => n.reports);
  const unowned = list.filter(n => !n.owner);
  const owners = new Set(list.map(n => n.owner).filter(Boolean));
  const q = nakSearch.toLowerCase();
  const shown = (filter === 'pending' ? pending : filter === 'live' ? live : filter === 'reported' ? reported : list)
    .filter(n => !q || [n.name, n.area, n.ownerEmail, n.contact && n.contact.owner, n.contact && n.contact.phone].some(v => v && String(v).toLowerCase().includes(q)));
  return `
    <div class="card"><div class="row" style="align-items:center">
      <div><h3>Verification</h3><p class="hint">${pending.length} waiting for a visit · ${live.length} on the public map · ${owners.size} owner${owners.size === 1 ? '' : 's'}${unowned.length ? ` · ${unowned.length} without an owner login` : ''}</p></div>
      <a class="btn" href="/" target="_blank" rel="noopener" style="flex:0 0 auto">Open public map ↗</a></div>
      <div class="tools" role="group" aria-label="Show">
        <button class="chip" data-f="pending" aria-pressed="${filter === 'pending'}">Waiting (${pending.length})</button>
        <button class="chip ${reported.length ? 'l-amber' : ''}" data-f="reported" aria-pressed="${filter === 'reported'}">Reported (${reported.length})</button>
        <button class="chip" data-f="live" aria-pressed="${filter === 'live'}">On the map (${live.length})</button>
        <button class="chip" data-f="all" aria-pressed="${filter === 'all'}">All (${list.length})</button>
      </div>
      <input class="field" type="search" id="nakSearch" placeholder="Search name, area, owner or phone" value="${esc(nakSearch)}" aria-label="Search nakamals"></div>

    <details class="card" ${lastLogin ? '' : ''}><summary><b>Make a login for an owner without email</b></summary>
      <form id="plForm" class="authform" style="margin-top:10px">
        <div class="row">
          <label for="plName">Owner's name<input class="field" id="plName" maxlength="80" required></label>
          <label for="plPhone">Phone number<input class="field" id="plPhone" type="tel" maxlength="20" required placeholder="555 1234"></label></div>
        <label for="plNak">Give them this nakamal (optional)<select class="field" id="plNak"><option value="">— None yet: they'll register it themselves —</option>
          ${list.map(n => `<option value="${esc(n.id)}">${esc(n.name)}${n.owner ? ' (has a login)' : ''}</option>`).join('')}</select></label>
        <div class="row-btns"><button class="btn go" type="submit">Create login + PIN</button><button class="btn" type="button" id="plReset">Reset PIN for this phone</button></div>
      </form></details>

    <details class="card"><summary><b>How it works</b></summary>
      <ol class="steps" style="max-width:none;margin-top:8px">
        <li>Owners create an account on the <a class="link" href="/owner" target="_blank">owner page</a>, or you make them a phone + PIN login above, and they register each nakamal. It shows here as waiting.</li>
        <li>Call them, book a visit, meet them at the nakamal, then tick <b>We visited</b> and approve.</li>
        <li><b>Reported</b>: when ${'3'} or more phones say a light is wrong, the light turns grey on the map. Call the owner, then clear the reports.</li>
        <li><b>Lights:</b> the team can switch any nakamal's light on its row, or every light at once.</li>
        <li><b>Owner lost access?</b> Reset their PIN, or use <b>Move to another login</b>.</li>
      </ol>
      <p class="hint">This page isn't linked from the public site. Only the emails on the team list can open it.</p></details>

    <div class="card"><h2>Switch every light at once</h2>
      <div class="row"><label for="bulkScope">Which nakamals<select class="field" id="bulkScope">
        <option value="live">Only those on the public map (${live.length})</option><option value="all">All, including waiting (${list.length})</option></select></label></div>
      <div class="lights small">${['green', 'amber', 'closed'].map(k => `<button class="light l-${k}" type="button" data-bulk="${k}"><span class="bulb">${LIGHT[k].sym}</span>${LIGHT[k].label}</button>`).join('')}</div>
      <div class="row-btns" id="bulkConfirm" hidden><button class="btn go" type="button" id="bulkYes"></button><button class="btn" type="button" id="bulkNo">Cancel</button></div>
      <p class="hint">For example, everything closed after a cyclone warning or on a public holiday. Each light can still be changed one by one below, and owners can change their own again.</p></div>

    <div class="card"><h2>Settings</h2>
      <label class="check" for="setComments"><input type="checkbox" id="setComments" ${settings.comments ? 'checked' : ''}>Show written comments with ratings</label>
      <p class="hint">Off: customers give stars only. On: they can write a short comment, shown publicly. Turn on only when someone can watch for unkind comments.</p></div>

    <div class="card"><h2>${{ pending: 'Waiting for a visit', live: 'On the public map', reported: 'Reported by customers', all: 'All nakamals' }[filter]}</h2>
      ${shown.length ? shown.map(rowHtml).join('') : `<p class="hint">${q ? 'Nothing matches that search.' : filter === 'pending' ? 'Nothing waiting. New registrations appear here.' : filter === 'reported' ? 'No reports right now.' : 'None yet.'}</p>`}</div>`;
}
function wireNak() {
  box.querySelectorAll('.chip[data-f]').forEach(c => c.onclick = () => { filter = c.dataset.f; render(); });
  $('nakSearch').oninput = e => { nakSearch = e.target.value; const pos = e.target.selectionStart; render(); $('nakSearch').focus(); $('nakSearch').setSelectionRange(pos, pos); };
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
  box.querySelectorAll('.adm').forEach(wireRow);
  if (editing) openEdit(editing);
}

function rowHtml(n) {
  const st = n.status, v = st.visit || {}, ok = !!st.approved, l = ok ? n.shown : 'pending';
  const sameOwner = n.owner ? list.filter(x => x.owner === n.owner).length : 1;
  const login = !n.owner ? '<b>none yet</b>, make or assign one below' : n.ownerEmail ? `<b>${esc(n.ownerEmail)}</b>` : `<b>phone + PIN</b> (${esc((n.contact && n.contact.phone) || '')})`;
  return `<div class="adm" data-id="${esc(n.id)}">
    <div class="head"><span class="pill l-${l}"><span class="dot">${LIGHT[l].sym}</span>${ok ? 'On map · ' + LIGHT[l].short : v.visited ? 'Visited · ready to approve' : v.date ? 'Visit booked ' + esc(v.date) : 'Waiting for a visit'}</span><b>${esc(n.name)}</b></div>
    <div class="line">${esc(n.area || 'No area given')} · registered ${n.createdAt ? new Date(n.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}${ok ? ' · ' + esc(updatedLine(n)) + ` · ${n.viewsWeek || 0} view${n.viewsWeek === 1 ? '' : 's'} this week` : ''}</div>
    ${n.reports ? `<p class="pendingnote hint">⚠️ ${n.reports.count} customer${n.reports.count === 1 ? '' : 's'} report: ${esc(reportWhat(n.reports))}. <button class="link" data-a="clearrep">Clear reports</button></p>` : ''}
    <div class="contact">
      <span>Owner: <b>${esc((n.contact && n.contact.owner) || 'not given')}</b> · Phone: <b style="user-select:all">${esc((n.contact && n.contact.phone) || 'not given')}</b></span>
      <span>Login: ${login}${sameOwner > 1 ? ` (${sameOwner} nakamals)` : ''}</span>
      <a href="${directions(n)}" target="_blank" rel="noopener">Directions to the pin ↗</a></div>
    <div class="lights small rowlights" role="group" aria-label="Light for ${esc(n.name)}">${['green', 'amber', 'closed'].map(k => `<button class="light l-${k}" type="button" data-light="${k}" aria-pressed="${n.shown === k}"><span class="bulb">${LIGHT[k].sym}</span>${LIGHT[k].label}</button>`).join('')}</div>
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
  row.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, target = () => clean(row.querySelector('[id^="mv-"]').value, 120);
    if (a === 'savevisit') act({ action: 'visit', id, date: row.querySelector('[type=date]').value, notes: clean(row.querySelector('[id^="vn-"]').value, 200), visited: !!(vv && vv.checked) }, 'Visit saved');
    if (a === 'approve') act({ action: 'approve', id }, 'Approved: now on the public map');
    if (a === 'hide') act({ action: 'hide', id }, 'Hidden from the map');
    if (a === 'clearrep') act({ action: 'clearReports', id }, 'Reports cleared');
    if (a === 'support') row.querySelector('.support').hidden = !row.querySelector('.support').hidden;
    if (a === 'edit') { if (editing === id) { editing = null; render(); } else { editing = id; render(); } }
    if (a === 'unassign') act({ action: 'unassign', id }, 'Owner login removed');
    if (a === 'del') row.querySelector('[data-a=delyes]').hidden = false;
    if (a === 'delyes') act({ action: 'delete', id }, 'Deleted');
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
  return `<div class="card"><h2>Add a nakamal</h2>
    <p class="hint">For nakamals the team adds itself. You can give it to an owner's login now or later (Support tools → Move to another login).</p>
    <form class="authform" id="addForm">${fieldsHtml({}, null)}
      <label for="aLogin">Owner's login (optional)<input class="field" id="aLogin" maxlength="120" placeholder="Their email, or the phone number of a phone + PIN login"></label>
      <label class="check" for="aApprove"><input type="checkbox" id="aApprove">We've visited: put it on the public map straight away</label>
      <div class="row-btns"><button class="btn go" type="submit">Add nakamal</button></div></form></div>`;
}
function wireAdd() {
  picker = makePicker($('picker'), $('locText'), null, $('useLoc'));
  $('addForm').onsubmit = async e => {
    e.preventDefault();
    const f = readFields();
    if (f.lat == null) { toast('Tap the map to show where the nakamal is.'); return; }
    const approve = $('aApprove').checked;
    const r = await act({ action: 'addNakamal', ...f, ownerLogin: clean($('aLogin').value, 120), approve }, approve ? 'Added and on the map' : 'Added: waiting for a visit');
    if (r) { view = 'nak'; filter = approve ? 'live' : 'pending'; render(); }
  };
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
      if (g) { view = 'nak'; filter = 'all'; nakSearch = (list.find(n => n.id === g.dataset.goto) || {}).name || ''; render(); return; }
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
