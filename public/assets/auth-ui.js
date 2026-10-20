// Login screens shared by the owner and team pages: choose → create account / log in (email or phone + PIN),
// Google, forgot password, and finishing links from emails.
// KLAuthUI.start({ box, allowSignup, title(), intro(), onUser(user) })
(() => {
const { $, esc, toast, setMsg } = KL;
const t = KL.t;
const A = window.KLAuth;
// Phone logins made by the team: phone digits + this ending, e.g. 5551234@phone.killimlight.invalid
const PHONE_DOMAIN = 'phone.killimlight.invalid';
const toLogin = v => {
  v = String(v || '').trim();
  if (v.includes('@')) return { email: v, phone: false };
  let d = v.replace(/\D/g, '');
  if (d.startsWith('678') && d.length > 7) d = d.slice(3);
  return { email: `${d}@${PHONE_DOMAIN}`, phone: d.length >= 5 };
};

async function start({ box, allowSignup, title, intro, onUser }) {
  let settings = { providers: {}, disableSignup: false, autoconfirm: false };
  try { settings = await A.getSettings(); } catch {}
  const google = settings.providers && settings.providers.google;
  let view = () => (allowSignup ? showChoice() : showForm('login'));
  const ctl = { redraw: () => view() };

  // Finish links coming back from email confirmation, password reset or Google.
  try {
    const cb = await A.handleAuthCallback();
    if (cb?.type === 'recovery') { showNewPassword(); return ctl; }
    if (cb?.type === 'confirmation') toast(t('emailConfirmed'));
  } catch (e) {
    showForm('login', t('linkExpired'));
    return ctl;
  }
  const user = await A.getUser();
  if (user) { onUser(user); return ctl; }
  view();
  return ctl;

  // First screen for owners: pick "Create account" or "Log in" before any form appears.
  function showChoice() {
    view = showChoice;
    box.innerHTML = `<div class="card authcard choice">
      <h3>${esc(title())}</h3>
      <p class="hint">${esc(t('needAccount'))}</p>
      <button class="primary big" type="button" data-go="signup">${esc(t('createAccount'))}<small>${esc(t('createSub'))}</small></button>
      <button class="btn big" type="button" data-go="login">${esc(t('logIn'))}<small>${esc(t('logInSub'))}</small></button>
      <ol class="steps"><li>${esc(t('step1'))}</li><li>${esc(t('step2'))}</li><li>${esc(t('step3'))}</li></ol>
      <p class="hint">${esc(t('noEmail'))}</p></div>`;
    box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showForm(b.dataset.go));
  }

  function showForm(mode, notice, prefill = '') {
    view = () => showForm(mode, notice, $('aEmail') ? $('aEmail').value : prefill);
    const signupOn = allowSignup && !settings.disableSignup;
    box.innerHTML = `<div class="card authcard">
      <h3>${esc(mode === 'signup' ? t('createYours') : title())}</h3>
      ${intro && !allowSignup ? `<p class="hint">${esc(intro())}</p>` : ''}
      ${allowSignup ? `<button class="link" type="button" id="backChoice">${esc(t('back'))}</button>` : ''}
      ${signupOn ? `<div class="views" role="tablist" style="margin:0">
        <button role="tab" type="button" data-mode="signup" aria-selected="${mode === 'signup'}">${esc(t('tabCreate'))}</button>
        <button role="tab" type="button" data-mode="login" aria-selected="${mode === 'login'}">${esc(t('tabLogin'))}</button></div>` : ''}
      ${notice ? `<p class="banner" style="margin:0">${esc(notice)}</p>` : ''}
      ${google ? `<button class="btn google" type="button" id="gBtn"><span aria-hidden="true">G</span> ${esc(t('google'))}</button><div class="or">${esc(t('orEmail'))}</div>` : ''}
      <form id="authForm" class="authform">
        ${mode === 'signup' ? `<label for="aName">${esc(t('yourName'))}<input class="field" id="aName" autocomplete="name" maxlength="80" required></label>` : ''}
        <label for="aEmail">${esc(mode === 'signup' ? t('email') : t('emailOrPhone'))}<input class="field" id="aEmail" type="${mode === 'signup' ? 'email' : 'text'}" inputmode="email" autocomplete="${mode === 'signup' ? 'email' : 'username'}" required value="${esc(prefill)}"></label>
        <label for="aPass">${esc(mode === 'signup' ? t('password') : t('passwordOrPin'))}<input class="field" id="aPass" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="${mode === 'signup' ? 8 : 1}" required></label>
        ${mode === 'signup' ? `<p class="hint">${esc(t('pwHint'))}</p>` : ''}
        <button class="primary" type="submit">${esc(mode === 'signup' ? t('tabCreate') : t('logIn'))}</button>
        <p class="msg" id="aMsg"></p>
        <div class="row-btns" id="aHelp" hidden></div>
      </form>
      ${mode === 'login' ? `<button class="link" type="button" id="forgot">${esc(t('forgot'))}</button>` : ''}
    </div>`;
    box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => showForm(b.dataset.mode, null, $('aEmail').value));
    if ($('backChoice')) $('backChoice').onclick = showChoice;
    if ($('gBtn')) $('gBtn').onclick = () => A.oauthLogin('google');
    if ($('forgot')) $('forgot').onclick = () => {
      const v = $('aEmail').value;
      if (v && !v.includes('@') && /\d{5}/.test(v.replace(/\D/g, ''))) return setMsg('aMsg', t('forgotPin'), false);
      showForgot(v);
    };
    $('authForm').onsubmit = async e => {
      e.preventDefault();
      const raw = $('aEmail').value.trim(), pass = $('aPass').value;
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      const help = $('aHelp'); help.hidden = true; help.innerHTML = '';
      const offer = buttons => {
        help.innerHTML = buttons.map(([id, label, primary]) => `<button class="btn${primary ? ' go' : ''}" type="button" id="${id}">${esc(label)}</button>`).join('');
        help.hidden = false;
        if ($('hLogin')) $('hLogin').onclick = () => showForm('login', null, raw);
        if ($('hReset')) $('hReset').onclick = () => showForgot(raw);
      };
      const login = toLogin(raw);
      try {
        if (mode === 'signup') {
          await A.signup(raw, pass, { full_name: $('aName').value.trim() });
          const now = await A.getUser();
          if (now) return onUser(now);
          view = () => {};
          box.innerHTML = `<div class="card authcard"><h3>${esc(t('checkEmail'))}</h3>
            <p>${t('checkEmailText', { email: esc(raw) })}</p><p class="hint">${esc(t('spam'))}</p>
            <button class="btn" type="button" id="backLogin">${esc(t('backToLogin'))}</button></div>`;
          $('backLogin').onclick = () => showForm('login', null, raw);
        } else {
          onUser(await A.login(login.email, pass));
        }
      } catch (err) {
        btn.disabled = false;
        const m = String(err && err.message || '');
        if (/already|registered|exists/i.test(m)) {
          setMsg('aMsg', t('emailTaken', { email: raw }) + (google ? t('emailTakenG') : ''), false);
          offer([['hLogin', t('loginThis'), true], ['hReset', t('resetMine')]]);
        } else if (/confirm/i.test(m)) {
          setMsg('aMsg', t('confirmFirst'), false);
        } else if (/invalid|password|credentials|grant/i.test(m)) {
          setMsg('aMsg', login.phone ? t('wrongLogin') + ' ' + t('forgotPin') : t('wrongLogin'), false);
          if (!login.phone && raw) offer([['hReset', t('resetThis')]]);
        } else {
          setMsg('aMsg', m || t('loginFail'), false);
        }
      }
    };
  }

  function showForgot(email) {
    view = () => showForgot($('fEmail') ? $('fEmail').value : email);
    box.innerHTML = `<div class="card authcard"><h3>${esc(t('resetTitle'))}</h3>
      <p class="hint">${esc(t('resetHint'))}</p>
      <form id="fForm" class="authform">
        <label for="fEmail">${esc(t('email'))}<input class="field" id="fEmail" type="email" autocomplete="email" required value="${esc(email && email.includes('@') ? email : '')}"></label>
        <button class="primary" type="submit">${esc(t('sendReset'))}</button><p class="msg" id="fMsg"></p></form>
      <button class="link" type="button" id="backLogin">${esc(t('backToLogin'))}</button></div>`;
    $('backLogin').onclick = () => showForm('login', null, $('fEmail').value);
    $('fForm').onsubmit = async e => {
      e.preventDefault();
      try { await A.requestPasswordRecovery($('fEmail').value.trim()); setMsg('fMsg', t('resetSent'), true); }
      catch { setMsg('fMsg', t('resetFail'), false); }
    };
  }

  function showNewPassword() {
    view = showNewPassword;
    box.innerHTML = `<div class="card authcard"><h3>${esc(t('newPwTitle'))}</h3>
      <form id="pForm" class="authform">
        <label for="pPass">${esc(t('newPw'))}<input class="field" id="pPass" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="primary" type="submit">${esc(t('savePw'))}</button><p class="msg" id="pMsg"></p></form></div>`;
    $('pForm').onsubmit = async e => {
      e.preventDefault();
      try { await A.updateUser({ password: $('pPass').value }); toast(t('pwSaved')); onUser(await A.getUser()); }
      catch { setMsg('pMsg', t('pwFail'), false); }
    };
  }
}

// Calls an API; if the login has quietly expired, refresh it once and retry.
async function authed(path, body) {
  try { return await KL.api(path, body); }
  catch (e) {
    if (e.status !== 401) throw e;
    try { await A.refreshSession(); } catch {}
    return KL.api(path, body);
  }
}
async function signOut() { try { await A.logout(); } catch {} location.reload(); }
const isPhoneEmail = e => !!e && e.endsWith('@' + PHONE_DOMAIN);

window.KLAuthUI = { start, authed, signOut, isPhoneEmail, PHONE_DOMAIN };
})();
