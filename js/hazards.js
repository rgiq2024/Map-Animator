// Hazard areas, animated: blast zones (nuclear or conventional explosion, or your own radii), wildfire spreading
// through an area with a burning front and smoke, deforestation over the years, and "affected buildings" —
// the real 3D buildings inside a zone highlighted (optionally hiding every other building).
import { drawExplosion, drawPuff } from './explosion.js';
import { placeAt, CUSTOM_POS } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,monospace';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const POS = { 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', 'top-left': 'Top left', 'top-right': 'Top right', ...CUSTOM_POS };
const BLD = { off: 'No', highlight: 'Highlight buildings inside', only: 'Show only the buildings inside', dim: 'Highlight inside, dim the rest' };

// ---------------------------------------------------------------- catalogue
export const HZ_KINDS = {
  blastzone: { name: 'Blast zones', icon: '☢', geom: 'point', desc: 'Nuclear or explosion damage rings (fireball, blast pressure, thermal) or your own radii, expanding' },
  wildfire: { name: 'Wildfire', icon: '🔥', geom: 'polygon', desc: 'Fire spreading through an area with the wind: burning front, burnt scar and smoke' },
  deforest: { name: 'Deforestation', icon: '🪓', geom: 'polygon', desc: 'Forest cleared patch by patch over the years, with a year counter and % lost' },
  affected: { name: 'Affected buildings', icon: '🏚', geom: 'point', desc: 'Highlight the real 3D buildings inside a radius or an area — optionally hide all others' },
};
export const HZ_ANIMS = {
  blastzone: { expand: 'Shock wave expands', fade: 'Fade in', none: 'Already there' },
  wildfire: { spread: 'Fire spreads' },
  deforest: { years: 'Clearing over the years' },
  affected: { grow: 'Buildings light up', none: 'Already there' },
};
export const HZ_DEFAULTS = {
  blastzone: { anim: 'expand', duration: 5, style: { mode: 'nuclear', yieldKt: 15, tons: 2, radii: '0.5, 1, 2', names: 'Severe damage\nModerate damage\nEvacuation zone', burst: 'air', flash: true, fireball: true, labels: true, legend: true, opacity: 0.35, buildings: 'off', position: 'bottom-left' } },
  wildfire: { anim: 'spread', duration: 8, style: { windDir: 250, start: 'upwind', smoke: true, glow: true, legend: true, title: 'Wildfire', position: 'bottom-left', buildings: 'off', seed: 0, outline: true } },
  deforest: { anim: 'years', duration: 8, style: { fromYear: 2001, toYear: 2024, loss: 0.45, alerts: true, legend: true, title: 'Forest loss', position: 'bottom-left', seed: 0, outline: true, startForest: true } },
  affected: { anim: 'grow', duration: 2.5, style: { radii: '0.5, 1, 2', colors: '#ff1744, #ff9100, #ffd600', others: 'dim', rings: true, legend: true, title: 'Affected buildings', position: 'bottom-left' } },
};
export const HZ_FORMS = {
  blastzone: [['style.mode', 'Type', 'select', { nuclear: 'Nuclear weapon', explosion: 'Explosion (tonnes of TNT)', custom: 'My own radii' }], ['style.yieldKt', 'Yield', 'select', { 0.3: '0.3 kt (very small)', 15: '15 kt (Hiroshima size)', 21: '21 kt (Nagasaki size)', 100: '100 kt', 300: '300 kt', 800: '800 kt', 1000: '1 Mt', 5000: '5 Mt', 50000: '50 Mt (largest tested)' }, (L) => L.style.mode === 'nuclear'], ['style.tons', 'Explosive (tonnes of TNT)', 'number', 0.5, (L) => L.style.mode === 'explosion'], ['style.radii', 'Radii in km (comma separated)', 'text', null, (L) => L.style.mode === 'custom'], ['style.names', 'Zone names (one per line)', 'textarea', null, (L) => L.style.mode === 'custom'], ['style.opacity', 'Fill opacity', 'range', [0.05, 0.8, 0.01]], ['style.fireball', 'Explosion at the centre', 'switch'], ['style.flash', 'Bright flash', 'switch', null, (L) => L.style.mode === 'nuclear'], ['style.labels', 'Labels on the rings', 'switch'], ['style.legend', 'Legend', 'switch'], ['style.position', 'Legend position', 'select', POS, (L) => L.style.legend !== false], ['style.buildings', 'Buildings in the zones', 'select', BLD]],
  wildfire: [['style.windDir', 'Wind from (° — 0 = north, 270 = west)', 'range', [0, 359, 1]], ['style.start', 'Fire starts', 'select', { upwind: 'At the upwind edge', center: 'In the middle', first: 'At the first point you drew' }], ['style.smoke', 'Smoke', 'switch'], ['style.glow', 'Glowing fire front', 'switch'], ['style.outline', 'Area outline', 'switch'], ['style.legend', 'Legend (burnt area)', 'switch'], ['style.title', 'Legend title', 'text', null, (L) => L.style.legend !== false], ['style.position', 'Legend position', 'select', POS, (L) => L.style.legend !== false], ['style.buildings', 'Buildings in the area', 'select', BLD], ['style.seed', 'Shuffle', 'number', 1]],
  deforest: [['style.fromYear', 'From year', 'number', 1], ['style.toYear', 'To year', 'number', 1], ['style.loss', 'Share of forest lost by the end', 'range', [0.05, 1, 0.01]], ['style.alerts', 'Highlight new clearing (red)', 'switch'], ['style.outline', 'Area outline', 'switch'], ['style.legend', 'Year counter and % lost', 'switch'], ['style.title', 'Legend title', 'text', null, (L) => L.style.legend !== false], ['style.position', 'Legend position', 'select', POS, (L) => L.style.legend !== false], ['style.seed', 'Shuffle', 'number', 1]],
  affected: [['style.radii', 'Radii in km (point only, comma separated)', 'text', null, (L) => L.geom?.type === 'Point'], ['style.colors', 'Colours (inner → outer)', 'text'], ['style.others', 'Other buildings', 'select', { show: 'Show them as normal', dim: 'Dim them', hide: 'Hide them (only affected buildings)' }], ['style.rings', 'Draw the zone outlines', 'switch'], ['style.legend', 'Legend with building counts', 'switch'], ['style.title', 'Legend title', 'text', null, (L) => L.style.legend !== false], ['style.position', 'Legend position', 'select', POS, (L) => L.style.legend !== false]],
};
export const HZ_SET = new Set(Object.keys(HZ_KINDS));
export function hzPhases(kind) { return kind === 'affected' || kind === 'blastzone' || kind === 'wildfire' || kind === 'deforest' ? ['below', 'above', 'captions'] : []; }

// ---------------------------------------------------------------- geometry helpers
function dest([lng, lat], brg, d) {
  const R = 6371008.8, φ1 = lat * D2R, λ1 = lng * D2R, θ = brg * D2R, δ = d / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 / D2R, φ2 / D2R];
}
export const circleRing = (c, m, n = 96) => { const r = Array.from({ length: n }, (_, i) => dest(c, (i / n) * 360, m)); r.push(r[0]); return r; };
function inRing(p, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) ins = !ins;
  }
  return ins;
}
const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`);
const fmtArea = (m2) => (m2 < 1e6 ? `${Math.round(m2 / 1e4).toLocaleString()} ha` : `${(m2 / 1e6).toFixed(m2 < 1e8 ? 1 : 0)} km²`);

// ---------------------------------------------------------------- blast zones
/**
 * Approximate damage radii (km), scaled from well-known reference values with the usual cube-root law
 * (thermal grows a little faster). For illustration only — real effects depend on burst height, weather, terrain.
 */
export function blastZones(s) {
  if (s.mode === 'custom') {
    const radii = String(s.radii || '').split(/[,;\s]+/).map(Number).filter((v) => v > 0).sort((a, b) => a - b);
    const names = String(s.names || '').split('\n').map((x) => x.trim());
    const cols = ['#ff1744', '#ff6d00', '#ffd600', '#64dd17', '#00b0ff'];
    return radii.map((r, i) => ({ km: r, name: names[i] || `Zone ${i + 1}`, color: cols[i % cols.length], note: '' }));
  }
  const W = s.mode === 'explosion' ? Math.max(1e-6, (+s.tons || 1) / 1000) : Math.max(0.01, +s.yieldKt || 15);
  const c = Math.cbrt(W);
  const z = s.mode === 'explosion'
    ? [
      { km: 0.21 * c, name: 'Heavy blast damage', note: '20 psi — buildings destroyed', color: '#ff1744' },
      { km: 0.54 * c, name: 'Moderate blast damage', note: '5 psi — most buildings collapse', color: '#ff6d00' },
      { km: 1.4 * c, name: 'Light blast damage', note: '1 psi — windows break', color: '#ffd600' },
      { km: 2.8 * c, name: 'Safety / evacuation distance', note: 'debris and glass', color: '#00b0ff' },
    ]
    : [
      { km: 0.065 * W ** 0.4, name: 'Fireball', note: 'everything vaporised', color: '#ffea00' },
      { km: 0.21 * c, name: 'Heavy blast damage', note: '20 psi — concrete buildings destroyed', color: '#ff1744' },
      { km: 0.48 * W ** 0.19, name: 'Radiation (500 rem)', note: 'lethal dose without treatment', color: '#76ff03' },
      { km: 0.54 * c, name: 'Moderate blast damage', note: '5 psi — most buildings collapse', color: '#ff6d00' },
      { km: 0.62 * W ** 0.41, name: 'Thermal radiation', note: '3rd-degree burns', color: '#ffab40' },
      { km: 1.4 * c, name: 'Light blast damage', note: '1 psi — windows break', color: '#29b6f6' },
    ];
  return z.sort((a, b) => a.km - b.km);
}
function zoneProgress(L, tm, i, n) {
  if (tm.edit || L.anim === 'none') return 1;
  const D = Math.max(0.2, +L.duration || 4);
  if (L.anim === 'fade') return clamp(tm.tau / D, 0, 1);
  // shock arrival: inner zones first
  return easeOut((tm.tau - 0.15 - (i / Math.max(1, n)) * D * 0.55) / (D * 0.35));
}
function drawBlastZone(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit, frame } = o;
  const c = L.geom.coordinates;
  const zones = blastZones(s);
  const n = zones.length;
  const p0 = proj(c);
  if (phase === 'below') {
    for (let i = n - 1; i >= 0; i--) {
      const z = zones[i];
      const k = zoneProgress(L, tm, i, n);
      if (k <= 0) continue;
      const ring = circleRing(c, z.km * 1000 * (L.anim === 'expand' ? k : 1));
      ctx.save();
      ctx.globalAlpha *= tm.alpha * (L.anim === 'fade' ? k : 1);
      ctx.beginPath(); ring.forEach((q, j) => { const p = proj(q); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      ctx.fillStyle = hexA(z.color, clamp(+s.opacity || 0.35, 0, 1) * (i === 0 ? 1.2 : 1)); ctx.fill();
      ctx.strokeStyle = z.color; ctx.lineWidth = 2 * unit; ctx.setLineDash(k < 1 ? [] : [7 * unit, 5 * unit]); ctx.stroke(); ctx.setLineDash([]);
      if (k < 1) { ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = 4 * unit; ctx.stroke(); }
      ctx.restore();
    }
    return;
  }
  if (phase === 'above') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    if (s.labels !== false) zones.forEach((z, i) => {
      if (zoneProgress(L, tm, i, n) < 0.95) return;
      const p = proj(dest(c, 0, z.km * 1000));
      ctx.font = `700 ${10.5 * unit}px ${UI}`;
      const t = `${z.name} · ${fmtKm(z.km)}`;
      const w = ctx.measureText(t).width + 14 * unit;
      ctx.fillStyle = 'rgba(10,12,18,0.82)'; rr(ctx, p[0] - w / 2, p[1] - 10 * unit, w, 18 * unit, 9 * unit); ctx.fill();
      ctx.fillStyle = z.color; ctx.beginPath(); ctx.arc(p[0] - w / 2 + 8 * unit, p[1] - 1 * unit, 3 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, p[0] - w / 2 + 14 * unit, p[1]);
    });
    if (s.fireball !== false && !tm.edit) {
      const fb = zones.find((z) => z.name === 'Fireball') || zones[0];
      const ref = proj(dest(c, 90, fb.km * 1000));
      const R = clamp(Math.hypot(ref[0] - p0[0], ref[1] - p0[1]) * 1.6, 18 * unit, 260 * unit);
      drawExplosion(ctx, p0[0], p0[1], R, tm.tau, 7 + (L.id.length || 0), { scorch: true, flash: true });
    }
    // ground zero marker
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.moveTo(p0[0] - 7 * unit, p0[1]); ctx.lineTo(p0[0] + 7 * unit, p0[1]); ctx.moveTo(p0[0], p0[1] - 7 * unit); ctx.lineTo(p0[0], p0[1] + 7 * unit); ctx.stroke();
    ctx.restore();
    return;
  }
  if (phase === 'captions' && frame) {
    if (s.mode === 'nuclear' && s.flash !== false && !tm.edit && tm.tau < 0.9) {
      ctx.fillStyle = `rgba(255,250,235,${clamp(1 - tm.tau / 0.9, 0, 1) ** 1.5 * 0.92})`; ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    }
    if (s.legend === false) return;
    const rowH = 22 * unit, W = 300 * unit, H = 52 * unit + n * rowH;
    const m = 26 * unit, pos = s.position || 'bottom-left';
    const x = pos.includes('right') ? frame.x + frame.w - m - W : frame.x + m, y = pos.includes('top') ? frame.y + m : frame.y + frame.h - m - H;
    ctx.save();
    ctx.globalAlpha *= tm.alpha * (tm.edit ? 1 : clamp((tm.tau - 0.6) / 0.5, 0, 1));
    placeAt(ctx, L, frame, x, y, W, H);
    ctx.fillStyle = 'rgba(12,14,20,0.86)'; rr(ctx, x, y, W, H, 12 * unit); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${12 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const head = s.mode === 'nuclear' ? `BLAST ZONES · ${+s.yieldKt >= 1000 ? `${+s.yieldKt / 1000} MT` : `${s.yieldKt} KT`}` : s.mode === 'explosion' ? `EXPLOSION · ${s.tons} T TNT` : 'ZONES';
    ctx.fillText(head, x + 14 * unit, y + 18 * unit);
    ctx.font = `500 ${9 * unit}px ${UI}`; ctx.fillStyle = 'rgba(232,236,244,0.6)';
    if (s.mode !== 'custom') ctx.fillText('Approximate, for illustration', x + 14 * unit, y + 33 * unit);
    zones.forEach((z, i) => {
      const yy = y + 48 * unit + i * rowH;
      ctx.globalAlpha = tm.alpha * (0.35 + 0.65 * zoneProgress(L, tm, i, n));
      ctx.fillStyle = z.color; rr(ctx, x + 14 * unit, yy - 6 * unit, 12 * unit, 12 * unit, 3 * unit); ctx.fill();
      ctx.fillStyle = '#eef1f7'; ctx.font = `600 ${10.5 * unit}px ${UI}`; ctx.fillText(z.name, x + 34 * unit, yy, W - 120 * unit);
      ctx.textAlign = 'right'; ctx.font = `700 ${10.5 * unit}px ${MONO}`; ctx.fillText(fmtKm(z.km), x + W - 14 * unit, yy);
      if (s.buildings && s.buildings !== 'off' && L._counts?.[i] != null) { ctx.fillStyle = 'rgba(238,241,247,0.6)'; ctx.font = `600 ${9.5 * unit}px ${UI}`; ctx.fillText(`${L._counts[i].toLocaleString()} bldg`, x + W - 70 * unit, yy); }
      ctx.textAlign = 'left';
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- grid helpers (wildfire, deforestation)
function vnoise(x, y, seed) {
  const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
}
const gridCache = new Map();
/** Cells inside a polygon on a lng/lat grid, each with a value v in 0…1 (when it changes state). */
function gridOf(L, N, valueFn) {
  const s = L.style;
  const key = JSON.stringify([L.geom.coordinates, N, s.windDir, s.start, s.seed, L.kind]);
  const hit = gridCache.get(L.id);
  if (hit && hit.key === key) return hit.val;
  const ring = L.geom.coordinates[0];
  let w = Infinity, so = Infinity, e = -Infinity, no = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); no = Math.max(no, y); }
  const nx = N, ny = Math.max(8, Math.round(N * ((no - so) / Math.max(1e-9, (e - w) * Math.cos(((so + no) / 2) * D2R))))) ;
  const NY = Math.min(160, ny);
  const cells = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < nx; i++) {
    const cx = w + ((i + 0.5) / nx) * (e - w), cy = so + ((j + 0.5) / NY) * (no - so);
    if (inRing([cx, cy], ring)) cells.push({ i, j, cx, cy });
  }
  const kx = 111320 * Math.cos(((so + no) / 2) * D2R), ky = 110540;
  const cellArea = ((e - w) / nx) * kx * ((no - so) / NY) * ky;
  valueFn(cells, { w, e, so, no, kx, ky, ring });
  // normalise to ranks 0…1
  const sorted = cells.map((c) => c.raw).sort((a, b) => a - b);
  for (const c of cells) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < c.raw) lo = m + 1; else hi = m; } c.v = lo / Math.max(1, sorted.length - 1); c.n = vnoise(c.i * 0.9, c.j * 0.9, 3); }
  const val = { cells, nx, ny: NY, w, e, so, no, cellArea, ring };
  gridCache.set(L.id, { key, val });
  return val;
}
/** Project the grid's vertices once per frame. */
function gridProj(G, proj) {
  const P = new Array((G.nx + 1) * (G.ny + 1));
  for (let j = 0; j <= G.ny; j++) for (let i = 0; i <= G.nx; i++) P[j * (G.nx + 1) + i] = proj([G.w + (i / G.nx) * (G.e - G.w), G.so + (j / G.ny) * (G.no - G.so)]);
  return (i, j) => P[j * (G.nx + 1) + i];
}
function cellPath(path, V, c) {
  const a = V(c.i, c.j), b = V(c.i + 1, c.j), d = V(c.i + 1, c.j + 1), e = V(c.i, c.j + 1);
  path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(d[0], d[1]); path.lineTo(e[0], e[1]); path.closePath();
}
function outline(ctx, ring, proj, col, unit) {
  ctx.beginPath(); ring.forEach((q, j) => { const p = proj(q); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
  ctx.strokeStyle = col; ctx.lineWidth = 1.6 * unit; ctx.setLineDash([6 * unit, 4 * unit]); ctx.stroke(); ctx.setLineDash([]);
}
function legend(ctx, L, tm, o, lines, accent) {
  const { frame, unit } = o;
  const s = L.style;
  const W = 280 * unit, H = 34 * unit + lines.length * 20 * unit;
  const m = 26 * unit, pos = s.position || 'bottom-left';
  const x = pos.includes('right') ? frame.x + frame.w - m - W : frame.x + m, y = pos.includes('top') ? frame.y + m : frame.y + frame.h - m - H;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  placeAt(ctx, L, frame, x, y, W, H);
  ctx.fillStyle = 'rgba(12,14,20,0.86)'; rr(ctx, x, y, W, H, 12 * unit); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(x, y + 12 * unit, 4 * unit, H - 24 * unit);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    ctx.fillStyle = i === 0 ? '#fff' : 'rgba(238,241,247,0.9)';
    ctx.font = i === 0 ? `800 ${12.5 * unit}px ${UI}` : `600 ${11 * unit}px ${i === lines.length - 1 && ln.big ? MONO : UI}`;
    if (ln.big) ctx.font = `800 ${20 * unit}px ${MONO}`;
    ctx.fillText(ln.text ?? ln, x + 16 * unit, y + 18 * unit + i * 20 * unit + (ln.big ? 4 * unit : 0));
  });
  ctx.restore();
}

// ---------------------------------------------------------------- wildfire
function wildGrid(L) {
  const s = L.style;
  return gridOf(L, 72, (cells, b) => {
    const ring = b.ring;
    const wd = (+s.windDir || 0) * D2R; // wind FROM this direction → fire runs the other way
    const dx = -Math.sin(wd), dy = -Math.cos(wd);
    let ign;
    if (s.start === 'first') ign = ring[0];
    else if (s.start === 'center') { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } ign = [x / ring.length, y / ring.length]; }
    else { let best = Infinity; for (const p of ring) { const v = (p[0] - b.w) * b.kx * dx + (p[1] - b.so) * b.ky * dy; if (v < best) { best = v; ign = p; } } }
    for (const c of cells) {
      const ex = (c.cx - ign[0]) * b.kx, ey = (c.cy - ign[1]) * b.ky, d = Math.hypot(ex, ey) || 1;
      const cos = (ex * dx + ey * dy) / d;
      c.raw = (d / (1 + 0.75 * cos)) * (0.75 + 0.5 * vnoise(c.i * 0.25, c.j * 0.25, (+s.seed || 0) + 1));
    }
  });
}
function drawWildfire(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit } = o;
  const G = wildGrid(L);
  const D = Math.max(0.5, +L.duration || 8);
  const p = tm.edit ? 0.55 : clamp(tm.tau / D, 0, 1) * 1.12;
  const wFront = 0.09;
  const t = tm.edit ? 1 : tm.tau;
  if (phase === 'below') {
    const V = gridProj(G, proj);
    const burnt = [new Path2D(), new Path2D()], burning = [new Path2D(), new Path2D(), new Path2D()];
    let nb = 0;
    const front = [];
    for (const c of G.cells) {
      if (c.v > p) continue;
      if (c.v + wFront < p) { cellPath(burnt[c.n > 0.5 ? 1 : 0], V, c); nb++; } else {
        const k = (p - c.v) / wFront, fl = Math.sin(t * 13 + c.i * 1.7 + c.j * 2.3) * 0.5 + 0.5;
        cellPath(burning[k < 0.35 ? 2 : fl > 0.5 ? 1 : 0], V, c);
        if ((c.i * 7 + c.j * 3) % 9 === 0) front.push(c);
      }
    }
    G.burntCount = nb;
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    ctx.fillStyle = 'rgba(32,24,20,0.82)'; ctx.fill(burnt[0]);
    ctx.fillStyle = 'rgba(48,36,30,0.82)'; ctx.fill(burnt[1]);
    if (s.glow !== false) { ctx.shadowColor = '#ff6d00'; ctx.shadowBlur = 14 * unit; }
    ctx.fillStyle = 'rgba(255,90,10,0.92)'; ctx.fill(burning[0]);
    ctx.fillStyle = 'rgba(255,160,30,0.95)'; ctx.fill(burning[1]);
    ctx.fillStyle = 'rgba(255,235,140,0.95)'; ctx.fill(burning[2]);
    ctx.shadowBlur = 0;
    if (s.outline !== false) outline(ctx, G.ring, proj, 'rgba(255,120,40,0.85)', unit);
    ctx.restore();
    G.front = front;
    return;
  }
  if (phase === 'above') {
    if (s.smoke === false || !G.front?.length) return;
    const wd = (+s.windDir || 0) * D2R;
    const p0 = proj([G.w, G.so]), p1 = proj([G.w + (G.e - G.w) * 0.1, G.so]);
    const cellPx = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / (G.nx * 0.1);
    const R = clamp(cellPx * 4, 8 * unit, 140 * unit);
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    const list = G.front.slice(0, 40);
    list.forEach((c, k) => {
      const q = proj([c.cx, c.cy]);
      for (let j = 0; j < 3; j++) {
        const age = ((t * 0.35 + k * 0.137 + j * 0.33) % 1);
        const x = q[0] - Math.sin(wd) * age * R * 4, y = q[1] + Math.cos(wd) * age * R * 2 - age * R * 3;
        drawPuff(ctx, x, y, R * (0.6 + age * 1.6), age * 2 + k, 0.55 * (1 - age), 'smoke');
      }
    });
    ctx.restore();
    return;
  }
  if (phase === 'captions' && o.frame && s.legend !== false) {
    const area = (G.burntCount || 0) * G.cellArea, pct = Math.round(((G.burntCount || 0) / Math.max(1, G.cells.length)) * 100);
    legend(ctx, L, tm, o, [`${String(s.title || 'Wildfire').toUpperCase()}`, `Burnt area · ${pct}% of the zone`, { text: fmtArea(area), big: true }], '#ff6d00');
  }
}

// ---------------------------------------------------------------- deforestation
function forestGrid(L) {
  const s = L.style;
  return gridOf(L, 80, (cells) => {
    const sd = (+s.seed || 0) * 13 + 5;
    for (const c of cells) c.raw = 0.55 * vnoise(c.i * 0.09, c.j * 0.09, sd) + 0.3 * vnoise(c.i * 0.3, c.j * 0.3, sd + 1) + 0.15 * vnoise(c.i * 1.1, c.j * 1.1, sd + 2);
  });
}
function drawDeforest(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit } = o;
  const G = forestGrid(L);
  const D = Math.max(0.5, +L.duration || 8);
  const u = tm.edit ? 0.6 : clamp(tm.tau / D, 0, 1);
  const thr = u * clamp(+s.loss || 0.45, 0, 1);
  if (phase === 'below') {
    const V = gridProj(G, proj);
    const forest = [new Path2D(), new Path2D(), new Path2D()], cleared = [new Path2D(), new Path2D()], fresh = new Path2D();
    let nc = 0;
    for (const c of G.cells) {
      if (c.v < thr) {
        nc++;
        if (s.alerts !== false && thr - c.v < 0.035) cellPath(fresh, V, c);
        else cellPath(cleared[c.n > 0.5 ? 1 : 0], V, c);
      } else if (s.startForest !== false) cellPath(forest[c.n < 0.33 ? 0 : c.n < 0.66 ? 1 : 2], V, c);
    }
    G.clearedCount = nc;
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    ctx.fillStyle = 'rgba(22,82,38,0.78)'; ctx.fill(forest[0]);
    ctx.fillStyle = 'rgba(30,98,46,0.78)'; ctx.fill(forest[1]);
    ctx.fillStyle = 'rgba(40,112,52,0.78)'; ctx.fill(forest[2]);
    ctx.fillStyle = 'rgba(201,166,107,0.85)'; ctx.fill(cleared[0]);
    ctx.fillStyle = 'rgba(184,142,86,0.85)'; ctx.fill(cleared[1]);
    ctx.fillStyle = 'rgba(255,64,96,0.92)'; ctx.fill(fresh);
    if (s.outline !== false) outline(ctx, G.ring, proj, 'rgba(255,255,255,0.8)', unit);
    ctx.restore();
    return;
  }
  if (phase === 'captions' && o.frame && s.legend !== false) {
    const y0 = Math.round(+s.fromYear || 2001), y1 = Math.round(+s.toYear || 2024);
    const year = Math.round(y0 + (y1 - y0) * u);
    const lost = (G.clearedCount || 0) / Math.max(1, G.cells.length);
    legend(ctx, L, tm, o, [`${String(s.title || 'Forest loss').toUpperCase()} · ${y0}–${year}`, `${Math.round(lost * 100)}% cleared · ${fmtArea((G.clearedCount || 0) * G.cellArea)}`, { text: String(year), big: true }], '#ff4060');
  }
}

// ---------------------------------------------------------------- affected buildings (zones drawn on the overlay)
export function affectedZones(L) {
  const s = L.style || {};
  if (!L.geom) return [];
  if (L.kind === 'blastzone') return s.buildings && s.buildings !== 'off' ? blastZones(s).map((z) => ({ ring: circleRing(L.geom.coordinates, z.km * 1000, 64), color: z.color, name: z.name })) : [];
  if (L.kind === 'wildfire') return s.buildings && s.buildings !== 'off' ? [{ ring: L.geom.coordinates[0], color: '#ff3d00', name: 'Inside the fire area' }] : [];
  if (L.kind !== 'affected') return [];
  const cols = String(s.colors || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (L.geom.type === 'Polygon') return [{ ring: L.geom.coordinates[0], color: cols[0] || '#ff1744', name: 'Inside the area' }];
  const radii = String(s.radii || '').split(/[,;\s]+/).map(Number).filter((v) => v > 0).sort((a, b) => a - b);
  return radii.map((km, i) => ({ ring: circleRing(L.geom.coordinates, km * 1000, 64), color: cols[i] || ['#ff1744', '#ff9100', '#ffd600', '#00e5ff'][i % 4], name: `Within ${fmtKm(km)}`, km }));
}
function drawAffected(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit } = o;
  const zones = affectedZones(L);
  if (phase === 'below' && s.rings !== false) {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    for (const z of zones) { outline(ctx, z.ring, proj, z.color, unit); }
    ctx.restore();
  }
  if (phase === 'above' && L.geom.type === 'Point') {
    const p = proj(L.geom.coordinates);
    ctx.save(); ctx.globalAlpha *= tm.alpha;
    ctx.fillStyle = zones[0]?.color || '#ff1744'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.arc(p[0], p[1], 6 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (phase === 'captions' && o.frame && s.legend !== false) {
    const counts = L._counts || [];
    const lines = [String(s.title || 'Affected buildings').toUpperCase()];
    zones.forEach((z, i) => lines.push(`${z.name}: ${counts[i] != null ? `≈ ${counts[i].toLocaleString()}` : '…'} buildings`));
    const total = counts.reduce((a, b) => a + (b || 0), 0);
    lines.push({ text: counts.length ? `≈ ${total.toLocaleString()}` : '—', big: true });
    legend(ctx, L, tm, o, lines, zones[0]?.color || '#ff1744');
  }
}

export function drawHazard(ctx, L, tm, o, phase) {
  if (!L.geom) return;
  if (L.kind === 'blastzone') drawBlastZone(ctx, L, tm, o, phase);
  else if (L.kind === 'wildfire' && L.geom.type === 'Polygon') drawWildfire(ctx, L, tm, o, phase);
  else if (L.kind === 'deforest' && L.geom.type === 'Polygon') drawDeforest(ctx, L, tm, o, phase);
  else if (L.kind === 'affected') drawAffected(ctx, L, tm, o, phase);
}

// ---------------------------------------------------------------- affected buildings on the map (3D)
const ringBox = (ring) => { let w = Infinity, so = Infinity, e = -Infinity, n = -Infinity; for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); } return [w, so, e, n]; };
/**
 * Shows only the real buildings inside each zone, extruded in the zone colour. The buildings are read from the
 * loaded vector tiles (OpenStreetMap / OpenMapTiles "building" layer), sorted into zones by their centre, and
 * drawn as one fill-extrusion layer per hazard layer (so each can grow with its own timing).
 */
export class AffectedBuildings {
  constructor(map) {
    this.map = map; this.layers = []; this.lids = []; this.key = ''; this.othersMode = 'show'; this.dirty = true; this.lastBuild = 0; this.lastF = new Map();
    map.on('sourcedata', (e) => { if (e.sourceId === 'openmaptiles' && e.tile) this.dirty = true; });
    map.on('idle', () => { if (this.dirty && this.layers.length) this.rebuild(); });
  }
  attach() { this.key = ''; this.dirty = true; if (this.scene) this.sync(this.scene); }
  sync(scene) {
    this.scene = scene;
    const m = this.map;
    if (!m.getStyle?.()) return;
    const want = [];
    let others = 'show';
    for (const L of scene.layers || []) {
      if (L.hidden) continue;
      const zones = affectedZones(L);
      if (!zones.length) continue;
      want.push({ L, zones: zones.map((z) => ({ ...z, box: ringBox(z.ring) })) });
      const o = L.kind === 'affected' ? L.style.others || 'dim' : L.style.buildings === 'only' ? 'hide' : L.style.buildings === 'dim' ? 'dim' : 'show';
      if (o === 'hide' || (o === 'dim' && others !== 'hide')) others = o;
    }
    const key = JSON.stringify(want.map((w) => [w.L.id, w.L.kind, w.zones.map((z) => [z.ring.length, z.ring[0], z.ring[Math.floor(z.ring.length / 2)], z.color])])) + others;
    if (key === this.key) return;
    this.key = key;
    this.layers = want;
    this.othersMode = others;
    for (const id of this.lids) if (m.getLayer(id)) m.removeLayer(id);
    this.lids = [];
    if (!want.length) { if (m.getSource('ma-aff-src')) m.getSource('ma-aff-src').setData({ type: 'FeatureCollection', features: [] }); this.applyOthers(); return; }
    if (!m.getSource('ma-aff-src')) m.addSource('ma-aff-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = m.getLayer('ma-models') ? 'ma-models' : undefined;
    for (const w of want) {
      const id = `ma-aff-${w.L.id}`;
      m.addLayer({ id, type: 'fill-extrusion', source: 'ma-aff-src', filter: ['==', ['get', 'lid'], w.L.id],
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true } }, before);
      this.lids.push(id);
    }
    this.lastF.clear();
    this.applyOthers();
    this.rebuild();
  }
  applyOthers() {
    const m = this.map;
    if (!m.getLayer('ma-buildings')) return;
    m.setLayoutProperty('ma-buildings', 'visibility', this.othersMode === 'hide' ? 'none' : 'visible');
    m.setPaintProperty('ma-buildings', 'fill-extrusion-opacity', this.othersMode === 'dim' ? 0.25 : 0.92);
  }
  /** Read the buildings from the loaded tiles and sort them into zones. */
  rebuild() {
    const m = this.map;
    this.dirty = false;
    if (!m.getSource('openmaptiles') || !m.getSource('ma-aff-src')) return;
    let feats = [];
    try { feats = m.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }); } catch { feats = []; }
    const out = [];
    const counts = new Map();
    for (const w of this.layers) counts.set(w.L, w.zones.map(() => new Set()));
    for (const f of feats) {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 3) continue;
        let cx = 0, cy = 0;
        for (let k = 0; k < ring.length - 1; k++) { cx += ring[k][0]; cy += ring[k][1]; }
        cx /= Math.max(1, ring.length - 1); cy /= Math.max(1, ring.length - 1);
        for (const w of this.layers) {
          const zi = w.zones.findIndex((z) => cx >= z.box[0] && cx <= z.box[2] && cy >= z.box[1] && cy <= z.box[3] && inRing([cx, cy], z.ring));
          if (zi < 0) continue;
          const p = f.properties || {};
          out.push({ type: 'Feature', properties: { lid: w.L.id, z: zi, color: w.zones[zi].color, h: +p.render_height || 8, b: +p.render_min_height || 0, H: +p.render_height || 8, B: +p.render_min_height || 0 }, geometry: { type: 'Polygon', coordinates: poly } });
          counts.get(w.L)[zi].add(f.id ?? `${cx.toFixed(5)},${cy.toFixed(5)}`);
        }
      }
    }
    this.features = out;
    m.getSource('ma-aff-src').setData({ type: 'FeatureCollection', features: out });
    let changed = false;
    for (const [L, sets] of counts) { const arr = sets.map((st) => st.size); if (JSON.stringify(L._counts) !== JSON.stringify(arr)) { L._counts = arr; changed = true; } }
    this.lastF.clear();
    this.lastBuild = performance.now();
    if (changed) this.onCount?.();
  }
  /** Grow each zone's buildings with the layer's timing. */
  update(scene, t, layerTiming) {
    const m = this.map;
    if (this.dirty && this.layers.length && (t == null || performance.now() - this.lastBuild > 400)) this.rebuild();
    for (const w of this.layers) {
      const id = `ma-aff-${w.L.id}`;
      if (!m.getLayer(id)) continue;
      const L = (scene.layers || []).find((x) => x.id === w.L.id) || w.L;
      const tm = layerTiming(L, t);
      const D = Math.max(0.2, +L.duration || 2);
      const fs = w.zones.map((_, i) => {
        if (!tm.visible) return 0;
        if (tm.edit) return 1;
        if (L.kind === 'blastzone') return L.anim === 'expand' ? easeOut((tm.tau - 0.15 - (i / Math.max(1, w.zones.length)) * D * 0.55) / (D * 0.35)) : 1;
        if (L.kind === 'affected' && L.anim === 'grow') return easeOut((tm.tau - i * 0.35) / D);
        if (L.kind === 'wildfire') return clamp(tm.tau / D, 0, 1);
        return 1;
      }).map((f) => Math.round(f * 40) / 40);
      const key = fs.join(',');
      if (this.lastF.get(id) === key) continue;
      this.lastF.set(id, key);
      const k = ['match', ['get', 'z'], ...fs.flatMap((f, i) => [i, Math.max(0.01, f)]), 1];
      m.setPaintProperty(id, 'fill-extrusion-height', ['*', ['get', 'H'], k]);
      m.setPaintProperty(id, 'fill-extrusion-base', ['*', ['get', 'B'], k]);
      m.setLayoutProperty(id, 'visibility', fs.some((f) => f > 0.01) ? 'visible' : 'none');
    }
  }
}
