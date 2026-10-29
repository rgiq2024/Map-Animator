// Realistic-looking trees: forests filling an area or rows along a line. Each tree is a pre-rendered,
// shaded sprite (side view when the map is tilted, canopy from above when it's flat), sized in metres.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const TREE_TYPES = { mixed: 'Mixed forest', broadleaf: 'Broadleaf (oak, maple)', pine: 'Pine / conifer', palm: 'Palm trees', autumn: 'Autumn colours', blossom: 'Blossom (pink)', desert: 'Desert (acacia, shrubs)' };
const PALETTES = {
  broadleaf: [['#2f6b2a', '#4c8f3a', '#7fbf5a'], ['#2b5e2e', '#3f7f3a', '#6aa84f'], ['#3a6b24', '#5a8f2e', '#8fc04a']],
  pine: [['#1f4a2c', '#2e6b3c', '#4f8f5a'], ['#1c4230', '#2b5f44', '#4a8064']],
  palm: [['#3f7a2a', '#5f9f35', '#9fd05a']],
  autumn: [['#8a3a14', '#c4621c', '#f0a040'], ['#7a5a12', '#b88a1c', '#e8c24a'], ['#7a2412', '#b8401c', '#e86a3a']],
  blossom: [['#b0507a', '#e07aa8', '#ffc6de'], ['#c06a8a', '#f0a0c0', '#ffe0ee']],
  desert: [['#5a6a2a', '#7f8f3a', '#b0b86a']],
};
const SP = 128; // sprite height
const cache = new Map();

function blob(c, x, y, r, cols, light = [-0.35, -0.45]) {
  const g = c.createRadialGradient(x + r * light[0], y + r * light[1], r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, cols[2]); g.addColorStop(0.55, cols[1]); g.addColorStop(1, cols[0]);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}
/** Side-view sprite (anchored at the bottom centre). */
function sideSprite(type, cols, seed) {
  const W = SP, H = SP;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const r = rng(seed);
  const cx = W / 2, base = H - 6;
  // contact shadow
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(cx + 6, base, W * 0.26, 5, 0, 0, Math.PI * 2); c.fill();
  if (type === 'pine') {
    c.fillStyle = '#4a3322'; c.fillRect(cx - 3, base - 22, 6, 22);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const y0 = base - 14 - i * 20, w = 34 - i * 5.5 + r() * 4;
      const g = c.createLinearGradient(cx - w, 0, cx + w, 0);
      g.addColorStop(0, cols[0]); g.addColorStop(0.45, cols[2]); g.addColorStop(1, cols[0]);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(cx - w, y0); c.quadraticCurveTo(cx, y0 + 6, cx + w, y0); c.lineTo(cx + (r() - 0.5) * 3, y0 - 34); c.closePath(); c.fill();
    }
  } else if (type === 'palm') {
    c.strokeStyle = '#7a5a3a'; c.lineWidth = 7; c.lineCap = 'round';
    const lean = (r() - 0.5) * 22;
    c.beginPath(); c.moveTo(cx, base); c.quadraticCurveTo(cx + lean * 0.3, base - 50, cx + lean, base - 92); c.stroke();
    c.strokeStyle = '#5e432a'; c.lineWidth = 2;
    for (let y = 8; y < 90; y += 7) { const t = y / 92; const x = cx + lean * t * t; c.beginPath(); c.moveTo(x - 3.5, base - y); c.lineTo(x + 3.5, base - y - 2); c.stroke(); }
    const tx = cx + lean, ty = base - 92;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i / 8 - 0.5) * Math.PI * 1.7 + (r() - 0.5) * 0.2;
      const len = 30 + r() * 12;
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.6 + len * 0.35;
      const g = c.createLinearGradient(tx, ty, ex, ey); g.addColorStop(0, cols[2]); g.addColorStop(1, cols[0]);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo((tx + ex) / 2 + Math.sin(a) * 6, (ty + ey) / 2 - 10, ex, ey); c.quadraticCurveTo((tx + ex) / 2 - Math.sin(a) * 4, (ty + ey) / 2 - 2, tx, ty + 3); c.fill();
    }
    c.fillStyle = '#4a3a20'; c.beginPath(); c.arc(tx, ty + 2, 4, 0, Math.PI * 2); c.fill();
  } else if (type === 'desert') {
    // acacia: flat umbrella crown
    c.strokeStyle = '#5a4430'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, base); c.lineTo(cx - 4, base - 40); c.lineTo(cx - 18, base - 62); c.moveTo(cx - 4, base - 40); c.lineTo(cx + 16, base - 64); c.stroke();
    for (let i = 0; i < 14; i++) blob(c, cx - 34 + (i / 13) * 68 + (r() - 0.5) * 6, base - 68 + (r() - 0.5) * 8, 9 + r() * 5, cols);
  } else {
    // broadleaf-like crown made of many shaded lobes
    c.fillStyle = '#4b3524'; c.beginPath(); c.moveTo(cx - 4, base); c.lineTo(cx - 2, base - 46); c.lineTo(cx + 2, base - 46); c.lineTo(cx + 5, base); c.fill();
    c.strokeStyle = '#4b3524'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx, base - 34); c.lineTo(cx - 14, base - 54); c.moveTo(cx, base - 40); c.lineTo(cx + 13, base - 58); c.stroke();
    const n = 16;
    const lobes = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 26;
      lobes.push([cx + Math.cos(a) * d * 1.15, base - 72 + Math.sin(a) * d * 0.9, 14 + r() * 9]);
    }
    lobes.sort((p, q) => p[1] - q[1]);
    // dark under-layer, then lit lobes
    for (const [x, y, rr] of lobes) { c.fillStyle = cols[0]; c.beginPath(); c.arc(x, y + 3, rr, 0, Math.PI * 2); c.fill(); }
    for (const [x, y, rr] of lobes) blob(c, x, y, rr * 0.92, cols);
    // leaf speckle
    for (let i = 0; i < 90; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 34; c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'; c.fillRect(cx + Math.cos(a) * d * 1.1, base - 72 + Math.sin(a) * d * 0.9, 2, 2); }
  }
  return cv;
}
/** Top-down canopy sprite (centred) for a flat map. */
function topSprite(type, cols, seed) {
  const S = 96;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const r = rng(seed);
  const cx = S / 2, cy = S / 2;
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(cx + 9, cy + 9, 30, 28, 0, 0, Math.PI * 2); c.fill();
  if (type === 'palm') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r() * 0.2, len = 28 + r() * 8;
      const g = c.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.addColorStop(0, cols[2]); g.addColorStop(1, cols[0]);
      c.fillStyle = g; c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + Math.cos(a + 0.25) * len * 0.6, cy + Math.sin(a + 0.25) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len); c.quadraticCurveTo(cx + Math.cos(a - 0.25) * len * 0.6, cy + Math.sin(a - 0.25) * len * 0.6, cx, cy); c.fill();
    }
  } else if (type === 'pine') {
    for (let k = 3; k >= 1; k--) blob(c, cx, cy, 10 * k + 2, cols, [-0.3, -0.3]);
    c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); c.stroke(); }
  } else {
    for (let i = 0; i < 11; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 16; blob(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 13 + r() * 6, cols); }
    for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 28; c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)'; c.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2); }
  }
  return cv;
}
function sprites(type) {
  if (cache.has(type)) return cache.get(type);
  const base = type === 'mixed' ? null : type;
  const list = [];
  const kinds = base ? [base] : ['broadleaf', 'broadleaf', 'pine'];
  kinds.forEach((k, ki) => {
    const pals = PALETTES[k] || PALETTES.broadleaf;
    for (let v = 0; v < 3; v++) {
      const cols = pals[v % pals.length];
      const shape = k === 'autumn' || k === 'blossom' ? 'broadleaf' : k;
      list.push({ side: sideSprite(shape, cols, 11 + v * 97 + ki * 7), top: topSprite(shape, cols, 23 + v * 31 + ki * 5), h: shape === 'pine' ? 1.25 : shape === 'palm' ? 1.15 : shape === 'desert' ? 0.7 : 1 });
    }
  });
  cache.set(type, list);
  return list;
}

// ---------------------------------------------------------------- placement (deterministic, geographic)
function polyArea(ring) {
  const lat0 = ring[0][1], kx = 111320 * Math.cos(lat0 * D2R), ky = 110540;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  return Math.abs(a / 2);
}
function inside(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const ptCache = new Map();
export function treePoints(L) {
  const s = L.style;
  const key = JSON.stringify([L.geom, s.density, s.spacing, s.bothSides, s.seed]);
  const hit = ptCache.get(L.id);
  if (hit && hit.key === key) return hit.pts;
  const r = rng(hashStr(L.id) + (+s.seed || 0));
  const pts = [];
  const g = L.geom;
  if (g?.type === 'Polygon') {
    const ring = g.coordinates[0];
    const areaHa = polyArea(ring) / 10000;
    const n = clamp(Math.round(areaHa * (+s.density || 40)), 1, 900);
    const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
    const w = Math.min(...xs), e = Math.max(...xs), so = Math.min(...ys), no = Math.max(...ys);
    let tries = 0;
    while (pts.length < n && tries < n * 30) {
      tries++;
      const p = [w + r() * (e - w), so + r() * (no - so)];
      if (inside(p, ring)) pts.push({ ll: p, v: r(), s: 0.75 + r() * 0.5, o: r() });
    }
  } else if (g?.type === 'LineString') {
    const sp = Math.max(3, +s.spacing || 12);
    const cs = g.coordinates;
    let carry = 0;
    for (let i = 1; i < cs.length; i++) {
      const [x0, y0] = cs[i - 1], [x1, y1] = cs[i];
      const kx = 111320 * Math.cos(((y0 + y1) / 2) * D2R);
      const dx = (x1 - x0) * kx, dy = (y1 - y0) * 110540, len = Math.hypot(dx, dy);
      const nx = -dy / (len || 1), ny = dx / (len || 1);
      for (let d = carry; d < len; d += sp) {
        const f = d / len;
        const off = sp * 0.45;
        const sides = s.bothSides === false ? [0] : [-1, 1];
        for (const sd of sides) {
          const ox = (nx * off * sd) / kx, oy = (ny * off * sd) / 110540;
          pts.push({ ll: [x0 + (x1 - x0) * f + ox, y0 + (y1 - y0) * f + oy], v: r(), s: 0.85 + r() * 0.3, o: pts.length / 1e4 });
        }
        if (pts.length > 1200) break;
      }
      carry = (carry - len) % sp; if (carry < 0) carry += sp;
    }
    // grow along the line
    pts.forEach((p, i) => { p.o = i / Math.max(1, pts.length - 1); });
  } else if (g?.type === 'Point') pts.push({ ll: g.coordinates, v: r(), s: 1, o: 0 });
  ptCache.set(L.id, { key, pts });
  return pts;
}

export function drawTrees(ctx, L, tm, o) {
  const { proj, unit } = o;
  const s = L.style;
  const pts = treePoints(L);
  if (!pts.length) return;
  const list = sprites(s.type || 'mixed');
  // metres → pixels around the layer
  const p0 = pts[0].ll;
  const a = proj(p0), b = proj([p0[0] + 0.001, p0[1]]);
  const pxPerM = Math.hypot(b[0] - a[0], b[1] - a[1]) / (111320 * Math.cos(p0[1] * D2R) * 0.001);
  const hM = (+s.height || 14) * (+s.size || 1);
  let hPx = hM * pxPerM * (+s.exaggerate || 3);
  const minPx = 5 * unit;
  if (hPx < minPx) { if (s.dotsFar === false) return; hPx = minPx; }
  hPx = Math.min(hPx, 260 * unit);
  const top = (o.pitch ?? 0) < 18 && s.view !== 'side';
  const grow = L.anim === 'grow' && !tm.edit;
  const D = Math.max(0.1, +L.duration || 2);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const items = [];
  for (const p of pts) {
    const q = proj(p.ll);
    if (q[0] < -hPx * 2 || q[1] < -hPx * 2 || q[0] > W + hPx * 2 || q[1] > H + hPx * 3) continue;
    // perspective: size from the local scale at this tree (far trees are smaller when tilted)
    const q2 = proj([p.ll[0] + 0.0004, p.ll[1]]);
    const local = Math.hypot(q2[0] - q[0], q2[1] - q[1]) / (111320 * Math.cos(p.ll[1] * D2R) * 0.0004);
    const persp = pxPerM > 0 ? clamp(local / pxPerM, 0.2, 5) : 1;
    let k = 1;
    if (grow) { const u = (tm.tau - p.o * D * 0.7) / (D * 0.3 + 1e-6); if (u <= 0) continue; k = u >= 1 ? 1 : 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2; }
    items.push([q, p, k * persp]);
  }
  items.sort((x, y) => x[0][1] - y[0][1]);
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' && !tm.edit ? clamp(tm.tau / D, 0, 1) : 1);
  for (const [[x, y], p, k] of items) {
    const sp = list[Math.floor(p.v * list.length) % list.length];
    const h = hPx * p.s * sp.h * k;
    if (h < 1) continue;
    if (top) { const d = h * 0.7; ctx.drawImage(sp.top, x - d / 2, y - d / 2, d, d); }
    else ctx.drawImage(sp.side, x - h / 2, y - h * 0.955, h, h);
  }
  ctx.restore();
}
