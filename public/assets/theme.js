// Runs first on every page: picks the day or night look before anything is drawn, and notes "low data" phones.
// Night look: nakamals are dark places, so after sunset (6 pm to 6 am on the phone's clock) the app turns deep kava brown.
// The sun/moon button in the top bar changes it by hand; that choice lasts 12 hours, then the app follows the clock again.
(() => {
  const KEY = 'kl-theme', root = document.documentElement;
  const saved = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === 'light' || raw === 'dark') return raw;
      const v = JSON.parse(raw || 'null');
      return v && (v.t === 'light' || v.t === 'dark') && Date.now() - v.at < 12 * 3600e3 ? v.t : null;
    } catch (e) { return null; }
  };
  const night = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };
  const auto = () => ((window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) || night()) ? 'dark' : 'light';
  const paint = () => {
    const t = saved() || auto();
    root.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === 'dark' ? '#2B1B0F' : '#3B2616';
    const b = document.getElementById('themeBtn');
    if (b) { b.textContent = t === 'dark' ? '☀️' : '🌙'; b.setAttribute('aria-label', t === 'dark' ? 'Laet (day look)' : 'Tudak (night look)'); b.title = b.getAttribute('aria-label'); }
    return t;
  };
  paint();

  // Low data: the phone's own "data saver", a very slow connection, or the choice kept on this phone.
  const conn = navigator.connection || {};
  let lite = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  try { const v = localStorage.getItem('kl-lite'); if (v === '1') lite = true; if (v === '0') lite = false; } catch (e) {}
  if (lite) root.dataset.lite = '1';
  window.KLprefs = {
    lite: () => root.dataset.lite === '1',
    setLite(on) { try { localStorage.setItem('kl-lite', on ? '1' : '0'); } catch (e) {} if (on) root.dataset.lite = '1'; else delete root.dataset.lite; },
    theme: () => root.dataset.theme,
    reducedMotion: () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };

  const ready = () => {
    const nav = document.querySelector('.topnav');
    if (nav && !document.getElementById('themeBtn')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'themeBtn'; b.className = 'tbtn icon';
      b.addEventListener('click', () => {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, JSON.stringify({ t: next, at: Date.now() })); } catch (e) {}
        paint(); document.dispatchEvent(new Event('kl-theme'));
      });
      nav.insertBefore(b, nav.firstChild);
    }
    paint();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  setInterval(() => { const before = root.dataset.theme; if (paint() !== before) document.dispatchEvent(new Event('kl-theme')); }, 5 * 60000);
})();
