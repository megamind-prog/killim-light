// In-app directions on our own OpenStreetMap road data (no Google, works offline once loaded).
// Each island group has a small road graph: assets/osm/route-<group>.json = { n: [lat, lng, ...] * 1e5, e: [[a, b, metres, class, [lat, lng, ...] * 1e5]] }.
(() => {
const BASE = (document.querySelector('meta[name="kl-base"]') || { content: '/' }).content;
const cache = {};
const RAD = Math.PI / 180;
function metres(a, b) {
  const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
// Main roads cost a little less, tracks a little more, so routes stay on roads people actually use.
const COST = [0.9, 0.95, 1, 1.05, 1.15, 1.35];

function load(group) {
  return (cache[group] ||= fetch(BASE + 'assets/osm/route-' + group + '.json').then(r => r.ok ? r.json() : null).then(raw => {
    if (!raw) return null;
    const nn = raw.n.length / 2, lat = new Float64Array(nn), lng = new Float64Array(nn);
    for (let i = 0; i < nn; i++) { lat[i] = raw.n[2 * i] / 1e5; lng[i] = raw.n[2 * i + 1] / 1e5; }
    const edges = raw.e.map(([a, b, len, cls, g]) => {
      const pts = [[lat[a], lng[a]]];
      for (let i = 0; i < g.length; i += 2) pts.push([g[i] / 1e5, g[i + 1] / 1e5]);
      pts.push([lat[b], lng[b]]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + metres(pts[i - 1], pts[i]));
      const k = len / (cum[cum.length - 1] || 1);            // scale the simplified line to the true length
      return { a, b, len, cost: len * (COST[cls] || 1), pts, cum: cum.map(c => c * k) };
    });
    const adj = Array.from({ length: nn }, () => []);
    edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
    // Which connected piece of road each junction belongs to; the biggest piece is "main".
    const comp = new Int32Array(nn).fill(-1), sizes = [];
    for (let s0 = 0; s0 < nn; s0++) {
      if (comp[s0] >= 0) continue;
      const id = sizes.length, stack = [s0]; comp[s0] = id; let c = 0;
      while (stack.length) { const x = stack.pop(); c++; for (const ei of adj[x]) { const e = edges[ei], y = e.a === x ? e.b : e.a; if (comp[y] < 0) { comp[y] = id; stack.push(y); } } }
      sizes.push(c);
    }
    const main = sizes.indexOf(Math.max(...sizes));
    return { lat, lng, edges, adj, comp, main };
  }).catch(() => null));
}

// The closest point on any road to p: which edge, how far along it, and how far off the road p is.
function snap(G, p, mainOnly) {
  const kx = Math.cos(p[0] * RAD);
  let best = null;
  G.edges.forEach((e, ei) => {
    if (mainOnly && G.comp[e.a] !== G.main) return;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const A = e.pts[i], B = e.pts[i + 1];
      const ax = A[1] * kx, ay = A[0], bx = B[1] * kx, by = B[0], px = p[1] * kx, py = p[0];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      const qx = ax + t * dx, qy = ay + t * dy, d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (!best || d2 < best.d2) best = { d2, ei, i, t, point: [qy, qx / kx] };
    }
  });
  if (!best) return null;
  const e = G.edges[best.ei];
  best.along = e.cum[best.i] + best.t * (e.cum[best.i + 1] - e.cum[best.i]);
  best.off = metres(p, best.point);
  return best;
}

// The points of an edge between two distances along it, in that direction.
function slice(e, from, to) {
  const out = [];
  const at = d => { let i = 1; while (i < e.cum.length - 1 && e.cum[i] < d) i++; const f = (d - e.cum[i - 1]) / ((e.cum[i] - e.cum[i - 1]) || 1); const A = e.pts[i - 1], B = e.pts[i]; return [A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])]; };
  out.push(at(from));
  if (from < to) { for (let i = 0; i < e.cum.length; i++) if (e.cum[i] > from && e.cum[i] < to) out.push(e.pts[i]); }
  else { for (let i = e.cum.length - 1; i >= 0; i--) if (e.cum[i] < from && e.cum[i] > to) out.push(e.pts[i]); }
  out.push(at(to));
  return out;
}

// Shortest way by road from one place to another (A* over the island's road graph).
async function route(group, from, to) {
  const G = await load(group);
  if (!G) return null;
  // Nearest road first; if that piece of road doesn't connect, use the main road network.
  return search(G, snap(G, from), snap(G, to), from, to) || search(G, snap(G, from, true), snap(G, to, true), from, to);
}
function search(G, s, t) {
  if (!s || !t) return null;
  const es = G.edges[s.ei], et = G.edges[t.ei];
  const n = G.lat.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), prevEdge = new Int32Array(n).fill(-1);
  const goal = t.point, h = i => metres([G.lat[i], G.lng[i]], goal) * 0.9;
  const heap = [];
  const push = (i, d) => { heap.push([d + h(i), d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const ratio = es.cost / (es.len || 1);
  const relax = (i, d, pe, pn) => { if (d < dist[i]) { dist[i] = d; prevEdge[i] = pe; prev[i] = pn; push(i, d); } };
  relax(es.a, s.along * ratio, -2, -1);
  relax(es.b, (es.len - s.along) * ratio, -3, -1);
  // Both points on the same stretch of road.
  let best = s.ei === t.ei ? { cost: Math.abs(t.along - s.along) * ratio, end: -1 } : { cost: Infinity, end: -1 };
  const tr = et.cost / (et.len || 1);
  while (heap.length) {
    const [f, d, i] = pop();
    if (d > dist[i]) continue;
    if (f >= best.cost) break;
    if (i === et.a && d + t.along * tr < best.cost) best = { cost: d + t.along * tr, end: i, side: 'a' };
    if (i === et.b && d + (et.len - t.along) * tr < best.cost) best = { cost: d + (et.len - t.along) * tr, end: i, side: 'b' };
    for (const ei of G.adj[i]) { const e = G.edges[ei], j = e.a === i ? e.b : e.a; relax(j, d + e.cost, ei, i); }
  }
  if (best.cost === Infinity) return null;
  let pts;
  if (best.end === -1) pts = slice(es, s.along, t.along);
  else {
    // Walk back from the last junction to the start.
    const chain = [];
    let i = best.end;
    while (prevEdge[i] >= 0) { chain.push([prevEdge[i], prev[i], i]); i = prev[i]; }
    pts = prevEdge[i] === -2 ? slice(es, s.along, 0) : slice(es, s.along, es.len);
    for (let k = chain.length - 1; k >= 0; k--) {
      const [ei, a] = chain[k], e = G.edges[ei];
      const seg = e.a === a ? e.pts : [...e.pts].reverse();
      pts.push(...seg.slice(1));
    }
    pts.push(...(best.side === 'a' ? slice(et, 0, t.along) : slice(et, et.len, t.along)).slice(1));
  }
  let road = 0;
  for (let i = 1; i < pts.length; i++) road += metres(pts[i - 1], pts[i]);
  return { pts, road, offStart: s.off, offEnd: t.off, from: s.point, to: t.point, total: road + s.off + t.off };
}

window.KLRoute = { route, metres, load };
})();
