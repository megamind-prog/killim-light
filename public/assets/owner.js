// Owner page: create account / log in, then manage any number of nakamals from one login.
// /owner?quick=1 is the one-tap light page owners can keep on their home screen.
(() => {
const { t, $, esc, clean, LIGHT, updatedLine, reportWhat, toast, setMsg, makePicker, uploadImage, schedText, schedGridHtml, wireSchedGrid, readSchedGrid } = KL;
const { start, authed, signOut } = KLAuthUI;
const { applyStatic, langButton } = KLi18n;
const MAX_PHOTOS = 6;
const ISLANDS = ['Pentecost', 'Tanna', 'Malo', 'Santo', 'Ambae', 'Maewo', 'Epi', 'Malekula', 'Efate', 'Other'];
const box = $('box');
let state = null;           // { user, phoneLogin, contact, profile, nakamals }
let picker = null, editId = null, adding = false, auth = null, editTab = 'photos', showProfile = false;
let reg = null;               // registration in progress: { step, data, id }
let quick = new URLSearchParams(location.search).get('quick') === '1';
let claimId = new URLSearchParams(location.search).get('claim');

applyStatic();
langButton(() => { state ? render() : auth && auth.redraw(); paintWho(); });
(async () => {
  auth = await start({
    box, allowSignup: true, title: () => t('ownerLogin'), intro: () => t('ownerIntro'),
    onUser: async user => { window.__klUser = user; paintWho(); await reload(); },
  });
})();
function paintWho() {
  const u = window.__klUser; if (!u) return;
  $('who').hidden = false;
  const label = KLAuthUI.isPhoneEmail(u.email) ? '☎ ' + u.email.split('@')[0] : (u.email || '');
  $('who').innerHTML = `<span>${esc(label)}</span> <button class="link" type="button" id="out">${esc(t('logout'))}</button>`;
  $('out').onclick = signOut;
}

// The Killim Light WhatsApp number (when set up), for "send VERIFY".
let waNum = null;
KL.api('/api/mapconfig').then(c => { waNum = c.waNumber || null; if (state && !state.verified) render(); }).catch(() => {});
// Coming back from WhatsApp after sending VERIFY: check again by itself.
document.addEventListener('visibilitychange', () => { if (!document.hidden && state && !state.verified) reload(); });

async function reload() {
  try { state = await authed('/api/owner'); setTimeout(flushPending, 500); try { const c = localStorage.getItem('kl-claimed'); if (c && state.nakamals.some(n => n.name === c)) localStorage.removeItem('kl-claimed'); } catch {} render(); }
  catch (e) { box.innerHTML = `<div class="card"><h3>${esc(t('loadFail'))}</h3><p class="hint">${esc(e.message)}</p><button class="btn" id="retry">${esc(t('tryAgain'))}</button></div>`; $('retry').onclick = reload; }
}
async function act(body, okText, msgId) {
  try {
    const r = await authed('/api/owner', body);
    if (r.nakamals) { const prev = new Map(state.nakamals.map(n => [n.id, n.stats])); state.nakamals = r.nakamals.map(n => ({ ...n, stats: n.stats || prev.get(n.id) })); }
    if (r.profile) state.profile = r.profile;
    if (body.contact) state.contact = { ...(state.contact || {}), ...body.contact };
    if (okText) toast(okText);
    return r;
  } catch (e) { msgId ? setMsg(msgId, e.message, false) : toast(e.message); return null; }
}

function render() {
  if (picker) { picker.remove(); picker = null; }
  if (claimId) return renderClaim();
  const mine = state.nakamals;
  if (!mine.length || adding || reg) return renderRegister(mine.length > (reg && reg.id ? 1 : 0));
  if (quick) return renderQuick(mine);
  const ed = editId && mine.find(n => n.id === editId);
  if (ed) return renderEdit(ed);
  editId = null;
  box.innerHTML = `${claimNote()}
    ${state.verified ? '' : verifyCard()}
    ${mine.map(ownerCard).join('')}
    <div class="row-btns"><button class="btn" type="button" id="addBtn">${esc(t('addNakamal'))}</button></div>
    <details class="card" ${showProfile ? 'open' : ''} id="profBox"><summary><b>${esc(t('myProfile'))}</b></summary>${profileCard()}</details>
    <p class="hint">${esc(t('staleNote'))}</p>
    <p class="hint"><a class="link" href="?quick=1">${esc(t('quickOpen'))}</a> · ${esc(t('quickTip'))}</p>`;
  $('addBtn').onclick = () => { adding = true; reg = null; render(); scrollTo({ top: 0 }); };
  wireVerify();
  $('profBox').ontoggle = e => { showProfile = e.target.open; };
  wireProfile();
  wireCards(mine);
}

function claimNote() { let c = null; try { c = localStorage.getItem('kl-claimed'); } catch {} return c ? `<p class="banner">${esc(t('claimPending', { name: c }))}</p>` : ''; }
// ---------- claim a listing the team added (/owner?claim=<id>) ----------
async function renderClaim() {
  const id = claimId;
  box.innerHTML = `<div class="card"><p class="hint">${esc(t('loading'))}</p></div>`;
  let n = null;
  try { n = (await KL.api('/api/nakamals')).items.find(x => x.id === id); } catch {}
  if (!n) { claimId = null; return render(); }
  if (!state.verified) {
    box.innerHTML = `<div class="card"><h3>${esc(t('claimTitle', { name: n.name }))}</h3>${n.area ? `<div class="line">${esc(n.area)}</div>` : ''}<p class="hint">${esc(t('verifyClaim'))}</p></div>${verifyCard()}`;
    return wireVerify();
  }
  const needContact = !(state.contact && state.contact.owner && state.contact.phone);
  box.innerHTML = `<div class="card"><h3>${esc(t('claimTitle', { name: n.name }))}</h3>${n.area ? `<div class="line">${esc(n.area)}</div>` : ''}
    <p class="hint">${esc(t('claimHint'))}</p>
    <form class="authform" id="claimForm">
      ${needContact ? `<div class="row"><label for="cOwner">${esc(t('yourName'))}<input class="field" id="cOwner" maxlength="80" required value="${esc(state.user.name || '')}"></label>
        <label for="cPhone">${esc(t('phone'))}<input class="field" id="cPhone" type="tel" maxlength="30" required></label></div><p class="hint">${esc(t('ownerPrivate'))}</p>` : ''}
      <button class="primary" type="submit">${esc(t('claimBtn'))}</button><p class="msg" id="claimMsg"></p></form>
    <button class="link" type="button" id="claimCancel">${esc(t('cancel'))}</button></div>`;
  $('claimCancel').onclick = () => { claimId = null; history.replaceState(null, '', location.pathname); render(); };
  $('claimForm').onsubmit = async e => {
    e.preventDefault();
    const body = { action: 'claim', id };
    if (needContact) body.contact = { owner: clean($('cOwner').value, 80), phone: clean($('cPhone').value, 30) };
    const r = await act(body, t('claimSent'), 'claimMsg');
    if (r) {
      claimId = null; history.replaceState(null, '', location.pathname);
      if (needContact) state.contact = body.contact;
      try { localStorage.setItem('kl-claimed', r.claimed); } catch {}
      render();
    }
  };
}

// ---------- one-tap light page ----------
function renderQuick(mine) {
  box.innerHTML = `${state.verified ? '' : verifyCard()}<div class="card"><h3>⚡ ${esc(t('quickTitle'))}</h3><p class="hint">${esc(t('quickHint'))}</p></div>
    ${mine.map(n => `<div class="card ocard" data-card="${esc(n.id)}">
      <div class="top" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="flex:1">${esc(n.name)}</h3>${pill(n)}</div>
      ${lightButtons(n)}<div class="line">${esc(updatedLine(n))}</div></div>`).join('')}
    <a class="btn" href="?">${esc(t('fullPage'))}</a>`;
  wireCards(mine); wireVerify();
}

const pill = n => n.approved ? `<span class="pill l-${n.shown}"><span class="dot">${LIGHT[n.shown].sym}</span>${esc(t('customersSee', { light: LIGHT[n.shown].label }))}</span>`
  : `<span class="pill l-pending"><span class="dot"></span>${esc(t('pendingVer'))}</span>`;
const lightButtons = (n, big) => `<div class="lights ${big ? '' : 'small'}" role="group" aria-label="${esc(t('setLightFor', { name: n.name }))}">
  <button class="light l-green" data-light="green" aria-pressed="${n.shown === 'green'}"><span class="bulb"></span>${esc(t('l.green'))}</button>
  <button class="light l-amber" data-light="amber" aria-pressed="${n.shown === 'amber'}"><span class="bulb"></span>${esc(t('l.amber'))}</button>
  <button class="light l-closed" data-light="closed" aria-pressed="${n.shown === 'closed'}"><span class="bulb">✕</span>${esc(t('l.closed'))}</button></div>`;

function wireCards(mine) {
  box.querySelectorAll('[data-card]').forEach(card => {
    const id = card.dataset.card, n = mine.find(x => x.id === id);
    card.querySelectorAll('[data-light]').forEach(b => b.onclick = () => setLight(n, b.dataset.light));
    const sp = card.querySelector('[data-speak]');
    if (sp) sp.onclick = () => speak(t('speakHelp'));
    const more = card.querySelector('[data-more]');
    if (more) more.ontoggle = () => { more.open ? moreOpen.add(id) : moreOpen.delete(id); };
    const note = card.querySelector('[data-note]');
    if (note) note.onclick = async () => { if (await act({ action: 'note', id, note: clean(card.querySelector('input').value, 120) }, t('noteSaved'))) render(); };
    card.querySelectorAll('[data-edit]').forEach(ed => ed.onclick = () => { editId = id; editTab = ed.dataset.edit || 'photos'; render(); scrollTo({ top: 0 }); });
    const sh = card.querySelector('[data-share]');
    if (sh) sh.onclick = () => KL.shareNakamal(n);
  });
}

// ---------- verify the owner's phone before the first light or a claim ----------
function verifyCard() {
  const ph = state.myPhone;
  return `<div class="card verifycard"><h3>☎ ${esc(t('verifyTitle'))}</h3>
    <p class="hint">${esc(t('verifyWhy'))}</p>
    ${ph ? `<p>${esc(t('verifyYourNumber'))} <b>${esc(ph)}</b></p>`
      : `<div class="prow2"><input class="field" id="vPhone" type="tel" inputmode="numeric" maxlength="20" placeholder="555 1234" aria-label="${esc(t('pinPhone'))}"><button class="btn" type="button" id="vSave">${esc(t('save'))}</button></div><p class="hint">${esc(t('verifyAddPhone'))}</p>`}
    ${waNum && ph ? `<a class="btn big wabtn" href="https://wa.me/${encodeURIComponent(waNum)}?text=${encodeURIComponent('VERIFY')}" target="_blank" rel="noopener">🟢 ${esc(t('verifyWa'))}<small>${esc(t('verifyWaSub'))}</small></a>` : ''}
    <p class="hint">${esc(waNum ? t('verifyTeamToo') : t('verifyTeam'))}</p>
    <button class="btn" type="button" id="vCheck">${esc(t('verifyCheck'))}</button></div>`;
}
function wireVerify() {
  if ($('vCheck')) $('vCheck').onclick = reload;
  if ($('vSave')) $('vSave').onclick = async () => {
    const phone = clean($('vPhone').value, 30);
    const owner = (state.contact && state.contact.owner) || (state.profile && state.profile.name) || (state.user && state.user.name) || 'Owner';
    if (await act({ action: 'contact', contact: { owner, phone } }, t('saved'))) reload();
  };
}

// ---------- one tap = done: big confirmation, and taps made with no signal are sent later ----------
const moreOpen = new Set();
const PENDING = 'kl-pending-lights';
const readPending = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '{}'); } catch { return {}; } };
const writePending = p => { try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch {} };
const pendingLight = id => readPending()[id];
function confirmTap(l, n) {
  try { navigator.vibrate && navigator.vibrate(80); } catch {}
  document.querySelector('.tapok')?.remove();
  const el = document.createElement('div'); el.className = 'tapok l-' + l; el.setAttribute('role', 'status');
  el.innerHTML = `<div><span class="bulbbig l-${l}"></span><b>✓ ${esc(n.approved ? t('customersSee', { light: LIGHT[l].label }) : t('savedPending'))}</b></div>`;
  document.body.appendChild(el); el.onclick = () => el.remove();
  setTimeout(() => el.remove(), 2200);
}
async function setLight(n, l) {
  if (!state.verified) { toast(t('verifyFirst')); const v = document.querySelector('.verifycard'); if (v) { v.scrollIntoView({ behavior: 'smooth', block: 'center' }); v.classList.add('flash'); setTimeout(() => v.classList.remove('flash'), 1200); } return; }
  const local = { ...n, light: l, shown: l, lightAt: Date.now(), lightBy: 'owner' };
  const i = state.nakamals.findIndex(x => x.id === n.id); if (i >= 0) state.nakamals[i] = local;
  confirmTap(l, n);
  try {
    const r = await authed('/api/owner', { action: 'light', id: n.id, light: l });
    if (r.nakamals) state.nakamals = r.nakamals.map(x => ({ ...x, stats: (state.nakamals.find(y => y.id === x.id) || {}).stats }));
    const p = readPending(); delete p[n.id]; writePending(p);
  } catch (e) {
    if (e && e.status) { toast(e.message); } else { const p = readPending(); p[n.id] = { light: l, at: Date.now() }; writePending(p); }
  }
  render();
}
// Send taps that waited for signal, as soon as the phone is back online.
async function flushPending() {
  const p = readPending(); const ids = Object.keys(p); if (!ids.length || !state) return;
  for (const id of ids) {
    try { await authed('/api/owner', { action: 'light', id, light: p[id].light }); delete p[id]; } catch (e) { if (e && e.status) delete p[id]; }
  }
  writePending(p); if (!Object.keys(p).length) { toast(t('offlineSent')); reload(); }
}
addEventListener('online', flushPending);
setInterval(flushPending, 30000);
function speak(text) {
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-AU'; u.rate = .85; speechSynthesis.speak(u); } catch {}
}

function ownerCard(n) {
  const phone = (state.contact || {}).phone;
  const wait = n.visitDate ? t('waitDate', { date: n.visitDate }) : phone ? t('waitCall', { phone }) : t('waitCallNo');
  return `<div class="card ocard" data-card="${esc(n.id)}">
    ${n.photos && n.photos.length ? `<img class="ocover" src="${esc(n.photos[0].url)}" alt="" loading="lazy">` : ''}
    <div class="ocardtop">
      <div class="ocardname"><h3>${esc(n.name)}</h3>${n.area ? `<div class="line">${esc(n.area)}</div>` : ''}</div>
      ${'speechSynthesis' in window ? `<button class="speak" type="button" data-speak aria-label="${esc(t('speakBtn'))}" title="${esc(t('speakBtn'))}">🔊</button>` : ''}
    </div>
    ${n.approved ? '' : `<p class="hint pendingnote">${esc(wait)}</p>`}
    ${n.reports ? `<p class="hint pendingnote">${esc(t('reportsNow', { n: n.reports.count, what: reportWhat(n.reports) }))}</p>` : ''}
    <p class="lightq">${esc(t('lightQ'))}</p>
    ${lightButtons(n, true)}
    ${pendingLight(n.id) ? `<p class="offline-wait">☁️ ${esc(t('offlineWait'))}</p>` : ''}
    <div class="line">${n.approved ? pill(n) + ' ' : ''}${esc(updatedLine(n))}</div>
    <details class="omore" ${moreOpen.has(n.id) ? 'open' : ''} data-more><summary>${esc(t('moreThings'))}</summary>
    ${n.approved ? `<p class="hint">${esc(t('viewsWeek', { n: n.viewsWeek || 0 }))}</p>` : ''}
    <div class="prow2"><input class="field" id="note-${esc(n.id)}" maxlength="120" value="${esc(n.note || '')}" placeholder="${esc(t('notePh'))}" aria-label="${esc(t('noteAria'))}">
      <button class="btn" type="button" data-note>${esc(t('saveNote'))}</button></div>
    ${n.schedule && n.schedule.enabled ? `<p class="hint">${esc(t('schedNow', { txt: schedText(n.schedule.days) }))}</p>` : ''}
    ${(n.specials || []).length ? `<p class="hint">📣 ${n.specials.map(sp => esc(sp.title)).join(' · ')}</p>` : ''}
    ${(n.photos || []).length ? '' : `<div class="photonudge"><span aria-hidden="true">📷</span><div><b>${esc(t('nudgeTitle'))}</b><span class="hint">${esc(t('nudgeText'))}</span></div><button class="btn go" type="button" data-edit="photos">${esc(t('addPhotos'))}</button></div>`}
    <div class="otiles">
      <button type="button" class="otile" data-edit="photos"><span aria-hidden="true">📷</span>${esc(t('tilePhotos', { n: (n.photos || []).length }))}</button>
      <button type="button" class="otile" data-edit="specials"><span aria-hidden="true">📣</span>${esc(t('tileSpecial'))}</button>
      <button type="button" class="otile" data-edit="schedule"><span aria-hidden="true">⏰</span>${esc(t('tileSchedule'))}</button>
      <button type="button" class="otile" data-edit="stats"><span aria-hidden="true">📊</span>${esc(t('tileStats'))}</button>
      <button type="button" class="otile" data-edit="details"><span aria-hidden="true">✎</span>${esc(t('editPage'))}</button>
      ${n.approved ? `<button type="button" class="otile" data-share title="${esc(t('shareMineHint'))}"><span aria-hidden="true">↗</span>${esc(t('shareMine'))}</button>` : ''}
    </div></details>
  </div>`;
}

// ---------- profile picture + the name customers see ----------
function profileCard() {
  const pr = state.profile || {};
  return `<div class="profbody">
    <div class="profile">
      <div class="avatar big">${pr.avatar ? `<img src="${esc(pr.avatar)}" alt="">` : '<span aria-hidden="true">👤</span>'}</div>
      <div class="grow" style="display:grid;gap:8px;min-width:0">
        <label for="pName">${esc(t('profileName'))}<input class="field" id="pName" maxlength="60" value="${esc(pr.name || '')}" placeholder="${esc(t('profileNamePh'))}"></label>
        <div class="row-btns">
          <button class="btn" type="button" id="pSave">${esc(t('saveName'))}</button>
          <label class="btn filebtn">${esc(pr.avatar ? t('changePic') : t('addPic'))}<input type="file" accept="image/*" id="pFile" hidden></label>
          ${pr.avatar ? `<button class="btn danger" type="button" id="pRemove">${esc(t('removePic'))}</button>` : ''}
        </div>
        <p class="msg" id="pMsg"></p>
      </div>
    </div>
    <p class="hint">${esc(t('profileNote'))}</p></div>`;
}
function wireProfile() {
  $('pSave').onclick = async () => { if (await act({ action: 'profile', name: clean($('pName').value, 60) }, t('nameSaved'), 'pMsg')) render(); };
  $('pFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    setMsg('pMsg', t('uploading'), true);
    try { const r = await uploadImage('avatar', null, f); state.profile = { ...(state.profile || {}), avatar: r.avatar }; toast(t('picSaved')); render(); }
    catch (err) { setMsg('pMsg', err.message, false); }
  };
  if ($('pRemove')) $('pRemove').onclick = async () => { if (await act({ action: 'removeAvatar' }, t('picRemoved'), 'pMsg')) render(); };
}

// ---------- nakamal photos ----------
function photosCard(n) {
  const ps = n.photos || [];
  return `<div class="card"><h2>${esc(t('photos', { n: ps.length, max: MAX_PHOTOS }))}</h2>
    <p class="hint">${esc(t('photosHint'))}</p>
    <div class="thumbs">${ps.map((p, i) => `<figure class="thumb"><img src="${esc(p.url)}" alt="${i + 1}" loading="lazy">
      ${i === 0 ? `<span class="tag">${esc(t('cover'))}</span>` : ''}<button class="x" type="button" data-rmphoto="${esc(p.id)}" aria-label="${esc(t('removePhotoN', { n: i + 1 }))}">✕</button></figure>`).join('')}
      ${ps.length < MAX_PHOTOS ? `<label class="thumb add"><span>${esc(t('addPhotos'))}</span><input type="file" accept="image/*" multiple id="phFile" hidden></label>` : ''}</div>
    <p class="msg" id="phMsg"></p></div>`;
}
function wirePhotos(n) {
  box.querySelectorAll('[data-rmphoto]').forEach(b => b.onclick = async () => {
    if (await act({ action: 'removePhoto', id: n.id, photoId: b.dataset.rmphoto }, t('photoRemoved'), 'phMsg')) render();
  });
  const input = $('phFile'); if (!input) return;
  input.onchange = async e => {
    const files = [...e.target.files].slice(0, MAX_PHOTOS - (n.photos || []).length);
    for (let i = 0; i < files.length; i++) {
      setMsg('phMsg', t('uploadingN', { i: i + 1, n: files.length }), true);
      try { await uploadImage('photo', n.id, files[i]); }
      catch (err) { setMsg('phMsg', err.message, false); break; }
    }
    await reload();
    if (files.length) toast(files.length > 1 ? t('photosAdded') : t('photoAdded'));
  };
}

// ---------- kava + closing time ----------
function kavaFields(n) {
  return `<div class="row">
    <label for="kFrom">${esc(t('kavaFromLabel'))}<select class="field" id="kFrom"><option value="">${esc(t('notSaying'))}</option>
      ${ISLANDS.map(i => `<option ${n.kavaFrom === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
    <label for="kStr">${esc(t('strength'))}<select class="field" id="kStr"><option value="">${esc(t('notSaying'))}</option>
      ${['mild', 'medium', 'strong'].map(s => `<option value="${s}" ${n.strength === s ? 'selected' : ''}>${esc(t('st.' + s))}</option>`).join('')}</select></label>
    <label for="kClose">${esc(t('closeTime'))}<input class="field" id="kClose" type="time" value="${esc(n.closeTime || '')}"></label></div>
    <p class="hint">${esc(t('closeHint'))}</p>`;
}
const readKava = () => ({ kavaFrom: $('kFrom').value, strength: $('kStr').value, closeTime: $('kClose').value });

function detailFields(n, withContact) {
  const c = (reg && reg.contact) || state.contact || {};
  return `
    <label for="dName">${esc(t('nakName'))}<input class="field" id="dName" maxlength="80" required value="${esc(n.name || '')}" placeholder="${esc(t('nakNamePh'))}"></label>
    <label for="dArea">${esc(t('area'))}<input class="field" id="dArea" maxlength="80" value="${esc(n.area || '')}" placeholder="${esc(t('areaPh'))}"></label>
    <label for="dAbout">${esc(t('aboutThis'))}<textarea class="field" id="dAbout" maxlength="400" placeholder="${esc(t('aboutPh'))}">${esc(n.about || '')}</textarea></label>
    <label for="dHours">${esc(t('usualHours'))}<input class="field" id="dHours" maxlength="80" value="${esc(n.hours || '')}" placeholder="${esc(t('hoursPh'))}"></label>
    ${withContact ? `<div class="row">
      <label for="cOwner">${esc(t('yourName'))}<input class="field" id="cOwner" maxlength="80" required value="${esc(c.owner || state.user.name || '')}" placeholder="${esc(t('fullName'))}"></label>
      <label for="cPhone">${esc(t('phone'))}<input class="field" id="cPhone" type="tel" maxlength="30" required value="${esc(c.phone || '')}" placeholder="555 1234"></label></div>
      <p class="hint">${esc(t('ownerPrivate'))}</p>` : ''}
    <label>${esc(t('location'))}</label>
    <button class="btn" type="button" id="useLoc">${esc(t('useMyLoc'))}</button>
    <div class="picker" id="picker"></div>
    <p class="hint" id="locText">${esc(n.lat ? t('pinOk') : t('pinNone'))}</p>`;
}
const readDetails = () => {
  const loc = picker && picker.value;
  return { name: clean($('dName').value, 80), area: clean($('dArea').value, 80), about: clean($('dAbout').value, 400), hours: clean($('dHours').value, 80), lat: loc && loc.lat, lng: loc && loc.lng };
};

// ---------- registration: 3 short steps ----------
function stepsBar(step) {
  return `<div class="stepsbar" aria-label="${esc(t('stepOf', { a: step }))}">
    ${[1, 2, 3].map(i => `<div class="stp ${i < step ? 'done' : i === step ? 'now' : ''}"><span>${i < step ? '✓' : i}</span><b>${esc(t('step' + i))}</b></div>`).join('')}
  </div><p class="hint">${esc(t('stepOf', { a: step }))}</p>`;
}
function renderRegister(hasOthers) {
  reg ||= { step: 1, data: {}, id: null };
  const needContact = !(state.contact && state.contact.owner && state.contact.phone);
  const head = `${claimNote()}${hasOthers ? `<button class="link backmap" type="button" id="backList">${esc(t('allMine'))}</button>` : ''}
    <div class="card"><h3>${esc(hasOthers ? t('regAnother') : t('regTitle'))}</h3>
      <p class="hint">${esc(t('regHint'))}${hasOthers ? esc(t('regHintMore')) : ''}</p>${stepsBar(reg.step)}</div>`;
  const d = reg.data;
  if (reg.step === 1) {
    box.innerHTML = head + `<form class="card" id="regForm">${detailFields(d, needContact)}
      <button class="primary" type="submit">${esc(t('next'))}</button><p class="msg" id="regMsg"></p></form>`;
    picker = makePicker($('picker'), $('locText'), d.lat ? [d.lat, d.lng] : null, $('useLoc'));
    $('regForm').onsubmit = e => {
      e.preventDefault();
      const x = readDetails();
      if (x.name.length < 2) return setMsg('regMsg', t('enterName'), false);
      if (!x.lat) return setMsg('regMsg', t('tapMap'), false);
      if (needContact) {
        const c = { owner: clean($('cOwner').value, 80), phone: clean($('cPhone').value, 30) };
        if (c.owner.length < 2 || c.phone.replace(/\D/g, '').length < 5) return setMsg('regMsg', t('needContact'), false);
        reg.contact = c;
      }
      Object.assign(d, x); reg.step = 2; render(); scrollTo({ top: 0 });
    };
  } else if (reg.step === 2) {
    box.innerHTML = head + `<form class="card" id="regForm"><h2>${esc(t('kavaDetails'))}</h2>${kavaFields(d)}
      <h2>${esc(t('prices'))}</h2><div id="prows">${priceRows(d.prices)}</div>
      <div class="row-btns"><button class="btn" type="button" id="addPrice">${esc(t('addPrice'))}</button></div>
      <p class="hint">${esc(t('regTerms'))}</p>
      <div class="row-btns"><button class="btn" type="button" id="prevStep">${esc(t('prevStep'))}</button><button class="primary grow" type="submit">${esc(t('submit'))}</button></div>
      <p class="msg" id="priceMsg"></p><p class="msg" id="regMsg"></p></form>`;
    wirePrices();
    $('prevStep').onclick = () => { Object.assign(d, readKava(), { prices: readPrices() }); reg.step = 1; render(); };
    $('regForm').onsubmit = async e => {
      e.preventDefault();
      Object.assign(d, readKava(), { prices: readPrices() });
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      const body = { action: 'register', name: d.name, area: d.area, about: d.about, hours: d.hours, lat: d.lat, lng: d.lng, kavaFrom: d.kavaFrom, strength: d.strength, closeTime: d.closeTime };
      if (reg.contact) body.contact = reg.contact;
      const r = await act(body, null, 'regMsg');
      if (r && d.prices.length) await act({ action: 'prices', id: r.id, prices: d.prices }, null, 'regMsg');
      btn.disabled = false;
      if (r) { reg.id = r.id; reg.step = 3; toast(t('submitted')); render(); scrollTo({ top: 0 }); }
    };
  } else {
    const n = state.nakamals.find(x => x.id === reg.id) || { id: reg.id, photos: [] };
    box.innerHTML = head + `<div class="card"><p>${esc(t('step3Hint'))}</p></div>${photosCard(n)}
      <div class="row-btns"><button class="primary grow" type="button" id="regDone">${esc((n.photos || []).length ? t('finish') : t('skipPhotos'))}</button></div>`;
    wirePhotos(n);
    $('regDone').onclick = () => { adding = false; reg = null; render(); scrollTo({ top: 0 }); };
  }
  if ($('backList')) $('backList').onclick = () => { adding = false; reg = null; render(); };
}

// ---------- edit one nakamal: four short tabs instead of one long page ----------
function renderEdit(n) {
  const tabs = [['stats', t('tabStats')], ['specials', t('tabSpecials')], ['schedule', t('tabSchedule')], ['photos', t('tabPhotos')], ['kava', t('tabKava')], ['details', t('tabDetails')], ['more', t('tabMore')]];
  let body = '';
  if (editTab === 'photos') body = photosCard(n);
  if (editTab === 'stats') body = statsCard(n);
  if (editTab === 'schedule') body = scheduleCard(n);
  if (editTab === 'specials') body = specialsCard(n);
  if (editTab === 'kava') body = `<form class="card" id="kavaForm"><h2>${esc(t('kavaDetails'))}</h2>${kavaFields(n)}
      <h2>${esc(t('prices'))}</h2><div id="prows">${priceRows(n.prices)}</div>
      <div class="row-btns"><button class="btn" type="button" id="addPrice">${esc(t('addPrice'))}</button></div>
      <button class="primary" type="submit">${esc(t('save'))}</button><p class="msg" id="priceMsg"></p></form>`;
  if (editTab === 'details') body = `<form class="card" id="detailsForm">${detailFields(n)}
      <button class="primary" type="submit">${esc(t('savePage'))}</button><p class="msg" id="detailsMsg"></p></form>`;
  if (editTab === 'more') body = `<div class="card"><h2>${esc(t('yourContact'))}</h2>
      <div class="row">
        <label for="cOwner2">${esc(t('yourName'))}<input class="field" id="cOwner2" maxlength="80" value="${esc((state.contact || {}).owner || '')}"></label>
        <label for="cPhone2">${esc(t('phone'))}<input class="field" id="cPhone2" type="tel" maxlength="30" value="${esc((state.contact || {}).phone || '')}"></label></div>
      <p class="hint">${esc(t('ownerPrivate'))}</p>
      <div class="row-btns"><button class="btn" type="button" id="saveContact">${esc(t('saveContact'))}</button></div><p class="msg" id="contactMsg"></p></div>
    <div class="card"><h2>${esc(t('removeTitle'))}</h2><p class="hint">${esc(t('removeHint'))}</p>
      <div class="row-btns"><button class="btn danger" id="delBtn" type="button">${esc(t('removeBtn', { name: n.name }))}</button><button class="btn danger" id="delYes" type="button" hidden>${esc(t('removeYes'))}</button></div></div>`;
  box.innerHTML = `
    <button class="link backmap" type="button" id="backList">${esc(t('allMine'))}</button>
    <div class="card"><div class="ocardtop"><h3 style="flex:1">${esc(n.name)}</h3>${pill(n)}</div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${editTab === k}">${esc(l)}</button>`).join('')}</div></div>
    ${body}`;
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { editTab = b.dataset.tab; render(); });
  $('backList').onclick = () => { editId = null; render(); };
  if (editTab === 'photos') wirePhotos(n);
  if (editTab === 'specials') wireSpecials(n);
  if (editTab === 'schedule') wireSchedule(n);
  if (editTab === 'kava') {
    wirePrices();
    $('kavaForm').onsubmit = async e => {
      e.preventDefault();
      const a = await act({ action: 'kava', id: n.id, ...readKava() }, null, 'priceMsg');
      const b = a && await act({ action: 'prices', id: n.id, prices: readPrices() }, t('saved'), 'priceMsg');
      if (b) setMsg('priceMsg', t('saved'), true);
    };
  }
  if (editTab === 'details') {
    picker = makePicker($('picker'), $('locText'), [n.lat, n.lng], $('useLoc'));
    $('detailsForm').onsubmit = async e => {
      e.preventDefault();
      const d = readDetails();
      if (d.name.length < 2) return setMsg('detailsMsg', t('enterName'), false);
      if (await act({ action: 'update', id: n.id, ...d }, t('pageSaved'), 'detailsMsg')) setMsg('detailsMsg', t('saved'), true);
    };
  }
  if (editTab === 'more') {
    $('saveContact').onclick = async () => { if (await act({ action: 'contact', contact: { owner: clean($('cOwner2').value, 80), phone: clean($('cPhone2').value, 30) } }, t('contactSaved'), 'contactMsg')) setMsg('contactMsg', t('saved'), true); };
    $('delBtn').onclick = () => { $('delYes').hidden = false; };
    $('delYes').onclick = async () => { if (await act({ action: 'remove', id: n.id }, t('removed', { name: n.name }))) { editId = null; render(); } };
  }
}

// ---------- business stats ----------
function statsCard(n) {
  const st = n.stats;
  if (!st) return `<div class="card"><p class="hint">${esc(t('loading'))}</p></div>`;
  const tile = (v, l) => `<div class="stat"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`;
  const max = Math.max(1, ...st.views), wmax = Math.max(1, ...st.byWeekday), wd = t('wd').split(',');
  const empty = !st.viewsTotal && !st.nightsOpen && !st.rating.count;
  return `<div class="stats">${tile(st.viewsTotal, t('statViews'))}${tile(st.followers, t('statFollowers'))}${tile(st.rating.count ? '★ ' + st.rating.avg : '—', t('statRating', { n: st.rating.count }))}${tile(st.nightsOpen, t('statNights'))}</div>
    ${empty ? `<div class="card"><p class="hint">${esc(t('statNoData'))}</p></div>` : ''}
    <div class="card"><h2>${esc(t('statViewsDay'))}</h2>
      <div class="bars" role="img" aria-label="${esc(t('statViewsDay'))}">${st.views.map((v, i) => `<span style="height:${Math.round(v / max * 100)}%" title="${esc(st.days[i])}: ${v}"></span>`).join('')}</div>
      <div class="barlabels"><span>${esc(st.days[0].slice(5))}</span><span>${esc(st.days[st.days.length - 1].slice(5))}</span></div></div>
    <div class="card"><h2>${esc(t('statBusiest'))}</h2>
      <div class="wdays">${st.byWeekday.map((v, i) => `<div><span class="wbar"><i style="height:${Math.round(v / wmax * 100)}%"></i></span><b>${esc(wd[i])}</b><small>${v}</small></div>`).join('')}</div>
      ${st.usualStart ? `<p class="hint">${esc(t('statUsual', { t: st.usualStart }))}</p>` : ''}</div>
    <p class="hint">${esc(t('statTip'))}</p>`;
}

// ---------- light schedule ----------
function scheduleCard(n) {
  const sc = n.schedule || { enabled: false, days: [null, null, null, null, null, { on: '17:00', off: '23:00' }, { on: '17:00', off: '23:00' }] };
  return `<form class="card authform" id="schedForm"><h2>${esc(t('schedTitle'))}</h2>
    <p class="hint">${esc(t('schedHint'))}</p>
    <label class="check"><input type="checkbox" id="schedOn" ${sc.enabled ? 'checked' : ''}>${esc(t('schedOn'))}</label>
    ${schedGridHtml(sc.days)}
    <p class="hint">${esc(t('schedAfterMid'))} ${esc(t('sched24hint'))} ${esc(t('schedLow'))}</p>
    <button class="primary" type="submit">${esc(t('schedSave'))}</button><p class="msg" id="schedMsg"></p></form>`;
}
function wireSchedule(n) {
  const f = $('schedForm');
  wireSchedGrid(f);
  f.onsubmit = async e => {
    e.preventDefault();
    if (await act({ action: 'schedule', id: n.id, enabled: $('schedOn').checked, days: readSchedGrid(f) }, t('schedSaved'), 'schedMsg')) setMsg('schedMsg', t('saved'), true);
  };
}

// ---------- specials and events ----------
function specialsCard(n) {
  const today = new Date(Date.now() + 11 * 3600e3).toISOString().slice(0, 10);
  const list = n.specials || [];
  return `<div class="card"><h2>${esc(t('tabSpecials'))}</h2>
      ${list.length ? list.map(sp => `<div class="sprow"><div><b>${sp.kind === 'event' ? '🎶' : '🏷️'} ${esc(sp.title)}</b><div class="hint">${esc(sp.date)}${sp.from ? ' · ' + esc(sp.from) : ''}${sp.to ? '–' + esc(sp.to) : ''}${sp.text ? ' · ' + esc(sp.text) : ''}</div></div>
        <button class="btn danger" type="button" data-unsp="${esc(sp.id)}">${esc(t('spRemove'))}</button></div>`).join('') : `<p class="hint">${esc(t('spNone'))}</p>`}
    </div>
    <form class="card authform" id="spForm"><h2>${esc(t('postSpecial'))}</h2>
      <p class="hint">${esc(t('spHint'))}${n.approved ? '' : ' ' + esc(t('spPending'))}</p>
      <div class="seg" role="group" aria-label="${esc(t('spKind'))}"><button type="button" data-kind="deal" aria-pressed="true">🏷️ ${esc(t('spDeal'))}</button><button type="button" data-kind="event" aria-pressed="false">🎶 ${esc(t('spEvent'))}</button></div>
      <label for="spTitle">${esc(t('spTitle'))}<input class="field" id="spTitle" maxlength="60" required placeholder="${esc(t('spTitlePh'))}"></label>
      <label for="spText">${esc(t('spText'))}<input class="field" id="spText" maxlength="200"></label>
      <div class="row">
        <label for="spDate">${esc(t('spDate'))}<input class="field" id="spDate" type="date" value="${today}" min="${today}" required></label>
        <label for="spFrom">${esc(t('spFrom'))}<input class="field" id="spFrom" type="time"></label>
        <label for="spTo">${esc(t('spTo'))}<input class="field" id="spTo" type="time"></label></div>
      <button class="primary" type="submit">${esc(t('spPost'))}</button><p class="msg" id="spMsg"></p></form>`;
}
function wireSpecials(n) {
  let kind = 'deal';
  box.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { kind = b.dataset.kind; box.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  box.querySelectorAll('[data-unsp]').forEach(b => b.onclick = async () => { if (await act({ action: 'unspecial', id: n.id, specialId: b.dataset.unsp }, t('spRemoved'))) render(); });
  $('spForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const r = await act({ action: 'special', id: n.id, kind, title: clean($('spTitle').value, 60), text: clean($('spText').value, 200), date: $('spDate').value, from: $('spFrom').value, to: $('spTo').value }, t('spPosted'), 'spMsg');
    btn.disabled = false;
    if (r) render();
  };
}

function priceRows(prices) {
  const rows = Array.isArray(prices) && prices.length ? prices.map(p => [p.item, p.price]) : [['Small shell', ''], ['Big shell', ''], ['Takeaway bottle', '']];
  return rows.map(([item, price], i) => priceRow(i, item, price)).join('');
}
const priceRow = (i, item = '', price = '') => `<div class="prow">
  <input class="field" id="pi-${i}" maxlength="40" value="${esc(item)}" placeholder="${esc(t('priceItem'))}" aria-label="${esc(t('priceItem'))}">
  <input class="field" id="pp-${i}" maxlength="24" value="${esc(price)}" placeholder="${esc(t('priceVal'))}" aria-label="${esc(t('priceVal'))}">
  <button class="x" type="button" data-rm aria-label="${esc(t('removePrice'))}">✕</button></div>`;
function wirePrices() {
  $('prows').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) b.closest('.prow').remove(); };
  $('addPrice').onclick = () => {
    if ($('prows').children.length >= 8) return setMsg('priceMsg', t('maxPrices'), false);
    $('prows').insertAdjacentHTML('beforeend', priceRow(Date.now()));
  };
}
const readPrices = () => [...document.querySelectorAll('#prows .prow')].map(r => {
  const [a, b] = r.querySelectorAll('input');
  return { item: clean(a.value, 40), price: clean(b.value, 24) };
}).filter(p => p.item && p.price).slice(0, 8);
})();
