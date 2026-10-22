// Embedded live map for other websites.
(() => {
  const { t, $, esc, LIGHT, lightOf, updatedLine, kavaLine, makeMap, pinIcon, api } = KL;
  KLi18n.applyStatic();
  const q = new URLSearchParams(location.search);
  const map = makeMap($('map'), { region: q.get('region') || 'efate', zoomControl: true });
  if (q.get('lat') && q.get('lng')) map.setView([+q.get('lat'), +q.get('lng')], +(q.get('zoom') || 15));
  const only = q.get('light');
  const markers = new Map();
  async function load() {
    let d; try { d = await api('/api/nakamals'); } catch { return; }
    const items = d.items.filter(n => !only || lightOf(n) === only);
    const ids = new Set(items.map(n => n.id));
    for (const [id, m] of markers) if (!ids.has(id)) { map.removeLayer(m); markers.delete(id); }
    for (const n of items) {
      const l = lightOf(n), kv = kavaLine(n);
      const html = `<div class="pop l-${l}"><h3>${esc(n.name)}</h3><span class="pill"><span class="dot">${LIGHT[l].sym}</span>${LIGHT[l].label}</span>
        <div class="line">${esc(updatedLine(n))}</div>${n.note ? `<div class="note"><b>${esc(n.note)}</b></div>` : ''}${kv ? `<div class="line">${esc(kv)}</div>` : ''}
        <a class="link" href="/n/${encodeURIComponent(n.id)}" target="_blank" rel="noopener">${esc(t('details'))} ↗</a></div>`;
      let m = markers.get(n.id);
      if (!m) { m = L.marker([n.lat, n.lng], { title: n.name }).addTo(map).bindPopup(''); markers.set(n.id, m); }
      m.setIcon(pinIcon(l)); m.setPopupContent(html);
    }
  }
  load(); setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
