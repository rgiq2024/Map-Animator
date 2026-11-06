// Incident reconstruction layers (aviation / news explainers):
//  • Flight reconstruction — a flight path drawn in 3D at its real altitude from a time / altitude profile, the aircraft
//    with a drop line to the ground, timestamped radio callouts pinned on the path, the quote being said at the top,
//    a telemetry card (clock, altitude, descent rate, altitude chart), a "since the dive began" timer,
//    REAL TIME / SLOW MOTION / FAST badge, and an impact flash.
//  • Storm cells — 3D radar-style rain volumes (light / heavy / downpour / core) with a legend and a core callout.
// Heights use the map camera's own matrix, so they are right from any angle — including a ground-level viewpoint.
import { placeAt, CUSTOM_POS } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const FT = 0.3048;
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ---------------------------------------------------------------- projection with altitude
/** Filled in every frame by the 3D model layer (MapLibre custom layer): the camera matrix. */
export const ALT3D = { main: null, map: null };
/**
 * Screen position (canvas px, like proj) of [lng, lat] at alt metres. Falls back to a pitch-based lift when the
 * camera matrix is not known yet. Returns [NaN, NaN] behind the camera.
 */
export function makeProjAlt(o) {
  const { proj, map } = o;
  const px = o.px || 1;
  const m = map || ALT3D.map;
  const M = ALT3D.main;
  const tr = m?.transform;
  if (!m || !M || !tr?.getMatrixForModel) {
    const pitch = (o.view?.pitch || 0) * D2R;
    const zoom = o.view?.zoom ?? 10;
    return (ll, alt) => { const p = proj(ll); if (!alt) return p; const mpp = (40075016.686 * Math.cos(ll[1] * D2R)) / (512 * 2 ** zoom); return [p[0], p[1] - (alt / mpp) * Math.sin(pitch) * px]; };
  }
  const c = m.getCanvas();
  const W = c.clientWidth || c.width, H = c.clientHeight || c.height;
  // proj maps css px → canvas px as  x * k + ox; recover k and the offset from two known points
  const ctr = m.getCenter();
  const a = m.project(ctr), pa = proj([ctr.lng, ctr.lat]);
  const k = px;
  const ox = pa[0] - a.x * k, oy = pa[1] - a.y * k;
  return (ll, alt = 0) => {
    const mm = tr.getMatrixForModel(ll, alt);
    const x = mm[12], y = mm[13], z = mm[14], w0 = mm[15];
    const cx = M[0] * x + M[4] * y + M[8] * z + M[12] * w0;
    const cy = M[1] * x + M[5] * y + M[9] * z + M[13] * w0;
    const cw = M[3] * x + M[7] * y + M[11] * z + M[15] * w0;
    if (cw <= 1e-6) return [NaN, NaN];
    const sx = ((cx / cw + 1) / 2) * W, sy = ((1 - cy / cw) / 2) * H;
    return [sx * k + ox, sy * k + oy];
  };
}

// ---------------------------------------------------------------- profile parsing
/** "12:48:27" or "12:48" or seconds → seconds of the day. */
export function clockSec(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const m = String(v).trim().replace(/^[^\d]+/, '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/);
  if (!m) return isFinite(+v) ? +v : NaN;
  return +m[1] * 3600 + +m[2] * 60 + (+m[3] || 0);
}
export function fmtClock(sec, ampm = true) {
  sec = ((sec % 86400) + 86400) % 86400;
  let h = Math.floor(sec / 3600);
  const mi = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const suf = ampm ? (h >= 12 ? ' p.m.' : ' a.m.') : '';
  if (ampm) h = h % 12 || 12;
  return `${String(h).padStart(ampm ? 1 : 2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}${suf}`;
}
/** Profile rows: "time | altitude ft | % of the track | video second" (the last two optional). */
export function parseProfile(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    const p = line.split('|').map((x) => x.trim());
    const t = clockSec(p[0]), alt = parseFloat(String(p[1] || '').replace(/[, ]/g, ''));
    if (!isFinite(t) || !isFinite(alt)) continue;
    rows.push({ t, alt, f: p[2] !== undefined && p[2] !== '' ? clamp(parseFloat(p[2]) / 100, 0, 1) : NaN, v: p[3] !== undefined && p[3] !== '' ? parseFloat(p[3]) : NaN });
  }
  rows.sort((a, b) => a.t - b.t);
  if (!rows.length) return rows;
  const t0 = rows[0].t, t1 = rows.at(-1).t;
  // missing track % → share of the time between the known ones
  const known = rows.map((r, i) => [i, r.f]).filter(([, f]) => isFinite(f));
  if (!known.length || known[0][0] !== 0) known.unshift([0, isFinite(rows[0].f) ? rows[0].f : 0]);
  if (known.at(-1)[0] !== rows.length - 1) known.push([rows.length - 1, 1]);
  for (let j = 0; j < known.length - 1; j++) {
    const [i0, f0] = known[j], [i1, f1] = known[j + 1];
    for (let i = i0; i <= i1; i++) rows[i].f = i1 === i0 ? f0 : f0 + ((f1 - f0) * (rows[i].t - rows[i0].t)) / Math.max(1e-6, rows[i1].t - rows[i0].t);
  }
  rows.t0 = t0; rows.t1 = t1;
  return rows;
}
function interp(rows, t, key) {
  if (!rows.length) return 0;
  if (t <= rows[0].t) return rows[0][key];
  for (let i = 1; i < rows.length; i++) if (t <= rows[i].t) { const a = rows[i - 1], b = rows[i]; const u = (t - a.t) / Math.max(1e-6, b.t - a.t); return a[key] + (b[key] - a[key]) * u; }
  return rows.at(-1)[key];
}
/** Clock seconds at video time tau (layer-local), using the "video second" column when given. */
function clockAt(rows, tau, D) {
  const vs = rows.filter((r) => isFinite(r.v));
  if (vs.length >= 2) {
    if (tau <= vs[0].v) return vs[0].t + (tau - vs[0].v) * ((vs[1].t - vs[0].t) / Math.max(1e-6, vs[1].v - vs[0].v));
    for (let i = 1; i < vs.length; i++) if (tau <= vs[i].v) { const a = vs[i - 1], b = vs[i]; return a.t + ((tau - a.v) * (b.t - a.t)) / Math.max(1e-6, b.v - a.v); }
    return vs.at(-1).t;
  }
  return rows.t0 + ((rows.t1 - rows.t0) * clamp(tau, 0, D)) / Math.max(1e-6, D);
}
// path helpers
const M_PER_DEG = 111320;
function distM(a, b) { const k = Math.cos(((a[1] + b[1]) / 2) * D2R); return Math.hypot((b[0] - a[0]) * k * M_PER_DEG, (b[1] - a[1]) * M_PER_DEG); }
function pathMeasure(cs) { const seg = [0]; for (let i = 1; i < cs.length; i++) seg.push(seg[i - 1] + distM(cs[i - 1], cs[i])); return seg; }
function pathAt(cs, seg, f) {
  const target = clamp(f, 0, 1) * seg.at(-1);
  let i = 1; while (i < cs.length - 1 && seg[i] < target) i++;
  const u = (target - seg[i - 1]) / Math.max(1e-9, seg[i] - seg[i - 1]);
  return [cs[i - 1][0] + (cs[i][0] - cs[i - 1][0]) * u, cs[i - 1][1] + (cs[i][1] - cs[i - 1][1]) * u];
}
// smooth the drawn track a little (Chaikin) so turns look flown
function smooth(cs, n = 2) { let p = cs; for (let k = 0; k < n; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } q.push(p.at(-1)); p = q; } return p; }

// ---------------------------------------------------------------- catalogue
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
export const RC_KINDS = {
  flightrecon: { name: 'Flight reconstruction', icon: '🛩', geom: 'line', desc: 'A flight path in 3D at its real altitude, with radio callouts, altitude / descent-rate panel, clock and impact' },
  stormcells: { name: 'Storm cells (3D radar)', icon: '⛈', geom: 'polygon', desc: '3D radar rain volumes — light, heavy, downpour, core — with a legend' },
};
export const RC_ANIMS = {
  flightrecon: { fly: 'Flies along the path', none: 'Whole path shown' },
  stormcells: { grow: 'Grow up', fade: 'Fade in', none: 'Already there' },
};
const DEF_PROFILE = '12:47:30 | 35000 | 0\n12:48:00 | 35400 | 55\n12:48:15 | 35250 | 70\n12:48:45 | 26000 | 82\n12:49:20 | 8750 | 95\n12:49:45 | 0 | 100';
const DEF_EVENTS = '12:47:30 | Crew reports icing and moderate turbulence | PILOT\n12:48:00 | Cleared to climb to 37,000 ft | ATC\n12:48:27 | “Mayday, Mayday” | PILOT\n12:48:36 | “overspeed condition” | PILOT';
export const RC_DEFAULTS = {
  flightrecon: { anim: 'fly', duration: 20, style: {
    callsign: 'N722BD', profile: DEF_PROFILE, events: DEF_EVENTS, tz: 'ET', ampm: true, diveAt: '12:48:15', heightScale: 1.25,
    color: '#7fe8ff', glow: true, future: 'faint', drop: true, groundTrack: true, plane: true, planeSize: 1, streak: false,
    callouts: true, quote: true, quoteLabel: 'ATC AUDIO', panel: true, panelPos: 'bottom-left', timer: true, badge: true, tag: 'RECONSTRUCTION', title: '', credits: '', impact: true, impactSize: 1, units: 'ft',
  } },
  stormcells: { anim: 'grow', duration: 8, style: { cells: 9, top: 12000, seed: 1, coreLabel: 'STORM CORE · about 55 dBZ', legend: true, legendPos: 'bottom-right', note: '', opacity: 0.55, drift: 0.4, heightScale: 1.25 } },
};
export const RC_FORMS = {
  flightrecon: [
    ['style.callsign', 'Aircraft label (registration / flight)', 'text'],
    ['style.profile', 'Flight profile — one line each: time | altitude (ft) | % along the path | video second (last two optional)', 'textarea'],
    ['style.events', 'Callouts — time | text | who (PILOT / ATC / …)', 'textarea'],
    ['style.tz', 'Time zone label', 'text'], ['style.ampm', '12-hour clock (a.m. / p.m.)', 'switch'],
    ['style.diveAt', '“Since the dive began” from (time, empty = off)', 'text'],
    ['style.heightScale', 'Height exaggeration', 'range', [1, 6, 0.05]],
    ['style.color', 'Path colour', 'color'], ['style.glow', 'Glow', 'switch'], ['style.future', 'Path ahead', 'select', { faint: 'Faint', hidden: 'Hidden', full: 'Full' }],
    ['style.drop', 'Line down to the ground', 'switch'], ['style.groundTrack', 'Track on the ground', 'switch'],
    ['style.plane', 'Aircraft symbol', 'switch'], ['style.planeSize', 'Aircraft size', 'range', [0.4, 4, 0.05], (L) => L.style.plane !== false], ['style.streak', 'Bright streak (for a ground viewpoint)', 'switch'],
    ['style.callouts', 'Callouts on the path', 'switch'], ['style.quote', 'Quote at the top while it is said', 'switch'], ['style.quoteLabel', 'Label above the quote', 'text', null, (L) => L.style.quote !== false],
    ['style.panel', 'Clock · altitude · descent rate panel', 'switch'], ['style.dataLabel', 'Data source after the numbers (e.g. GPS, ADS-B, est.)', 'text', null, (L) => L.style.panel !== false], ['style.panelPos', 'Panel position', 'select', POS, (L) => L.style.panel !== false], ['style.units', 'Altitude units', 'select', { ft: 'feet', m: 'metres' }],
    ['style.timer', '“+0:51 since the dive began” timer', 'switch'], ['style.badge', 'REAL TIME / SLOW MOTION badge', 'switch'],
    ['style.tag', 'Tag (top left)', 'text'], ['style.title', 'Title (top centre)', 'text'], ['style.credits', 'Sources line (bottom)', 'text'],
    ['style.impact', 'Impact flash at the end', 'switch'], ['style.impactSize', 'Flash size', 'range', [0.3, 3, 0.05], (L) => L.style.impact !== false],
  ],
  stormcells: [
    ['style.cells', 'Number of cells', 'range', [1, 30, 1]], ['style.top', 'Cloud tops (ft)', 'range', [2000, 50000, 500]], ['style.heightScale', 'Height exaggeration', 'range', [1, 6, 0.05]],
    ['style.opacity', 'Opacity', 'range', [0.1, 1, 0.01]], ['style.drift', 'Slow drift / boil', 'range', [0, 2, 0.05]], ['style.seed', 'Variation', 'range', [1, 50, 1]],
    ['style.coreLabel', 'Core label (empty = none)', 'text'], ['style.legend', 'Legend (light · heavy · downpour · core)', 'switch'], ['style.legendPos', 'Legend position', 'select', POS, (L) => L.style.legend],
    ['style.note', 'Note under the legend', 'text', null, (L) => L.style.legend],
  ],
};
export const RC_SET = new Set(Object.keys(RC_KINDS));
export const rcPhases = (kind) => (kind === 'stormcells' ? ['above', 'captions'] : ['above', 'captions']);

export function drawRecon(ctx, L, tm, o, phase) {
  if (L.kind === 'flightrecon') drawFlight(ctx, L, tm, o, phase);
  else if (L.kind === 'stormcells') drawStorm(ctx, L, tm, o, phase);
}

// ---------------------------------------------------------------- flight reconstruction
const cache = new WeakMap();
function flightModel(L) {
  const key = `${L.style.profile}§${JSON.stringify(L.geom?.coordinates)}`;
  const c = cache.get(L);
  if (c && c.key === key) return c;
  const rows = parseProfile(L.style.profile);
  const cs = L.geom?.type === 'LineString' ? smooth(L.geom.coordinates, 2) : [];
  const seg = pathMeasure(cs);
  const m = { key, rows, cs, seg };
  cache.set(L, m);
  return m;
}
function eventsOf(s) {
  return String(s.events || '').split('\n').map((ln) => { const p = ln.split('|').map((x) => x.trim()); return { t: clockSec(p[0]), raw: p[0], text: p[1] || '', who: p[2] || '' }; }).filter((e) => isFinite(e.t) && e.text);
}
function drawFlight(ctx, L, tm, o, phase) {
  const s = L.style, { unit, frame: fr } = o;
  const { rows, cs, seg } = flightModel(L);
  if (rows.length < 2 || cs.length < 2) return;
  const D = Math.max(0.5, +L.duration || 20);
  const tau = tm.edit ? D : clamp(tm.tau, 0, D);
  const now = L.anim === 'none' ? rows.t1 : clockAt(rows, tau, D);
  const hs = clamp(+s.heightScale || 1, 0.2, 10);
  const projA = makeProjAlt(o);
  const altFt = (t) => interp(rows, t, 'alt');
  const posAt = (t) => pathAt(cs, seg, interp(rows, t, 'f'));
  const P3 = (t) => projA(posAt(t), Math.max(0, altFt(t)) * FT * hs);
  const col = s.color || '#7fe8ff';
  const ended = now >= rows.t1 - 0.01;
  const a = tm.alpha;
  if (phase === 'above') {
    // sample the path in time
    const N = 260;
    const pts = [];
    for (let i = 0; i <= N; i++) { const t = rows.t0 + ((rows.t1 - rows.t0) * i) / N; pts.push([t, P3(t), posAt(t)]); }
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const strokeRange = (from, to, width, style, blur) => {
      ctx.beginPath(); let on = false;
      for (const [t, p] of pts) {
        if (t < from || t > to) continue;
        if (!isFinite(p[0])) { on = false; continue; }
        on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true;
      }
      const cp = P3(Math.min(to, now));
      if (to >= now && isFinite(cp[0]) && on) ctx.lineTo(cp[0], cp[1]);
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.shadowColor = blur ? hexA(col, 0.9) : 'transparent'; ctx.shadowBlur = blur || 0; ctx.stroke();
    };
    // ground track (shadow of the path)
    if (s.groundTrack !== false) {
      ctx.save();
      ctx.beginPath(); let on = false;
      for (const [t, , ll] of pts) { if (t > now) break; const p = projA(ll, 0); if (!isFinite(p[0])) { on = false; continue; } on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); on = true; }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6 * unit; ctx.stroke();
      ctx.restore();
    }
    if (s.future !== 'hidden' && !ended) strokeRange(now, rows.t1, 1.4 * unit, s.future === 'full' ? hexA(col, 0.9) : hexA(col, 0.22), 0);
    if (s.glow !== false) strokeRange(rows.t0, now, 7 * unit, hexA(col, 0.25), 14 * unit);
    strokeRange(rows.t0, now, 2.6 * unit, '#eafcff', s.glow !== false ? 6 * unit : 0);
    // event dots on the path
    if (s.callouts !== false) for (const e of eventsOf(s)) {
      if (e.t > now) continue;
      const p = P3(e.t);
      if (!isFinite(p[0])) continue;
      ctx.fillStyle = '#eafcff'; ctx.shadowColor = hexA(col, 0.9); ctx.shadowBlur = 8 * unit;
      ctx.beginPath(); ctx.arc(p[0], p[1], 4.5 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1.5 * unit; ctx.stroke();
    }
    // aircraft, drop line, streak
    const cur = P3(now), gnd = projA(posAt(now), 0);
    if (!ended && isFinite(cur[0])) {
      if (s.drop !== false && isFinite(gnd[0])) {
        ctx.setLineDash([3 * unit, 4 * unit]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2 * unit; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(cur[0], cur[1]); ctx.lineTo(gnd[0], gnd[1]); ctx.stroke(); ctx.setLineDash([]);
      }
      const prev = P3(now - 1.2);
      const ang = isFinite(prev[0]) ? Math.atan2(cur[1] - prev[1], cur[0] - prev[0]) : 0;
      if (s.streak) {
        const tail = P3(now - 6);
        if (isFinite(tail[0])) {
          const g = ctx.createLinearGradient(tail[0], tail[1], cur[0], cur[1]);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.85)');
          ctx.strokeStyle = g; ctx.lineWidth = 3.2 * unit; ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 10 * unit;
          ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
        }
      }
      if (s.plane !== false) drawPlane(ctx, cur[0], cur[1], ang, 13 * unit * clamp(+s.planeSize || 1, 0.2, 6));
      if (s.callsign) {
        ctx.shadowBlur = 0; ctx.font = `600 ${12.5 * unit}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4 * unit;
        ctx.fillText(s.callsign, cur[0] + 26 * unit, cur[1] - 22 * unit);
      }
    }
    ctx.restore();
    // impact flash
    if (s.impact !== false && !tm.edit) {
      const since = (now - rows.t1);
      const ft = ended ? tm.tau - videoAtClock(rows, rows.t1, D) : -1;
      if (ended && ft >= 0 && ft < 3.5) {
        const gp = projA(cs.at(-1), 0);
        if (isFinite(gp[0])) impactFlash(ctx, gp[0], gp[1], ft, unit * clamp(+s.impactSize || 1, 0.2, 5), fr, a);
      }
      void since;
    }
    return;
  }
  if (phase !== 'captions') return;
  // callouts pinned above the event points
  ctx.save();
  ctx.globalAlpha *= a;
  if (s.callouts !== false) {
    const used = [];
    for (const e of eventsOf(s)) {
      if (e.t > now) continue;
      const p = P3(e.t);
      if (!isFinite(p[0])) continue;
      const k = tm.edit ? 1 : clamp((now - e.t) / 0.6 + 0.2, 0, 1);
      let lift = 62 * unit;
      // stack callouts that would sit on top of each other
      for (let tries = 0; tries < 6; tries++) {
        const bx = p[0] - 4 * unit, by = p[1] - lift - 38 * unit;
        if (!used.some((r) => bx < r[0] + r[2] && bx + 230 * unit > r[0] && by < r[1] + r[3] && by + 44 * unit > r[1])) break;
        lift += 48 * unit;
      }
      used.push([p[0] - 4 * unit, p[1] - lift - 38 * unit, 230 * unit, 44 * unit]);
      ctx.save(); ctx.globalAlpha *= k;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1 * unit;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] - 6 * unit); ctx.lineTo(p[0], p[1] - lift + 4 * unit); ctx.stroke();
      const x = p[0] - 4 * unit, y = p[1] - lift - 34 * unit;
      ctx.font = `600 ${11 * unit}px ${MONO}`;
      const tline = /^[^\d]/.test(e.raw) ? e.raw : fmtClock(e.t, false), w1 = ctx.measureText(tline).width;
      ctx.font = `700 ${15 * unit}px ${UI}`;
      const w2 = ctx.measureText(e.text).width;
      const w = Math.max(w1, w2) + 22 * unit;
      ctx.fillStyle = 'rgba(4,10,18,0.55)'; ctx.fillRect(x, y - 4 * unit, w, 42 * unit);
      ctx.fillStyle = s.color || '#7fe8ff'; ctx.fillRect(x, y - 4 * unit, 3 * unit, 42 * unit);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = `600 ${11 * unit}px ${MONO}`; ctx.fillStyle = s.color || '#7fe8ff'; ctx.fillText(tline, x + 12 * unit, y);
      ctx.font = `700 ${15 * unit}px ${UI}`; ctx.fillStyle = '#fff'; ctx.fillText(e.text, x + 12 * unit, y + 15 * unit);
      ctx.restore();
    }
  }
  if (!fr) { ctx.restore(); return; }
  const top = fr.y, left = fr.x, W = fr.w, H = fr.h;
  // tag top-left, title top-centre
  if (s.tag) {
    ctx.font = `700 ${14 * unit}px ${UI}`;
    const w = ctx.measureText(s.tag).width + 22 * unit;
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(left + 34 * unit, top + 30 * unit, w, 28 * unit);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s.tag, left + 45 * unit, top + 44.5 * unit);
  }
  if (s.title) {
    ctx.font = `700 ${16 * unit}px ${UI}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s.title).toUpperCase().split('').join(String.fromCharCode(8202)), left + W / 2, top + 40 * unit);
  }
  // quote being said
  if (s.quote !== false) {
    const ev = eventsOf(s).filter((e) => e.t <= now && now - e.t < 7).at(-1);
    if (ev) {
      const k = tm.edit ? 1 : clamp((now - ev.t) / 0.4, 0, 1) * clamp((7 - (now - ev.t)) / 0.6, 0, 1);
      ctx.save(); ctx.globalAlpha *= k;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${11.5 * unit}px ${UI}`; ctx.fillStyle = s.color || '#7fe8ff';
      ctx.fillText(`${ev.who ? `${ev.who.toUpperCase()}  ·  ` : ''}${String(s.quoteLabel || '').toUpperCase()}`.split('').join(String.fromCharCode(8202)), left + W / 2, top + 78 * unit);
      ctx.font = `700 ${30 * unit}px ${UI}`; ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8 * unit;
      ctx.fillText(ev.text, left + W / 2, top + 112 * unit, W * 0.8);
      ctx.restore();
    }
  }
  // badge + dive timer (top right)
  const vRate = rateAt(rows, tau, D);
  if (s.badge !== false && !tm.edit) {
    const label = vRate > 1.6 ? `FAST · ×${Math.round(vRate)}` : vRate < 0.75 ? 'SLOW MOTION' : 'REAL TIME';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = `700 ${14 * unit}px ${UI}`; ctx.fillStyle = '#fff';
    const x = left + W - 34 * unit, y = top + 40 * unit;
    ctx.fillText(label.split('').join(String.fromCharCode(8202)), x, y);
    if (label === 'REAL TIME') { const w = ctx.measureText(label.split('').join(String.fromCharCode(8202))).width; ctx.fillStyle = (Math.floor((o.time || 0) * 2) % 2) ? '#ff3b30' : 'rgba(255,59,48,0.5)'; ctx.beginPath(); ctx.arc(x - w - 12 * unit, y, 5 * unit, 0, Math.PI * 2); ctx.fill(); }
  }
  const dive = clockSec(s.diveAt);
  if (s.timer !== false && isFinite(dive) && now >= dive) {
    const el = Math.min(now, rows.t1) - dive;
    const txt = `+${Math.floor(el / 60)}:${String(Math.floor(el % 60)).padStart(2, '0')}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${44 * unit}px ${MONO}`; ctx.fillStyle = '#fff';
    ctx.fillText(txt, left + W - 34 * unit, top + 108 * unit);
    ctx.font = `600 ${12.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`SINCE THE DIVE BEGAN · ${fmtClock(dive, false)} ${s.tz || ''}`.trim(), left + W - 34 * unit, top + 128 * unit);
  }
  // telemetry panel
  if (s.panel !== false) telemetry(ctx, L, o, rows, now, unit, fr);
  if (s.credits) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `500 ${11.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(s.credits, left + 38 * unit, top + H - 26 * unit, W * 0.7);
  }
  ctx.restore();
}
/** Clock seconds per video second right now (for the badge). */
function rateAt(rows, tau, D) { const d = 0.05; return Math.abs(clockAt(rows, tau + d, D) - clockAt(rows, Math.max(0, tau - d), D)) / (tau - d < 0 ? d + tau : 2 * d); }
function videoAtClock(rows, t, D) { // inverse of clockAt (search)
  let lo = 0, hi = D;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (clockAt(rows, mid, D) < t) lo = mid; else hi = mid; }
  return hi;
}
function drawPlane(ctx, x, y, ang, s) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = s * 0.4;
  ctx.beginPath();
  ctx.moveTo(s * 1.1, 0); ctx.lineTo(s * 0.2, -s * 0.12); ctx.lineTo(-s * 0.15, -s * 0.95); ctx.lineTo(-s * 0.35, -s * 0.95); ctx.lineTo(-s * 0.2, -s * 0.12);
  ctx.lineTo(-s * 0.8, -s * 0.1); ctx.lineTo(-s * 1.0, -s * 0.42); ctx.lineTo(-s * 1.1, -s * 0.42); ctx.lineTo(-s * 1.0, 0);
  ctx.lineTo(-s * 1.1, s * 0.42); ctx.lineTo(-s * 1.0, s * 0.42); ctx.lineTo(-s * 0.8, s * 0.1); ctx.lineTo(-s * 0.2, s * 0.12);
  ctx.lineTo(-s * 0.35, s * 0.95); ctx.lineTo(-s * 0.15, s * 0.95); ctx.lineTo(s * 0.2, s * 0.12); ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function impactFlash(ctx, x, y, ft, u, fr, a) {
  const k = ft < 0.25 ? ft / 0.25 : Math.exp(-(ft - 0.25) * 1.3);
  ctx.save();
  ctx.globalAlpha *= a;
  const R = 260 * u * (0.6 + 0.6 * clamp(ft / 0.8, 0, 1));
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, `rgba(255,255,245,${0.98 * k})`); g.addColorStop(0.25, `rgba(255,236,190,${0.85 * k})`); g.addColorStop(0.6, `rgba(255,170,90,${0.35 * k})`); g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  if (fr) { ctx.fillStyle = `rgba(255,248,235,${0.45 * k * k})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  // fire glow that stays
  const fk = clamp(ft / 0.6, 0, 1) * 0.75;
  const g2 = ctx.createRadialGradient(x, y, 0, x, y, 70 * u);
  g2.addColorStop(0, `rgba(255,190,90,${fk})`); g2.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, 70 * u, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function telemetry(ctx, L, o, rows, now, unit, fr) {
  const s = L.style;
  const W = 340 * unit, H = 205 * unit, m = 26 * unit;
  const pos = s.panelPos || 'bottom-left';
  const x = pos.includes('right') ? fr.x + fr.w - m - W : fr.x + m, y = pos.includes('top') ? fr.y + m + 70 * unit : fr.y + fr.h - m - H - 40 * unit;
  ctx.save();
  placeAt(ctx, L, fr, x, y, W, H, { key: 'panel' });
  ctx.fillStyle = 'rgba(2,6,10,0.9)'; ctx.fillRect(x, y, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1 * unit; ctx.strokeRect(x, y, W, H);
  const t = Math.min(now, rows.t1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
  ctx.font = `700 ${31 * unit}px ${MONO}`;
  ctx.fillText(`${fmtClock(t, s.ampm !== false)} ${s.tz || ''}`.trim(), x + 14 * unit, y + 42 * unit, W - 28 * unit);
  const alt = Math.max(0, interp(rows, t, 'alt'));
  const d = 1.5;
  const rate = ((interp(rows, t - d, 'alt') - interp(rows, t + d, 'alt')) / (2 * d)) * 60; // ft per minute, + = descending
  const mtr = s.units === 'm';
  ctx.font = `600 ${9.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`ALTITUDE${s.dataLabel ? ` (${s.dataLabel})` : ''}`, x + 14 * unit, y + 64 * unit);
  ctx.fillText(`${rate >= 0 ? 'DESCENT' : 'CLIMB'} RATE${s.dataLabel ? ` (${s.dataLabel})` : ''}`, x + 170 * unit, y + 64 * unit);
  ctx.font = `700 ${21 * unit}px ${MONO}`; ctx.fillStyle = '#fff';
  ctx.fillText(mtr ? `${Math.round(alt * FT).toLocaleString('en')} m` : `${Math.round(alt).toLocaleString('en')} ft`, x + 14 * unit, y + 90 * unit);
  const rv = Math.abs(rate);
  ctx.fillStyle = rate > 6000 ? '#ff4d4d' : '#fff';
  const rtxt = mtr ? Math.round(rv * FT).toLocaleString('en') : Math.round(rv).toLocaleString('en');
  ctx.fillText(rtxt, x + 170 * unit, y + 90 * unit);
  const rw = ctx.measureText(rtxt).width;
  ctx.font = `500 ${10 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(mtr ? 'm/min' : 'ft/min', x + 174 * unit + rw, y + 90 * unit);
  // chart
  const cx = x + 44 * unit, cy = y + 104 * unit, cw = W - 60 * unit, ch = 72 * unit;
  const maxAlt = Math.max(...rows.map((r) => r.alt), 1000);
  const top = Math.ceil(maxAlt / 10000) * 10000;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1 * unit;
  ctx.font = `500 ${8.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of [0, top / 2, top]) { const yy = cy + ch - (v / top) * ch; ctx.beginPath(); ctx.moveTo(cx, yy); ctx.lineTo(cx + cw, yy); ctx.stroke(); ctx.fillText(v ? `${Math.round(v / 1000)}k ft` : '0', cx - 5 * unit, yy); }
  const X = (tt) => cx + ((tt - rows.t0) / Math.max(1, rows.t1 - rows.t0)) * cw, Y = (v) => cy + ch - (clamp(v, 0, top) / top) * ch;
  ctx.beginPath(); for (let i = 0; i <= 80; i++) { const tt = rows.t0 + ((rows.t1 - rows.t0) * i) / 80; i ? ctx.lineTo(X(tt), Y(interp(rows, tt, 'alt'))) : ctx.moveTo(X(tt), Y(interp(rows, tt, 'alt'))); }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1 * unit; ctx.stroke();
  ctx.beginPath(); for (let i = 0; i <= 80; i++) { const tt = rows.t0 + ((t - rows.t0) * i) / 80; i ? ctx.lineTo(X(tt), Y(interp(rows, tt, 'alt'))) : ctx.moveTo(X(tt), Y(interp(rows, tt, 'alt'))); }
  ctx.strokeStyle = s.color || '#7fe8ff'; ctx.lineWidth = 2 * unit; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(X(t), cy); ctx.lineTo(X(t), cy + ch); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(t), Y(alt), 3.5 * unit, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `500 ${8.5 * unit}px ${UI}`;
  ctx.fillText(fmtClock(rows.t0, false).slice(0, 5), X(rows.t0) + 14 * unit, cy + ch + 4 * unit);
  ctx.fillText(fmtClock(rows.t1, false).slice(0, 5), X(rows.t1) - 14 * unit, cy + ch + 4 * unit);
  ctx.restore();
}

// ---------------------------------------------------------------- storm cells
const LEVELS = [['light', '#2fd34a'], ['heavy', '#ffe12e'], ['downpour', '#ff8a1f'], ['core', '#ff2a2a']];
function cellsOf(L) {
  const ring = L.geom?.coordinates?.[0] || [];
  if (ring.length < 3) return [];
  const s = L.style, r = rng(hashStr(L.id) + (+s.seed || 1) * 7919);
  let w = Infinity, e = -Infinity, so = Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
  const inside = (x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const out = [];
  const N = clamp(Math.round(+s.cells || 9), 1, 40);
  const spanM = Math.min((e - w) * M_PER_DEG * Math.cos(((n + so) / 2) * D2R), (n - so) * M_PER_DEG);
  for (let i = 0, tries = 0; i < N && tries < 400; tries++) {
    const x = w + r() * (e - w), y = so + r() * (n - so);
    if (!inside(x, y)) continue;
    const lvl = i === 0 ? 3 : r() < 0.15 ? 2 : r() < 0.5 ? 1 : 0;
    out.push({ ll: [x, y], rad: spanM * (0.08 + r() * 0.12) * (lvl === 3 ? 0.7 : 1), lvl, top: (0.45 + r() * 0.55) * (lvl === 3 ? 1 : 0.85), ph: r() * 6.28, lobes: 5 + Math.floor(r() * 4) });
    i++;
  }
  return out;
}
function drawStorm(ctx, L, tm, o, phase) {
  const s = L.style, { unit, frame: fr } = o;
  const cells = cellsOf(L);
  if (!cells.length) return;
  const projA = makeProjAlt(o);
  const D = Math.max(0.5, +L.duration || 8);
  const grow = tm.edit || L.anim === 'none' ? 1 : L.anim === 'grow' ? ease(tm.tau / Math.min(3, D)) : 1;
  const fade = tm.edit || L.anim !== 'fade' ? 1 : ease(tm.tau / 1.5);
  const t = o.time || 0;
  const hs = clamp(+s.heightScale || 1, 0.2, 10);
  const topM = (+s.top || 12000) * FT * hs;
  if (phase === 'above') {
    ctx.save();
    ctx.globalAlpha *= tm.alpha * fade;
    // far cells first (by screen y of the base)
    const order = cells.map((c) => ({ c, p: projA(c.ll, 0) })).filter((x) => isFinite(x.p[0])).sort((a, b) => a.p[1] - b.p[1]);
    const op = clamp(+s.opacity || 0.55, 0.05, 1);
    for (const { c } of order) {
      const H = topM * c.top * grow;
      const slices = 9;
      for (let k = 0; k < slices; k++) {
        const hk = (k + 0.5) / slices;
        const alt = H * hk;
        const prof = Math.sin(Math.PI * Math.min(1, hk * 1.15)) ** 0.6 * (hk > 0.75 ? 1.15 : 1); // anvil-ish
        const rad = c.rad * (0.55 + 0.6 * prof);
        // level by height: core in the middle of the strongest cells
        const lvl = Math.max(0, c.lvl - (hk > 0.8 ? 1 : 0) - (hk < 0.12 ? 1 : 0));
        const colr = LEVELS[lvl][1];
        ctx.beginPath();
        for (let j = 0; j <= 28; j++) {
          const a = (j / 28) * Math.PI * 2;
          const wob = 1 + 0.18 * Math.sin(a * c.lobes + c.ph + t * (+s.drift || 0) * 0.6 + k) + 0.08 * Math.sin(a * 3 - c.ph + t * (+s.drift || 0));
          const dx = Math.cos(a) * rad * wob, dy = Math.sin(a) * rad * wob;
          const ll = [c.ll[0] + dx / (M_PER_DEG * Math.cos(c.ll[1] * D2R)), c.ll[1] + dy / M_PER_DEG];
          const p = projA(ll, alt);
          if (!isFinite(p[0])) continue;
          j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
        ctx.closePath();
        ctx.fillStyle = hexA(colr, op * 0.32);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }
  if (phase !== 'captions') return;
  ctx.save();
  ctx.globalAlpha *= tm.alpha * fade;
  const core = cells.find((c) => c.lvl === 3);
  if (core && s.coreLabel && grow > 0.6) {
    const p = projA(core.ll, topM * core.top * 0.45);
    if (isFinite(p[0])) {
      ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(p[0], p[1], 4 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * unit; ctx.stroke();
      const bx = p[0] + 80 * unit, by = p[1] - 62 * unit;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(bx, by + 14 * unit); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2 * unit; ctx.stroke();
      ctx.font = `700 ${15 * unit}px ${UI}`;
      const w = ctx.measureText(s.coreLabel).width + 24 * unit;
      ctx.fillStyle = 'rgba(8,10,14,0.88)'; ctx.fillRect(bx, by, w, 30 * unit);
      ctx.fillStyle = '#ff2a2a'; ctx.fillRect(bx, by, 4 * unit, 30 * unit);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s.coreLabel, bx + 14 * unit, by + 15.5 * unit);
    }
  }
  if (s.legend && fr) {
    const W = 270 * unit, H = 60 * unit, m = 26 * unit;
    const pos = s.legendPos || 'bottom-right';
    const x = pos.includes('right') ? fr.x + fr.w - m - W : fr.x + m, y = pos.includes('top') ? fr.y + m + 140 * unit : fr.y + fr.h - m - H - 40 * unit;
    placeAt(ctx, L, fr, x, y, W, H, { key: 'legend' });
    ctx.fillStyle = 'rgba(4,8,12,0.82)'; ctx.fillRect(x, y, W, H);
    const bw = (W - 40 * unit) / 4;
    LEVELS.forEach(([name, colr], i) => {
      const xx = x + 14 * unit + i * (bw + 4 * unit);
      ctx.fillStyle = colr; ctx.fillRect(xx, y + 12 * unit, bw, 8 * unit);
      ctx.fillStyle = '#fff'; ctx.font = `500 ${12 * unit}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(name, xx, y + 38 * unit);
    });
    if (s.note) { ctx.font = `500 ${11 * unit}px ${UI}`; ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.textAlign = 'right'; ctx.fillText(s.note, x + W, y + H + 14 * unit); }
  }
  ctx.restore();
}
