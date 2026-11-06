// Transit lines: railway, high-speed rail, metro, tram, light rail, bus / BRT and ferry — a line with stations that draws,
// a vehicle that runs A → B stopping at every station (with a moving "Next: …" label), a line badge and a route strip.
// Also: OpenStreetMap helpers to detect lines in view, follow the real tracks between stations and find stations by name.
import { placeAt, CUSTOM_POS } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const M_PER_DEG = 111320;
export function distM(a, b) { const k = Math.cos(((a[1] + b[1]) / 2) * D2R); return Math.hypot((b[0] - a[0]) * k * M_PER_DEG, (b[1] - a[1]) * M_PER_DEG); }

// ---------------------------------------------------------------- modes
export const MODES = {
  rail: { name: 'Railway', color: '#1f2a44', icon: '🚆', speed: 160, track: 'rails', veh: 'train' },
  hsr: { name: 'High-speed rail', color: '#c8102e', icon: '🚄', speed: 300, track: 'hsr', veh: 'train' },
  metro: { name: 'Metro', color: '#e32119', icon: 'Ⓜ', speed: 80, track: 'metro', veh: 'metro' },
  lightrail: { name: 'Light rail', color: '#00a651', icon: '🚈', speed: 70, track: 'metro', veh: 'metro' },
  tram: { name: 'Tram', color: '#0072bc', icon: '🚋', speed: 40, track: 'tram', veh: 'tram' },
  bus: { name: 'Bus route', color: '#f7941d', icon: '🚌', speed: 40, track: 'bus', veh: 'bus' },
  brt: { name: 'Bus rapid transit', color: '#8e44ad', icon: '🚍', speed: 50, track: 'bus', veh: 'bus' },
  ferry: { name: 'Ferry', color: '#0097a7', icon: '⛴', speed: 35, track: 'ferry', veh: 'ferry' },
};
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
export const TR_KINDS = { transit: { name: 'Transit line', icon: '🚆', geom: 'line', desc: 'A railway, metro, tram, bus or ferry line with stations: the line draws and a vehicle runs A → B stopping at every station' } };
export const TR_ANIMS = { transit: { run: 'Vehicle runs, stopping at stations', draw: 'Line draws, stations pop in', none: 'Whole line shown' } };
export const TR_DEFAULTS = {
  transit: { anim: 'run', duration: 24, style: {
    mode: 'rail', name: 'Line 1', ref: '', color: '', stations: '', region: '',
    reveal: 'ahead', width: 1, stationsOn: true, labels: 'reached', labelSize: 1, dwell: 1.2,
    vehicle: true, vehSize: 1, vehLabel: true, vehText: '{name} · Next: {next}', speed: '', arriving: true,
    badge: true, strip: true, stripPos: 'bottom', track3d: true, train3d: false, tourZoom: 16.5,
  } },
};
export const TR_FORMS = {
  transit: [
    ['style.mode', 'Type', 'select', Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, `${v.icon} ${v.name}`]))],
    ['style.name', 'Line name', 'text'], ['style.ref', 'Line number / letter (badge, e.g. M1)', 'text'],
    ['style.color', 'Line colour (empty = by type)', 'color'],
    ['style.stations', 'Stations — one per line: Name | longitude, latitude (coordinates optional: use “Find stations” below)', 'textarea'],
    ['style.region', 'Search stations in (e.g. United Arab Emirates)', 'text'],
    ['style.reveal', 'Line', 'select', { ahead: 'Whole line faint, solid behind the vehicle', grow: 'Grows behind the vehicle', full: 'Whole line solid' }],
    ['style.width', 'Line width', 'range', [0.4, 3, 0.05]],
    ['style.stationsOn', 'Stations', 'switch'], ['style.labels', 'Station names', 'select', { reached: 'Appear as the vehicle reaches them', all: 'All from the start', none: 'Hidden' }, (L) => L.style.stationsOn !== false],
    ['style.labelSize', 'Name size', 'range', [0.5, 2.5, 0.05]],
    ['style.dwell', 'Stop at each station (s)', 'range', [0, 6, 0.1]],
    ['style.vehicle', 'Vehicle', 'switch'], ['style.vehSize', 'Vehicle size', 'range', [0.4, 4, 0.05], (L) => L.style.vehicle !== false],
    ['style.vehLabel', 'Moving text on the vehicle', 'switch', null, (L) => L.style.vehicle !== false], ['style.vehText', 'Moving text — {name} {ref} {next} {prev} {speed}', 'text', null, (L) => L.style.vehicle !== false && L.style.vehLabel !== false],
    ['style.speed', 'Speed shown (km/h, empty = typical for the type)', 'number', 1, (L) => L.style.vehicle !== false],
    ['style.arriving', '“Arriving · Station” while stopped', 'switch', null, (L) => L.style.vehicle !== false],
    ['style.badge', 'Line badge (top left)', 'switch'], ['style.strip', 'Route strip with all stations', 'switch'], ['style.stripPos', 'Strip position', 'select', { bottom: 'Bottom', top: 'Top' }, (L) => L.style.strip !== false],
    ['style.track3d', 'Real 3D tracks when zoomed in (rail, metro, tram)', 'switch'],
    ['style.wait', 'Wait at the first station (s)', 'range', [0, 15, 0.1]],
    ['style.tourZoom', 'Camera tour: zoom at each station', 'range', [9, 19, 0.1]],
  ],
};
export const TR_SET = new Set(Object.keys(TR_KINDS));
export const trPhases = () => ['below', 'above', 'captions'];

// ---------------------------------------------------------------- geometry + stations
const linesOf = (g) => (g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : []);
function measure(cs) { const seg = [0]; for (let i = 1; i < cs.length; i++) seg.push(seg[i - 1] + distM(cs[i - 1], cs[i])); return seg; }
function at(cs, seg, d) {
  d = clamp(d, 0, seg.at(-1));
  let lo = 1, hi = cs.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (seg[mid] < d) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo), u = (d - seg[i - 1]) / Math.max(1e-9, seg[i] - seg[i - 1]);
  const a = cs[i - 1], b = cs[i];
  const k = Math.cos(((a[1] + b[1]) / 2) * D2R);
  return { ll: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], heading: (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) / D2R + 360) % 360, i };
}
function nearestOnLine(cs, seg, p) {
  let best = { d: Infinity, along: 0 };
  const k = Math.cos(p[1] * D2R);
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1], b = cs[i];
    const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-18;
    const u = clamp(-(ax * dx + ay * dy) / L2, 0, 1);
    const x = ax + dx * u, y = ay + dy * u, d = x * x + y * y;
    if (d < best.d) best = { d, along: seg[i - 1] + (seg[i] - seg[i - 1]) * u };
  }
  return best.along;
}
/** "Name | lng, lat" lines → [{ name, ll | null }]. */
export function parseStations(text) {
  return String(text || '').split('\n').map((ln) => ln.trim()).filter(Boolean).map((ln) => {
    const [name, pos] = ln.split('|').map((x) => x.trim());
    const m = String(pos || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    return { name: name || 'Station', ll: m ? [+m[1], +m[2]] : null };
  });
}
const cache = new WeakMap();
/** Line geometry, measured, with its stations placed along it (in order of distance). */
export function lineModel(L) {
  const key = `${JSON.stringify(L.geom?.coordinates)}§${L.style.stations}`;
  const c = cache.get(L);
  if (c && c.key === key) return c;
  const lines = linesOf(L.geom);
  const cs = lines.length === 1 ? lines[0] : (lines.slice().sort((a, b) => measure(b).at(-1) - measure(a).at(-1))[0] || []);
  const seg = cs.length > 1 ? measure(cs) : [0];
  const total = seg.at(-1) || 0;
  const raw = parseStations(L.style.stations);
  let st = raw.map((s, i) => ({ ...s, along: s.ll && cs.length > 1 ? nearestOnLine(cs, seg, s.ll) : (raw.length > 1 ? (i / (raw.length - 1)) * total : 0) }));
  st.forEach((s) => { const p = at(cs, seg, s.along); s.pos = p.ll; s.heading = p.heading; });
  st = st.sort((a, b) => a.along - b.along);
  const m = { key, lines, cs, seg, total, st };
  cache.set(L, m);
  return m;
}

// ---------------------------------------------------------------- timetable
/**
 * Where the vehicle is at layer time tau: { along, ll, heading, prev, next, dwell (station index or -1), arrivals }.
 * Travel time between stations is shared by distance; each intermediate station holds `dwell` seconds.
 */
export function transitState(L, tau) {
  const m = lineModel(L);
  const s = L.style;
  const D = Math.max(1, +L.duration || 20);
  const st = m.st.length >= 2 ? m.st : [{ name: 'A', along: 0 }, { name: 'B', along: m.total }];
  const n = st.length;
  const dw = clamp(+s.dwell || 0, 0, 10);
  const pad0 = +s.wait > 0 ? Math.min(+s.wait, D * 0.5) : Math.min(0.6, D * 0.04), pad1 = Math.min(1.2, D * 0.06); // wait: hold at the first station
  const move = Math.max(0.5, D - pad0 - pad1 - dw * Math.max(0, n - 2));
  const span = Math.max(1, st[n - 1].along - st[0].along);
  const arrivals = [];
  let t = pad0;
  arrivals.push({ i: 0, arrive: 0, depart: pad0 });
  for (let i = 1; i < n; i++) {
    const segT = (move * (st[i].along - st[i - 1].along)) / span;
    t += segT;
    arrivals.push({ i, arrive: t, depart: i < n - 1 ? t + dw : D });
    if (i < n - 1) t += dw;
  }
  const out = { arrivals, st, m };
  if (L.anim === 'none' || tau == null) { const p = at(m.cs, m.seg, st[n - 1].along); return { ...out, along: st[n - 1].along, ll: p.ll, heading: p.heading, prev: n - 1, next: n - 1, dwell: n - 1, u: 1 }; }
  for (let i = 0; i < n; i++) {
    const a = arrivals[i];
    if (tau >= a.arrive && tau <= a.depart) { const p = at(m.cs, m.seg, st[i].along); return { ...out, along: st[i].along, ll: p.ll, heading: p.heading, prev: i, next: Math.min(n - 1, i + 1), dwell: i, u: 1 }; }
    if (i < n - 1 && tau > a.depart && tau < arrivals[i + 1].arrive) {
      const u = (tau - a.depart) / Math.max(1e-6, arrivals[i + 1].arrive - a.depart);
      const along = st[i].along + (st[i + 1].along - st[i].along) * ease(u);
      const p = at(m.cs, m.seg, along);
      return { ...out, along, ll: p.ll, heading: p.heading, prev: i, next: i + 1, dwell: -1, u };
    }
  }
  const p = at(m.cs, m.seg, st[n - 1].along);
  return { ...out, along: st[n - 1].along, ll: p.ll, heading: p.heading, prev: n - 1, next: n - 1, dwell: n - 1, u: 1 };
}
/** Fraction (0–1) of the line's length covered at layer time tau — for a 3D train following the timetable. */
export function transitFraction(L, tau) { const s = transitState(L, tau); return s.m.total ? s.along / s.m.total : 0; }

// ---------------------------------------------------------------- drawing
export function drawTransit(ctx, L, tm, o, phase) {
  const s = L.style, { proj, unit, frame: fr } = o;
  const M = MODES[s.mode] || MODES.rail;
  const col = s.color || M.color;
  const m = lineModel(L);
  if (!m.cs || m.cs.length < 2) return;
  const D = Math.max(1, +L.duration || 20);
  const tau = tm.edit ? null : tm.tau;
  const network = m.lines.length > 1 && !m.st.length;
  const run = L.anim === 'run' && !network;
  const S = run ? transitState(L, tau) : null;
  const drawU = L.anim === 'draw' && !tm.edit ? easeOut(clamp(tm.tau / (D * 0.7), 0, 1)) : 1;
  const done = run ? (tau == null ? m.total : S.along) : m.total * drawU;
  const W = (+s.width || 1) * unit;
  const a = tm.alpha;
  const railish = ['rail', 'hsr', 'metro', 'lightrail', 'tram'].includes(s.mode || 'rail');
  const z = o.view?.zoom ?? o.map?.getZoom?.() ?? 0;
  const close = s.track3d !== false && railish ? clamp((z - 13) / 1.6, 0, 1) : 0; // 0 = map view, 1 = on the real tracks
  // tilted close-ups: parts of a long line pass behind the camera, where screen projection mirrors — clip to the visible ground
  const Q = viewQuad(o.map);
  const seen = (ll) => !Q || inQuad(Q, ll);
  if (phase === 'below') {
    ctx.save();
    ctx.globalAlpha *= a * (1 - 0.82 * close);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const cs of m.lines) {
      const seg = cs === m.cs ? m.seg : measure(cs);
      const pathTo = (dEnd) => {
        ctx.beginPath();
        for (const run of clippedRuns(cs, seg, dEnd, Q)) run.forEach((ll, i) => { const p = proj(ll); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      };
      const full = () => pathTo(Infinity);
      const dDone = cs === m.cs ? done : (run ? Infinity : seg.at(-1) * drawU);
      if (s.reveal === 'ahead' && dDone < seg.at(-1)) { full(); ctx.strokeStyle = hexA(col, 0.28); ctx.lineWidth = 5 * W; ctx.setLineDash(M.track === 'bus' ? [8 * W, 6 * W] : []); ctx.stroke(); ctx.setLineDash([]); }
      const len = s.reveal === 'full' ? Infinity : dDone;
      strokeTrack(ctx, M.track, col, W, () => pathTo(len));
    }
    ctx.restore();
    return;
  }
  if (phase === 'above') {
    // stations
    if (s.stationsOn !== false) {
      ctx.save(); ctx.globalAlpha *= a;
      m.st.forEach((st, i) => {
        const reached = done >= st.along - 1 || L.anim === 'none' || tm.edit;
        if (!seen(st.pos)) return;
        const p = proj(st.pos);
        if (!isFinite(p[0])) return;
        const term = i === 0 || i === m.st.length - 1;
        const r = (term ? 7 : 5.2) * unit * Math.max(0.8, Math.sqrt(+s.width || 1));
        const cur = run && S.dwell === i;
        if (cur) { const k = ((o.time || 0) * 1.2) % 1; ctx.strokeStyle = hexA(col, 0.6 * (1 - k)); ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(p[0], p[1], r + 18 * unit * k, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = reached ? '#ffffff' : 'rgba(255,255,255,0.55)';
        ctx.strokeStyle = reached ? col : hexA(col, 0.45); ctx.lineWidth = (term ? 3.4 : 2.8) * unit;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (term) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.38, 0, Math.PI * 2); ctx.fill(); }
      });
      ctx.restore();
    }
    // vehicle
    if (run && s.vehicle !== false && S && !(s.train3d && close > 0.5) && seen(S.ll)) {
      const p = proj(S.ll);
      const ahead = at(m.cs, m.seg, Math.min(m.total, S.along + Math.max(5, m.total * 0.002)));
      const behind = at(m.cs, m.seg, Math.max(0, S.along - Math.max(5, m.total * 0.002)));
      const p2 = proj(ahead.ll), p1 = proj(behind.ll);
      const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      if (isFinite(p[0])) drawVehicle(ctx, M.veh, p[0], p[1], ang, 15 * unit * (+s.vehSize || 1), col, a, S.dwell >= 0);
    }
    return;
  }
  if (phase !== 'captions') return;
  ctx.save();
  ctx.globalAlpha *= a;
  const ls = clamp(+s.labelSize || 1, 0.3, 4);
  // station names
  if (s.stationsOn !== false && s.labels !== 'none') {
    const used = [];
    m.st.forEach((st, i) => {
      const reached = s.labels === 'all' || tm.edit || L.anim === 'none' || done >= st.along - 1;
      if (!reached || !seen(st.pos)) return;
      const p = proj(st.pos);
      if (!isFinite(p[0])) return;
      const k = s.labels === 'all' || tm.edit || !run ? 1 : clamp(((tau ?? D) - (S.arrivals[i]?.arrive ?? 0)) / 0.35 + 1, 0, 1);
      const term = i === 0 || i === m.st.length - 1;
      ctx.font = `${term ? 800 : 700} ${12.5 * unit * ls * (term ? 1.12 : 1)}px ${UI}`;
      const w = ctx.measureText(st.name).width;
      // side: away from the line direction, alternate when crowded
      const hd = (st.heading || 0) * D2R;
      let nx = Math.cos(hd), ny = Math.sin(hd); // screen normal (east-ish when the line runs north)
      const sides = i % 2 ? [1, -1] : [-1, 1];
      let placed = null;
      for (const sd of sides) {
        const off = 14 * unit;
        const x = p[0] + nx * sd * off + (nx * sd >= 0 ? 0 : -w), y = p[1] + ny * sd * off - 7 * unit * ls;
        const box = [x - 4 * unit, y - 2 * unit, w + 8 * unit, 18 * unit * ls];
        if (!used.some((b) => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) { placed = [x, y, box]; break; }
      }
      if (!placed) { if (!term) return; const x = p[0] + 12 * unit, y = p[1] - 22 * unit; placed = [x, y, [x, y, w, 16 * unit]]; }
      used.push(placed[2]);
      ctx.save(); ctx.globalAlpha *= k;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.lineWidth = 4 * unit; ctx.strokeStyle = 'rgba(10,14,22,0.75)'; ctx.lineJoin = 'round';
      ctx.strokeText(st.name, placed[0], placed[1]);
      ctx.fillStyle = '#ffffff'; ctx.fillText(st.name, placed[0], placed[1]);
      ctx.restore();
    });
  }
  // moving text on the vehicle
  if (run && s.vehicle !== false && s.vehLabel !== false && S && tau != null && seen(S.ll)) {
    const p = proj(S.ll);
    if (isFinite(p[0])) {
      const stn = m.st;
      const kmh = +s.speed || M.speed;
      const moving = S.dwell < 0;
      let txt = String(s.vehText || '{name}').replace(/\{(\w+)\}/g, (_, k) => ({ name: s.name || M.name, ref: s.ref || '', next: stn[S.next]?.name || '', prev: stn[S.prev]?.name || '', speed: moving ? `${Math.round(kmh * Math.sin(Math.PI * clamp(S.u, 0.08, 0.92)) ** 0.35)} km/h` : '0 km/h' })[k] ?? '');
      if (!moving && s.arriving !== false) txt = S.dwell === stn.length - 1 ? `Arrived · ${stn[S.dwell]?.name || ''}` : `${S.dwell === 0 ? 'Departing' : 'Arriving'} · ${stn[S.dwell]?.name || ''}`;
      ctx.font = `700 ${12 * unit}px ${UI}`;
      const w = ctx.measureText(txt).width + 22 * unit, h = 24 * unit;
      let x = p[0] + 18 * unit, y = p[1] - 46 * unit;
      if (fr) { x = clamp(x, fr.x + 6 * unit, fr.x + fr.w - w - 6 * unit); y = clamp(y, fr.y + 6 * unit, fr.y + fr.h - h - 6 * unit); }
      ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1.4 * unit;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(x, y + h); ctx.stroke();
      rr(ctx, x, y, w, h, 5 * unit); ctx.fillStyle = 'rgba(8,12,20,0.88)'; ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(x, y, 4 * unit, h);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + 12 * unit, y + h / 2 + 0.5 * unit);
    }
  }
  if (!fr) { ctx.restore(); return; }
  // line badge
  if (s.badge !== false) {
    const bx = fr.x + 30 * unit, by = fr.y + 30 * unit, sz = 46 * unit;
    ctx.save();
    placeAt(ctx, L, fr, bx, by, 330 * unit, sz, { key: 'badge' });
    rr(ctx, bx, by, sz, sz, 10 * unit); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${(s.ref ? (String(s.ref).length > 2 ? 15 : 20) : 22) * unit}px ${UI}`;
    ctx.fillText(s.ref || M.icon, bx + sz / 2, by + sz / 2 + 1 * unit, sz - 6 * unit);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * unit;
    ctx.font = `800 ${19 * unit}px ${UI}`; ctx.fillText(s.name || M.name, bx + sz + 12 * unit, by + 15 * unit);
    if (m.st.length >= 2) { ctx.font = `500 ${12.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillText(`${m.st[0].name} → ${m.st.at(-1).name} · ${m.st.length} stations · ${Math.round(m.total / 1000)} km`, bx + sz + 12 * unit, by + 35 * unit); }
    ctx.restore();
  }
  // route strip
  if (s.strip !== false && m.st.length >= 2) {
    const n = m.st.length;
    const W2 = Math.min(fr.w - 80 * unit, Math.max(420 * unit, n * 92 * unit)), H2 = 66 * unit;
    const x0 = fr.x + (fr.w - W2) / 2, y0 = s.stripPos === 'top' ? fr.y + 92 * unit : fr.y + fr.h - H2 - 26 * unit;
    ctx.save();
    placeAt(ctx, L, fr, x0, y0, W2, H2, { key: 'strip' });
    rr(ctx, x0, y0, W2, H2, 10 * unit); ctx.fillStyle = 'rgba(8,12,20,0.78)'; ctx.fill();
    const lx0 = x0 + 26 * unit, lx1 = x0 + W2 - 26 * unit, ly = y0 + 22 * unit;
    const X = (i) => lx0 + ((lx1 - lx0) * i) / (n - 1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 5 * unit; ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(lx1, ly); ctx.stroke();
    // progress (between station dots, by timetable)
    let px = lx1;
    if (run && S && tau != null) px = S.dwell >= 0 ? X(S.dwell) : X(S.prev) + (X(S.next) - X(S.prev)) * ease(S.u);
    else if (L.anim === 'draw' && !tm.edit) px = lx0 + (lx1 - lx0) * drawU;
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(px, ly); ctx.stroke();
    ctx.font = `600 ${10 * unit}px ${UI}`;
    for (let i = 0; i < n; i++) {
      const x = X(i), reached = x <= px + 1;
      const cur = run && S && S.dwell === i;
      ctx.fillStyle = reached ? '#fff' : 'rgba(255,255,255,0.35)';
      ctx.strokeStyle = reached ? col : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2.4 * unit;
      ctx.beginPath(); ctx.arc(x, ly, (cur ? 6.5 : 4.5) * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(x, ly + 11 * unit); ctx.rotate(n > 7 ? 0.42 : 0);
      ctx.textAlign = n > 7 ? 'left' : 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = cur ? '#fff' : reached ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)';
      ctx.font = `${cur ? 800 : 600} ${10 * unit}px ${UI}`;
      ctx.fillText(m.st[i].name, 0, 0, n > 7 ? 120 * unit : (lx1 - lx0) / (n - 1) - 6 * unit);
      ctx.restore();
    }
    // vehicle dot on the strip
    if (run && S && tau != null) { ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit; ctx.beginPath(); ctx.arc(px, ly, 7 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}
/** The ground the camera sees (a convex quad in lng/lat, a little larger than the screen), or null when looking straight down-ish. */
function viewQuad(map) {
  try {
    if (!map || map.getPitch() < 25) return null;
    const c = map.getCanvas(), w = c.clientWidth, h = c.clientHeight;
    const q = [[-0.15 * w, 0], [1.15 * w, 0], [1.15 * w, 1.15 * h], [-0.15 * w, 1.15 * h]].map((p) => map.unproject(p).toArray());
    const k = Math.cos(map.getCenter().lat * D2R);
    const P = q.map(([x, y]) => [x * k, y]);
    let A = 0; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; A += a[0] * b[1] - b[0] * a[1]; }
    if (!isFinite(A) || Math.abs(A) < 1e-14) return null;
    return { P: A > 0 ? P : P.reverse(), k };
  } catch { return null; }
}
function inQuad(Q, [x, y]) {
  const px = x * Q.k;
  for (let i = 0; i < 4; i++) { const a = Q.P[i], b = Q.P[(i + 1) % 4]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (px - a[0]) < 0) return false; }
  return true;
}
/** Pieces of a line (up to distance dEnd) that lie inside the view quad — Cyrus–Beck per segment. */
function clippedRuns(cs, seg, dEnd, Q) {
  const runs = [];
  let cur = null;
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  for (let i = 1; i < cs.length; i++) {
    if (seg[i - 1] >= dEnd) break;
    let a = cs[i - 1], b = cs[i];
    if (seg[i] > dEnd) b = lerp(a, b, (dEnd - seg[i - 1]) / Math.max(1e-9, seg[i] - seg[i - 1]));
    let t0 = 0, t1 = 1;
    if (Q) {
      const A = [a[0] * Q.k, a[1]], B = [b[0] * Q.k, b[1]];
      for (let j = 0; j < 4 && t0 <= t1; j++) {
        const p = Q.P[j], q = Q.P[(j + 1) % 4];
        const nx = -(q[1] - p[1]), ny = q[0] - p[0]; // inward normal (CCW)
        const num = nx * (A[0] - p[0]) + ny * (A[1] - p[1]);
        const den = nx * (B[0] - A[0]) + ny * (B[1] - A[1]);
        if (Math.abs(den) < 1e-18) { if (num < 0) t1 = -1; continue; }
        const t = -num / den;
        if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      }
      if (t0 > t1) { cur = null; continue; }
    }
    const p0 = t0 > 0 ? lerp(a, b, t0) : a, p1 = t1 < 1 ? lerp(a, b, t1) : b;
    if (!cur || t0 > 0) { cur = [p0]; runs.push(cur); }
    cur.push(p1);
    if (t1 < 1) cur = null;
  }
  return runs;
}
function strokeTrack(ctx, kind, col, W, path) {
  if (kind === 'rails') {
    path(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7.5 * W; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 5.5 * W; ctx.stroke();
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2 * W; ctx.setLineDash([9 * W, 9 * W]); ctx.stroke(); ctx.setLineDash([]);
  } else if (kind === 'hsr') {
    path(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 8 * W; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 6 * W; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4 * W; ctx.stroke();
  } else if (kind === 'metro') {
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9 * W; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 6.2 * W; ctx.stroke();
  } else if (kind === 'tram') {
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6.5 * W; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 4 * W; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4 * W; ctx.setLineDash([1.2 * W, 10 * W]); ctx.stroke(); ctx.setLineDash([]);
  } else if (kind === 'bus') {
    path(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7.5 * W; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 4.6 * W; ctx.setLineDash([10 * W, 6 * W]); ctx.stroke(); ctx.setLineDash([]);
  } else {
    path(); ctx.strokeStyle = col; ctx.lineWidth = 3.4 * W; ctx.setLineDash([2 * W, 7 * W]); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawVehicle(ctx, veh, x, y, ang, s, col, a, stopped) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.globalAlpha *= a;
  // glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.4);
  g.addColorStop(0, hexA(col, stopped ? 0.25 : 0.45)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = s * 0.35;
  if (veh === 'ferry') {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(s * 1.1, 0); ctx.quadraticCurveTo(s * 0.6, -s * 0.5, -s * 0.9, -s * 0.45); ctx.lineTo(-s * 0.9, s * 0.45); ctx.quadraticCurveTo(s * 0.6, s * 0.5, s * 1.1, 0); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(-s * 0.5, -s * 0.22, s * 0.8, s * 0.44);
  } else {
    const len = veh === 'bus' ? 1.5 : veh === 'tram' ? 2.2 : 3, wid = veh === 'bus' ? 0.62 : 0.5;
    const cars = veh === 'bus' ? 1 : veh === 'tram' ? 2 : veh === 'metro' ? 3 : 3;
    const cl = (len * s) / cars;
    for (let i = 0; i < cars; i++) {
      const x0 = -len * s / 2 + i * cl;
      rr(ctx, x0 + s * 0.04, -wid * s / 2, cl - s * 0.08, wid * s, (i === cars - 1 && veh !== 'bus' ? wid * s * 0.5 : s * 0.12));
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = col; ctx.fillRect(x0 + s * 0.12, -wid * s * 0.16, cl - s * 0.24, wid * s * 0.32);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- OpenStreetMap helpers (browser)
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(q) {
  let err;
  for (const u of OVERPASS) {
    try {
      const r = await fetch(u, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (r.ok) return await r.json();
      err = new Error(`Overpass ${r.status}`);
    } catch (e) { err = e; }
  }
  throw err || new Error('Overpass unavailable');
}
const ROUTE_MODE = { train: 'rail', railway: 'rail', subway: 'metro', light_rail: 'lightrail', monorail: 'lightrail', tram: 'tram', bus: 'bus', trolleybus: 'bus', ferry: 'ferry' };
/** Public-transport routes (OSM route relations) inside bbox [w, s, e, n]: [{ id, name, ref, mode, colour, from, to, operator }]. */
export async function osmRoutesInView(bbox, kinds = Object.keys(ROUTE_MODE)) {
  const [w, s, e, n] = bbox;
  const re = kinds.join('|');
  const j = await overpass(`[out:json][timeout:40];relation["type"="route"]["route"~"^(${re})$"](${s},${w},${n},${e});out tags;`);
  const seen = new Set();
  return (j.elements || []).map((r) => ({ id: r.id, name: r.tags.name || r.tags.ref || `Route ${r.id}`, ref: r.tags.ref || '', mode: ROUTE_MODE[r.tags.route] || 'rail', route: r.tags.route, colour: r.tags.colour || '', from: r.tags.from || '', to: r.tags.to || '', operator: r.tags.operator || r.tags.network || '' }))
    .filter((r) => { const k = `${r.route}|${r.ref}|${r.name.replace(/[:→-].*$/, '')}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Object.keys(MODES).indexOf(a.mode) - Object.keys(MODES).indexOf(b.mode) || a.name.localeCompare(b.name));
}
/** Join way pieces into one line (greedy, flipping pieces as needed). */
export function stitch(pieces) {
  const ws = pieces.filter((p) => p.length > 1).map((p) => p.slice());
  if (!ws.length) return [];
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  let line = ws.shift();
  let guard = 0;
  while (ws.length && guard++ < 5000) {
    const head = line[0], tail = line.at(-1);
    let best = null;
    ws.forEach((w, i) => {
      for (const [end, rev, atTail] of [[w[0], false, true], [w.at(-1), true, true], [w.at(-1), false, false], [w[0], true, false]]) {
        const d = distM(atTail ? tail : head, end);
        if (!best || d < best.d) best = { i, rev, atTail, d };
      }
    });
    const w = ws.splice(best.i, 1)[0];
    const seg = best.rev ? w.reverse() : w;
    if (best.atTail) line = line.concat(key(seg[0]) === key(tail) ? seg.slice(1) : seg);
    else line = (key(seg.at(-1)) === key(head) ? seg.slice(0, -1) : seg).concat(line);
  }
  return line;
}
/** Geometry and stops of one OSM route relation: { coords, stations: [{ name, ll }] }. */
export async function osmRoute(id) {
  const j = await overpass(`[out:json][timeout:60];relation(${id});out geom;relation(${id});node(r)->.n;.n out;`);
  const rel = (j.elements || []).find((e) => e.type === 'relation');
  const nodes = new Map((j.elements || []).filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const pieces = [];
  const stops = [];
  for (const mem of rel?.members || []) {
    if (mem.type === 'way' && mem.geometry && !/platform/.test(mem.role || '')) pieces.push(mem.geometry.map((g) => [g.lon, g.lat]));
    if (mem.type === 'node' && /^stop/.test(mem.role || '')) { const nd = nodes.get(mem.ref); if (nd) stops.push({ name: nd.tags?.name || nd.tags?.ref || '', ll: [nd.lon, nd.lat] }); }
  }
  if (!stops.some((s) => s.name)) for (const mem of rel?.members || []) if (/platform/.test(mem.role || '') && mem.type === 'node') { const nd = nodes.get(mem.ref); if (nd) stops.push({ name: nd.tags?.name || '', ll: [nd.lon, nd.lat] }); }
  // drop unnamed and repeated names
  const seen = new Set();
  const stations = stops.filter((s) => s.name && !seen.has(s.name) && seen.add(s.name));
  return { coords: stitch(pieces), stations, tags: rel?.tags || {} };
}
const TRACK_RE = { rail: 'rail|narrow_gauge|construction', hsr: 'rail|construction', metro: 'subway|light_rail|rail', lightrail: 'light_rail|tram|subway|rail', tram: 'tram|light_rail' };
/** Railway tracks (OSM ways) in bbox as a list of lines. */
export async function osmTracks(bbox, mode = 'rail') {
  const [w, s, e, n] = bbox;
  const re = TRACK_RE[mode] || TRACK_RE.rail;
  const j = await overpass(`[out:json][timeout:60];way["railway"~"^(${re})$"](${s},${w},${n},${e});out geom;`);
  return (j.elements || []).filter((x) => x.geometry && !/^(siding|yard|spur|crossover)$/.test(x.tags?.service || '')).map((x) => x.geometry.map((g) => [g.lon, g.lat]));
}
/** Shortest path through a set of lines from a to b (Dijkstra on the joined network); null when not connected. */
export function routeOnNetwork(lines, a, b) {
  const id = new Map(), pts = [], adj = [];
  const node = (p) => { const k = `${p[0].toFixed(5)},${p[1].toFixed(5)}`; let i = id.get(k); if (i == null) { i = pts.length; id.set(k, i); pts.push(p); adj.push([]); } return i; };
  for (const ln of lines) for (let i = 1; i < ln.length; i++) { const u = node(ln[i - 1]), v = node(ln[i]); const d = distM(ln[i - 1], ln[i]); adj[u].push([v, d]); adj[v].push([u, d]); }
  if (!pts.length) return null;
  const nearest = (p) => { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = distM(p, q); if (d < bd) { bd = d; bi = i; } }); return [bi, bd]; };
  const [sa, da] = nearest(a), [sb, db] = nearest(b);
  if (da > 4000 || db > 4000) return null;
  const dist = new Float64Array(pts.length).fill(Infinity), prev = new Int32Array(pts.length).fill(-1);
  dist[sa] = 0;
  const heap = [[0, sa]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  heap.length = 0; push([0, sa]);
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    if (u === sb) break;
    for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; push([dist[v], v]); }
  }
  if (!isFinite(dist[sb])) return null;
  const path = [];
  for (let v = sb; v !== -1; v = prev[v]) path.push(pts[v]);
  return path.reverse();
}
/** Road route between points (OSRM demo server) for bus lines. */
export async function roadRoute(points) {
  const q = points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${q}?overview=full&geometries=geojson`);
  if (!r.ok) throw new Error(`routing ${r.status}`);
  const j = await r.json();
  return j.routes?.[0]?.geometry?.coordinates || null;
}
/** Find a place by name (OpenStreetMap Nominatim). */
export async function geocode(name, region = '', near = null) {
  const params = new URLSearchParams({ format: 'json', limit: '1', q: region ? `${name}, ${region}` : name });
  if (near) params.set('viewbox', near.join(','));
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) return null;
  const j = await r.json();
  return j[0] ? [+(+j[0].lon).toFixed(5), +(+j[0].lat).toFixed(5)] : null;
}

// ---------------------------------------------------------------- examples
/** Etihad Rail passenger network (11 announced stations; positions approximate, west → east). */
export const ETIHAD_RAIL = {
  name: 'Etihad Rail', ref: 'ER', mode: 'hsr', color: '#a6192e', region: 'United Arab Emirates', speed: 200,
  stations: [
    ['Al Sila', 51.75, 24.03], ['Al Dhannah', 52.65, 24.15], ['Al Mirfa', 53.45, 24.07], ['Mezaira’a', 53.78, 23.15], ['Madinat Zayed', 53.71, 23.68],
    ['Mohamed Bin Zayed City', 54.55, 24.34], ['Al Faya', 54.80, 24.42], ['Jumeirah Golf Estates', 55.19, 25.02], ['University City', 55.48, 25.29], ['Al Dhaid', 55.88, 25.29], ['Al Hilal (Fujairah)', 56.31, 25.16],
  ],
};
