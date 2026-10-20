// Owner page: create account / log in, then manage any number of nakamals from one login.
// /owner?quick=1 is the one-tap light page owners can keep on their home screen.
(() => {
const { t, $, esc, clean, LIGHT, updatedLine, reportWhat, toast, setMsg, makePicker, uploadImage } = KL;
const { start, authed, signOut } = KLAuthUI;
const { applyStatic, langButton } = KLi18n;
const MAX_PHOTOS = 6;
const ISLANDS = ['Pentecost', 'Tanna', 'Malo', 'Santo', 'Ambae', 'Maewo', 'Epi', 'Malekula', 'Efate', 'Other'];
const box = $('box');
let state = null;           // { user, phoneLogin, contact, profile, nakamals }
let picker = null, editId = null, adding = false, auth = null;
let quick = new URLSearchParams(location.search).get('quick') === '1';

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

async function reload() {
  try { state = await authed('/api/owner'); render(); }
  catch (e) { box.innerHTML = `<div class="card"><h3>${esc(t('loadFail'))}</h3><p class="hint">${esc(e.message)}</p><button class="btn" id="retry">${esc(t('tryAgain'))}</button></div>`; $('retry').onclick = reload; }
}
async function act(body, okText, msgId) {
  try {
    const r = await authed('/api/owner', body);
    if (r.nakamals) state.nakamals = r.nakamals;
    if (r.profile) state.profile = r.profile;
    if (body.contact) state.contact = { ...(state.contact || {}), ...body.contact };
    if (okText) toast(okText);
    return r;
  } catch (e) { msgId ? setMsg(msgId, e.message, false) : toast(e.message); return null; }
}

function render() {
  if (picker) { picker.remove(); picker = null; }
  const mine = state.nakamals;
  if (!mine.length || adding) return renderRegister(mine.length > 0);
  if (quick) return renderQuick(mine);
  const ed = editId && mine.find(n => n.id === editId);
  if (ed) return renderEdit(ed);
  editId = null;
  const pending = mine.filter(n => !n.approved).length;
  box.innerHTML = `
    <div class="card"><div class="row" style="align-items:center">
      <div><h3>${esc(t('myNakamals'))}</h3><p class="hint">${esc(t('countMine', { n: mine.length }))}${pending ? esc(t('waitingVisit', { n: pending })) : ''}. ${esc(t('setEvening'))}</p></div>
      <button class="btn" type="button" id="addBtn" style="flex:0 0 auto">${esc(t('addNakamal'))}</button></div>
      <a class="btn quickbtn" href="?quick=1">${esc(t('quickOpen'))}</a></div>
    ${profileCard()}
    ${mine.map(ownerCard).join('')}
    <p class="hint">${esc(t('staleNote'))}</p>`;
  $('addBtn').onclick = () => { adding = true; render(); scrollTo({ top: 0 }); };
  wireProfile();
  wireCards(mine);
}

// ---------- one-tap light page ----------
function renderQuick(mine) {
  box.innerHTML = `<div class="card"><h3>⚡ ${esc(t('quickTitle'))}</h3><p class="hint">${esc(t('quickHint'))}</p></div>
    ${mine.map(n => `<div class="card ocard" data-card="${esc(n.id)}">
      <div class="top" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="flex:1">${esc(n.name)}</h3>${pill(n)}</div>
      ${lightButtons(n)}<div class="line">${esc(updatedLine(n))}</div></div>`).join('')}
    <a class="btn" href="?">${esc(t('fullPage'))}</a>`;
  wireCards(mine);
}

const pill = n => n.approved ? `<span class="pill l-${n.shown}"><span class="dot">${LIGHT[n.shown].sym}</span>${esc(t('customersSee', { light: LIGHT[n.shown].label }))}</span>`
  : `<span class="pill l-pending"><span class="dot"></span>${esc(t('pendingVer'))}</span>`;
const lightButtons = n => `<div class="lights small" role="group" aria-label="${esc(t('setLightFor', { name: n.name }))}">
  <button class="light l-green" data-light="green" aria-pressed="${n.shown === 'green'}"><span class="bulb"></span>${esc(t('l.green'))}</button>
  <button class="light l-amber" data-light="amber" aria-pressed="${n.shown === 'amber'}"><span class="bulb"></span>${esc(t('l.amber'))}</button>
  <button class="light l-closed" data-light="closed" aria-pressed="${n.shown === 'closed'}"><span class="bulb">✕</span>${esc(t('l.closed'))}</button></div>`;

function wireCards(mine) {
  box.querySelectorAll('[data-card]').forEach(card => {
    const id = card.dataset.card, n = mine.find(x => x.id === id);
    card.querySelectorAll('[data-light]').forEach(b => b.onclick = async () => {
      const l = b.dataset.light;
      card.querySelectorAll('[data-light]').forEach(x => x.setAttribute('aria-pressed', x === b));
      if (await act({ action: 'light', id, light: l }, n.approved ? t('lightSaved', { name: n.name, light: LIGHT[l].label }) : t('savedPending'))) render();
    });
    const note = card.querySelector('[data-note]');
    if (note) note.onclick = async () => { if (await act({ action: 'note', id, note: clean(card.querySelector('input').value, 120) }, t('noteSaved'))) render(); };
    const ed = card.querySelector('[data-edit]');
    if (ed) ed.onclick = () => { editId = id; render(); scrollTo({ top: 0 }); };
  });
}

function ownerCard(n) {
  return `<div class="card ocard" data-card="${esc(n.id)}">
    ${n.photos && n.photos.length ? `<img class="cover" src="${esc(n.photos[0].url)}" alt="${esc(n.name)}" loading="lazy">` : ''}
    <div class="top" style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:0"><h3>${esc(n.name)}</h3>${n.area ? `<div class="line">${esc(n.area)}</div>` : ''}</div>${pill(n)}
    </div>
    ${n.approved ? '' : `<p class="hint pendingnote">${n.visitDate ? t('visitOn', { date: esc(n.visitDate) }) : esc(t('visitCall'))}</p>`}
    ${n.reports ? `<p class="hint pendingnote">${esc(t('reportsNow', { n: n.reports.count, what: reportWhat(n.reports) }))}</p>` : ''}
    ${lightButtons(n)}
    <div class="line">${esc(updatedLine(n))}</div>
    <div class="prow2"><input class="field" id="note-${esc(n.id)}" maxlength="120" value="${esc(n.note || '')}" placeholder="${esc(t('notePh'))}" aria-label="${esc(t('noteAria'))}">
      <button class="btn" type="button" data-note>${esc(t('saveNote'))}</button></div>
    ${n.approved ? `<div class="line">${esc(t('viewsWeek', { n: n.viewsWeek || 0 }))}</div>` : ''}
    <div class="row-btns"><button class="btn" type="button" data-edit>${esc(n.photos && n.photos.length ? t('editAll') : t('editAdd'))}</button></div>
  </div>`;
}

// ---------- profile picture + the name customers see ----------
function profileCard() {
  const pr = state.profile || {};
  return `<div class="card"><h2>${esc(t('yourProfile'))}</h2>
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
  const c = state.contact || {};
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

function renderRegister(hasOthers) {
  const needContact = !(state.contact && state.contact.owner && state.contact.phone);
  box.innerHTML = `
    ${hasOthers ? `<button class="link backmap" type="button" id="backList">${esc(t('allMine'))}</button>` : ''}
    <div class="card"><h3>${esc(hasOthers ? t('regAnother') : t('regTitle'))}</h3>
      <p class="hint">${esc(t('regHint'))}${hasOthers ? esc(t('regHintMore')) : ''}</p></div>
    <form class="card" id="regForm">${detailFields({}, needContact)}
      <h2>${esc(t('kavaDetails'))}</h2>${kavaFields({})}
      <p class="hint">${esc(t('regTerms'))}</p>
      <button class="primary" type="submit">${esc(t('submit'))}</button>
      <p class="msg" id="regMsg"></p></form>`;
  picker = makePicker($('picker'), $('locText'), null, $('useLoc'));
  if ($('backList')) $('backList').onclick = () => { adding = false; render(); };
  $('regForm').onsubmit = async e => {
    e.preventDefault();
    const d = readDetails();
    if (d.name.length < 2) return setMsg('regMsg', t('enterName'), false);
    if (!d.lat) return setMsg('regMsg', t('tapMap'), false);
    const body = { action: 'register', ...d, ...readKava() };
    if (needContact) body.contact = { owner: clean($('cOwner').value, 80), phone: clean($('cPhone').value, 30) };
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const r = await act(body, t('submitted'), 'regMsg');
    btn.disabled = false;
    if (r) { adding = false; render(); scrollTo({ top: 0 }); }
  };
}

function renderEdit(n) {
  box.innerHTML = `
    <button class="link backmap" type="button" id="backList">${esc(t('allMine'))}</button>
    <div class="card"><h3>${esc(n.name)}</h3><p class="hint">${esc(n.approved ? t('onMap') : t('pendingVer'))}</p></div>
    ${photosCard(n)}
    <form class="card" id="kavaForm"><h2>${esc(t('kavaDetails'))}</h2>${kavaFields(n)}
      <button class="primary" type="submit">${esc(t('saveKava'))}</button><p class="msg" id="kavaMsg"></p></form>
    <form class="card" id="priceForm"><h2>${esc(t('prices'))}</h2>
      <div id="prows">${priceRows(n.prices)}</div>
      <div class="row-btns"><button class="btn" type="button" id="addPrice">${esc(t('addPrice'))}</button></div>
      <button class="primary" type="submit">${esc(t('savePrices'))}</button><p class="msg" id="priceMsg"></p></form>
    <form class="card" id="detailsForm"><h2>${esc(t('pageDetails'))}</h2>${detailFields(n)}
      <button class="primary" type="submit">${esc(t('savePage'))}</button><p class="msg" id="detailsMsg"></p></form>
    <div class="card"><h2>${esc(t('yourContact'))}</h2>
      <div class="row">
        <label for="cOwner2">${esc(t('yourName'))}<input class="field" id="cOwner2" maxlength="80" value="${esc((state.contact || {}).owner || '')}"></label>
        <label for="cPhone2">${esc(t('phone'))}<input class="field" id="cPhone2" type="tel" maxlength="30" value="${esc((state.contact || {}).phone || '')}"></label></div>
      <div class="row-btns"><button class="btn" type="button" id="saveContact">${esc(t('saveContact'))}</button></div><p class="msg" id="contactMsg"></p></div>
    <div class="card"><h2>${esc(t('removeTitle'))}</h2><p class="hint">${esc(t('removeHint'))}</p>
      <div class="row-btns"><button class="btn danger" id="delBtn" type="button">${esc(t('removeBtn', { name: n.name }))}</button><button class="btn danger" id="delYes" type="button" hidden>${esc(t('removeYes'))}</button></div></div>`;
  picker = makePicker($('picker'), $('locText'), [n.lat, n.lng], $('useLoc'));
  $('backList').onclick = () => { editId = null; render(); };
  wirePhotos(n);
  wirePrices();
  $('kavaForm').onsubmit = async e => { e.preventDefault(); if (await act({ action: 'kava', id: n.id, ...readKava() }, t('kavaSaved'), 'kavaMsg')) setMsg('kavaMsg', t('saved'), true); };
  $('priceForm').onsubmit = async e => { e.preventDefault(); if (await act({ action: 'prices', id: n.id, prices: readPrices() }, t('pricesSaved'), 'priceMsg')) setMsg('priceMsg', t('saved'), true); };
  $('detailsForm').onsubmit = async e => {
    e.preventDefault();
    const d = readDetails();
    if (d.name.length < 2) return setMsg('detailsMsg', t('enterName'), false);
    if (await act({ action: 'update', id: n.id, ...d }, t('pageSaved'), 'detailsMsg')) setMsg('detailsMsg', t('saved'), true);
  };
  $('saveContact').onclick = async () => { if (await act({ action: 'contact', contact: { owner: clean($('cOwner2').value, 80), phone: clean($('cPhone2').value, 30) } }, t('contactSaved'), 'contactMsg')) setMsg('contactMsg', t('saved'), true); };
  $('delBtn').onclick = () => { $('delYes').hidden = false; };
  $('delYes').onclick = async () => { if (await act({ action: 'remove', id: n.id }, t('removed', { name: n.name }))) { editId = null; render(); } };
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
