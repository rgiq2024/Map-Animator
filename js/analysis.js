// Remote-sensing analysis layers:
//  • Oil spill — a slick drawn as an area that spreads from its source and drifts, with a marching dashed outline,
//    "OIL SPILL" label, source vessel blip, drift arrow and a stats card (area, estimated volume, sensor, date).
//    Optional SAR look turns the map into a teal radar picture like a Sentinel-1 scene.
//  • Moving label — text that follows a moving object or 3D model (plane, ship, vehicle, the route arrow…)
//    with live speed, altitude, heading and position.
import { placeAt, CUSTOM_POS } from './place.js';
import { layerTiming } from './layers.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const D2R = Math.PI / 180;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const STENCIL = '"Rajdhani","Archivo","Inter",system-ui,sans-serif';
function hexA(hex, a) {
  const h = String(hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };

// ---------------------------------------------------------------- catalogue
export const AN_KINDS = {
  oilspill: { name: 'Oil spill', icon: '🛢', geom: 'polygon', desc: 'An oil slick spreading from its source with a dashed outline, label, drift and area / volume estimate' },
  tracklabel: { name: 'Moving label', icon: '🏷', geom: null, desc: 'Text that follows a moving object or 3D model, with live speed, altitude and heading' },
};
export const AN_ANIMS = {
  oilspill: { spread: 'Spreads from the source', trace: 'Outline traced, then filled', fade: 'Fade in', none: 'Already there' },
  tracklabel: { pop: 'Pop in', fade: 'Fade in', none: 'Cut in' },
};
export const SPILL_LOOKS = { outline: 'Dashed outline only (like a SAR analysis)', slick: 'Dark slick + outline', sheen: 'Rainbow sheen + outline', thickness: 'Thickness zones (thick → thin)', heat: 'Red alert fill' };
export const TRACK_LOOKS = { tag: 'Tag with a leader line', callout: 'Data box (name + live values)', hud: 'Target brackets + data', flag: 'Flag on a pole', minimal: 'Just the text' };
export const AN_DEFAULTS = {
  oilspill: { anim: 'spread', duration: 6, style: { look: 'outline', label: 'OIL SPILL', labelSize: 1, outline: '#ffffff', dash: true, march: true, fill: '#1b1410', fillOpacity: 0.55, source: 'first', vessel: true, vesselGlow: true, drift: true, driftDir: 135, driftKn: 0.6, driftKm: 0.4, card: true, title: 'Oil spill detected', sensor: 'Sentinel-1 SAR', date: '', thickness: 1, position: 'bottom-left', sar: false, sarStrength: 1, seed: 0 } },
  tracklabel: { anim: 'pop', duration: 8, style: { target: '', look: 'tag', text: '{name}\n{speed} · {alt}', name: '', color: '#ffd23f', textColor: '#ffffff', bg: '#0b1220', size: 1, side: 'right', dx: 0, dy: 0, leader: true, trail: false, speedMode: 'auto', timeScale: 1, speedFrom: 0, speedTo: 280, speedUnit: 'kmh', altUnit: 'm', altFrom: '', altTo: '' } },
};
const SPEED_UNITS = { kmh: 'km/h', kn: 'knots', mph: 'mph', ms: 'm/s', mach: 'Mach' };
export const AN_FORMS = {
  oilspill: [
    ['style.look', 'Style', 'select', SPILL_LOOKS],
    ['style.label', 'Label', 'text'], ['style.labelSize', 'Label size (drag the label on the video to move it)', 'range', [0.4, 3, 0.05]],
    ['style.outline', 'Outline colour', 'color'], ['style.dash', 'Dashed outline', 'switch'], ['style.march', 'Moving dashes', 'switch', null, (L) => L.style.dash !== false],
    ['style.fill', 'Slick colour', 'color', null, (L) => ['slick', 'heat'].includes(L.style.look)], ['style.fillOpacity', 'Fill strength', 'range', [0.05, 1, 0.01], (L) => L.style.look !== 'outline'],
    ['style.source', 'Spreads from', 'select', { first: 'The first point you drew', centre: 'The middle', vessel: 'The ship (first point)' }, (L) => L.anim === 'spread'],
    ['style.vessel', 'Source ship (bright blip)', 'switch'], ['style.vesselGlow', 'Ship glow', 'switch', null, (L) => L.style.vessel],
    ['style.drift', 'Drift arrow', 'switch'], ['style.driftDir', 'Drifting towards (° — 0 = north, 90 = east)', 'range', [0, 359, 1], (L) => L.style.drift], ['style.driftKn', 'Drift speed (knots)', 'range', [0, 5, 0.1], (L) => L.style.drift], ['style.driftKm', 'Moves this far during the layer (km, 0 = still)', 'range', [0, 30, 0.1]],
    ['style.card', 'Stats card (area, volume…)', 'switch'], ['style.title', 'Card title', 'text', null, (L) => L.style.card], ['style.sensor', 'Detected by', 'text', null, (L) => L.style.card], ['style.date', 'Date (e.g. 12 Mar 2026)', 'text', null, (L) => L.style.card], ['style.thickness', 'Average thickness (micrometres) for the volume estimate', 'range', [0.05, 200, 0.05], (L) => L.style.card], ['style.position', 'Card position', 'select', POS, (L) => L.style.card],
    ['style.sar', 'SAR radar look for the map (teal, like Sentinel-1)', 'switch'], ['style.sarStrength', 'SAR look strength', 'range', [0.2, 1, 0.05], (L) => L.style.sar],
    ['style.seed', 'Texture variation', 'range', [0, 20, 1], (L) => L.style.look !== 'outline'],
  ],
  tracklabel: [
    ['style.target', 'Follows', 'target'],
    ['style.look', 'Style', 'select', TRACK_LOOKS],
    ['style.name', 'Name ({name})', 'text'],
    ['style.text', 'Text — {name} {speed} {alt} {heading} {lat} {lon} {dist} (one line each)', 'textarea'],
    ['style.side', 'Side', 'select', { right: 'Right', left: 'Left', above: 'Above', below: 'Below' }],
    ['style.dx', 'Move ←→', 'range', [-400, 400, 1]], ['style.dy', 'Move ↑↓', 'range', [-300, 300, 1]],
    ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]], ['style.color', 'Accent colour', 'color'], ['style.textColor', 'Text colour', 'color'], ['style.bg', 'Box colour', 'color', null, (L) => ['tag', 'callout', 'flag'].includes(L.style.look)],
    ['style.leader', 'Leader line to the object', 'switch', null, (L) => L.style.look !== 'hud'], ['style.trail', 'Dotted trail behind the object', 'switch'],
    ['style.speedMode', 'Speed shown', 'select', { auto: 'Measured from the movement', set: 'Counts from → to (my numbers)' }],
    ['style.timeScale', 'Real seconds per video second (for the measured speed)', 'range', [0.05, 120, 0.05], (L) => L.style.speedMode !== 'set'],
    ['style.speedFrom', 'Speed at the start', 'number', 1, (L) => L.style.speedMode === 'set'], ['style.speedTo', 'Speed at the end', 'number', 1, (L) => L.style.speedMode === 'set'],
    ['style.speedUnit', 'Speed unit', 'select', SPEED_UNITS],
    ['style.altUnit', 'Altitude unit', 'select', { m: 'metres', ft: 'feet' }],
    ['style.altFrom', 'Altitude at the start (empty = from the model)', 'number', 1], ['style.altTo', 'Altitude at the end', 'number', 1],
  ],
};
export const AN_SET = new Set(Object.keys(AN_KINDS));
export const AN_SCREEN = new Set(['tracklabel']);
export function anPhases(kind) { return kind === 'oilspill' ? ['below', 'above', 'captions'] : ['captions']; }
/** CSS filter for the map while an oil-spill layer with the SAR look is on (teal radar picture). */
export function analysisFilter(sc, t) {
  for (const L of sc.layers || []) {
    if (L.kind !== 'oilspill' || L.hidden || !L.style?.sar) continue;
    const tm = layerTiming(L, t);
    if (!tm.visible) continue;
    const k = clamp(+L.style.sarStrength || 1, 0, 1) * (tm.edit ? 1 : clamp(tm.tau / 0.6, 0, 1)) * tm.alpha;
    if (k < 0.02) continue;
    return `grayscale(${k.toFixed(2)}) sepia(${(0.55 * k).toFixed(2)}) hue-rotate(${Math.round(120 * k)}deg) saturate(${(1 + 0.9 * k).toFixed(2)}) contrast(${(1 + 0.2 * k).toFixed(2)}) brightness(${(1 - 0.12 * k).toFixed(2)})`;
  }
  return '';
}

export function drawAnalysis(ctx, L, tm, o, phase) {
  if (L.kind === 'oilspill') drawOilSpill(ctx, L, tm, o, phase);
  else if (L.kind === 'tracklabel' && phase === 'captions') drawTrackLabel(ctx, L, tm, o);
}

// ---------------------------------------------------------------- geometry
const M_PER_DEG = 111320;
function ringArea(ring) { // m² (equirectangular around the ring's latitude, fine for slicks)
  const lat0 = ring.reduce((a, p) => a + p[1], 0) / ring.length, k = Math.cos(lat0 * D2R);
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * k * M_PER_DEG) * (ring[i][1] * M_PER_DEG) - (ring[i][0] * k * M_PER_DEG) * (ring[j][1] * M_PER_DEG);
  return Math.abs(a / 2);
}
function ringLen(ring) {
  let d = 0;
  for (let i = 1; i < ring.length; i++) d += distM(ring[i - 1], ring[i]);
  return d;
}
function distM(a, b) { const k = Math.cos(((a[1] + b[1]) / 2) * D2R); return Math.hypot((b[0] - a[0]) * k * M_PER_DEG, (b[1] - a[1]) * M_PER_DEG); }
function centroid(ring) { let x = 0, y = 0; const n = ring.length - (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? 1 : 0); for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; } return [x / n, y / n]; }
const offsetLL = ([lng, lat], brg, m) => [lng + (Math.sin(brg * D2R) * m) / (M_PER_DEG * Math.cos(lat * D2R)), lat + (Math.cos(brg * D2R) * m) / M_PER_DEG];
const fmtArea = (m2) => (m2 < 1e6 ? `${Math.round(m2 / 1e4).toLocaleString('en')} ha` : `${(m2 / 1e6).toFixed(m2 < 1e8 ? 1 : 0)} km²`);
const fmtVol = (m3) => (m3 < 1 ? `${Math.round(m3 * 1000)} litres` : m3 < 1000 ? `${m3.toFixed(m3 < 10 ? 1 : 0)} m³` : `${Math.round(m3).toLocaleString('en')} m³`);
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// ---------------------------------------------------------------- oil spill
function spillState(L, tm) {
  const s = L.style;
  const D = Math.max(0.3, +L.duration || 6);
  const u = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / D, 0, 1);
  const drift = tm.edit ? 0 : clamp(tm.tau / D, 0, 1.6);
  return { s, D, u, drift };
}
function spillRing(L, st) {
  const ring = L.geom.coordinates[0];
  const km = +st.s.driftKm || 0;
  if (!km || !st.drift) return ring;
  const dir = +st.s.driftDir || 0;
  return ring.map((p) => offsetLL(p, dir, km * 1000 * st.drift));
}
function drawOilSpill(ctx, L, tm, o, phase) {
  if (L.geom?.type !== 'Polygon') return;
  const { proj, unit } = o;
  const st = spillState(L, tm);
  const s = st.s;
  const ring = spillRing(L, st);
  const pts = ring.map(proj);
  if (pts.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) return;
  const c = centroid(ring), cp = proj(c);
  const srcLL = s.source === 'centre' ? c : ring[0];
  const sp = proj(srcLL);
  const maxR = Math.max(...pts.map((p) => Math.hypot(p[0] - sp[0], p[1] - sp[1]))) * 1.08;
  const seed = hashStr(L.id) + (+s.seed || 0) * 977;
  const path = new Path2D();
  pts.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
  path.closePath();
  const t = o.time ?? 0;
  // spreading front: a wobbly circle from the source
  const spreadClip = () => {
    if (L.anim !== 'spread' || st.u >= 1) return null;
    const R = maxR * easeOut(st.u);
    const cl = new Path2D();
    const r0 = rng(seed + 3);
    const wob = Array.from({ length: 7 }, () => [r0() * 6.28, 0.06 + r0() * 0.1, 2 + Math.floor(r0() * 5)]);
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const k = 1 + wob.reduce((acc, [ph, amp, f]) => acc + amp * Math.sin(a * f + ph + t * 0.6), 0) * 0.5;
      const x = sp[0] + Math.cos(a) * R * k, y = sp[1] + Math.sin(a) * R * k;
      i ? cl.lineTo(x, y) : cl.moveTo(x, y);
    }
    cl.closePath();
    return cl;
  };
  let a = tm.alpha;
  if (L.anim === 'fade' && !tm.edit) a *= ease(tm.tau / Math.min(1.2, st.D));
  if (a <= 0.01) return;

  if (phase === 'below') {
    const clip = spreadClip();
    const trace = L.anim === 'trace' && !tm.edit ? clamp(st.u / 0.55, 0, 1) : 1;
    const fillK = L.anim === 'trace' && !tm.edit ? clamp((st.u - 0.45) / 0.4, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha *= a;
    if (clip) ctx.clip(clip);
    if (s.look !== 'outline' && fillK > 0) {
      ctx.save();
      ctx.clip(path);
      ctx.globalAlpha *= fillK * clamp(+s.fillOpacity || 0.55, 0, 1);
      fillSlick(ctx, s, pts, cp, maxR, seed, t, unit);
      ctx.restore();
    }
    // outline (dashed, marching)
    const len = pts.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0) + Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
    ctx.strokeStyle = s.outline || '#ffffff';
    ctx.lineWidth = 2.6 * unit;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3 * unit;
    if (trace < 1) {
      ctx.setLineDash(s.dash !== false ? [] : []);
      ctx.save();
      const dl = len * trace;
      if (s.dash !== false) {
        // draw the dashes only along the traced part
        ctx.setLineDash([9 * unit, 7 * unit]);
        ctx.beginPath();
        let acc = 0;
        const all = [...pts, pts[0]];
        ctx.moveTo(all[0][0], all[0][1]);
        for (let i = 1; i < all.length; i++) {
          const seg = Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]);
          if (acc + seg >= dl) { const f = (dl - acc) / (seg || 1); ctx.lineTo(all[i - 1][0] + (all[i][0] - all[i - 1][0]) * f, all[i - 1][1] + (all[i][1] - all[i - 1][1]) * f); break; }
          ctx.lineTo(all[i][0], all[i][1]); acc += seg;
        }
        ctx.stroke();
      } else { ctx.setLineDash([dl, len * 2]); ctx.stroke(path); }
      ctx.restore();
    } else {
      if (s.dash !== false) { ctx.setLineDash([9 * unit, 7 * unit]); if (s.march !== false) ctx.lineDashOffset = -t * 22 * unit; }
      ctx.stroke(path);
    }
    ctx.restore();
    return;
  }
  if (phase === 'above') {
    // source ship and drift arrow
    ctx.save();
    ctx.globalAlpha *= a;
    if (s.vessel) {
      const vp = proj(ring[0]);
      const ang = Math.atan2(cp[1] - vp[1], cp[0] - vp[0]) + Math.PI;
      const L0 = 15 * unit;
      ctx.save();
      ctx.translate(vp[0], vp[1]); ctx.rotate(ang);
      if (s.vesselGlow !== false) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 3);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L0 * 2.4);
        g.addColorStop(0, `rgba(255,226,170,${0.75 * pulse})`); g.addColorStop(0.35, `rgba(255,160,80,${0.35 * pulse})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, L0 * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#fff4dc';
      ctx.beginPath(); ctx.ellipse(0, 0, L0, L0 * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (s.drift) {
      const dir = (+s.driftDir || 0) * D2R;
      const Lp = 60 * unit;
      const x0 = cp[0], y0 = cp[1];
      const x1 = x0 + Math.sin(dir) * Lp, y1 = y0 - Math.cos(dir) * Lp;
      const k = tm.edit ? 1 : clamp((st.u - 0.3) / 0.4, 0, 1);
      if (k > 0) {
        ctx.globalAlpha *= k;
        ctx.strokeStyle = s.outline || '#fff'; ctx.fillStyle = s.outline || '#fff';
        ctx.lineWidth = 2.2 * unit; ctx.setLineDash([5 * unit, 4 * unit]); ctx.lineDashOffset = -t * 14 * unit;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        const ah = 10 * unit;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.sin(dir - 0.45) * ah, y1 + Math.cos(dir - 0.45) * ah); ctx.lineTo(x1 - Math.sin(dir + 0.45) * ah, y1 + Math.cos(dir + 0.45) * ah); ctx.closePath(); ctx.fill();
        ctx.font = `700 ${11 * unit}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lx = x1 + Math.sin(dir) * 22 * unit, ly = y1 - Math.cos(dir) * 16 * unit;
        ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        const txt = `DRIFT ${(+s.driftKn || 0).toFixed(1)} kn ${compass(+s.driftDir || 0)}`;
        ctx.strokeText(txt, lx, ly); ctx.fillText(txt, lx, ly);
      }
    }
    ctx.restore();
    return;
  }
  if (phase === 'captions') {
    const lk = tm.edit ? 1 : clamp((st.u - 0.35) / 0.3, 0, 1);
    // label beside the slick (drag it anywhere)
    if (s.label && lk > 0) {
      const fs = 26 * unit * clamp(+s.labelSize || 1, 0.3, 4);
      ctx.save();
      ctx.globalAlpha *= a * lk;
      ctx.font = `700 ${fs}px ${STENCIL}`;
      const txt = String(s.label).toUpperCase().split('').join(String.fromCharCode(8202));
      const w = ctx.measureText(txt).width;
      let mx = -Infinity; for (const p of pts) mx = Math.max(mx, p[0]);
      const x = mx + 18 * unit, y = cp[1] - fs / 2;
      if (o.frame) placeAt(ctx, L, o.frame, x, y, w, fs, { key: 'lbl' });
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6 * unit;
      ctx.fillStyle = s.outline || '#ffffff';
      ctx.fillText(txt, x, y);
      ctx.restore();
    }
    if (s.card && o.frame) {
      const ck = tm.edit ? 1 : clamp((st.u - 0.55) / 0.3, 0, 1);
      if (ck <= 0) return;
      const area = ringArea(L.geom.coordinates[0]) * (L.anim === 'spread' && !tm.edit ? easeOut(st.u) ** 2 : 1);
      const vol = area * (+s.thickness || 1) * 1e-6;
      const rows = [['AREA', fmtArea(area)], ['EST. VOLUME', `${fmtVol(vol)} · ${Math.round(vol * 6.29).toLocaleString('en')} bbl`], ['PERIMETER', `${(ringLen(L.geom.coordinates[0]) / 1000).toFixed(1)} km`]];
      if (s.drift) rows.push(['DRIFT', `${(+s.driftKn || 0).toFixed(1)} kn → ${compass(+s.driftDir || 0)}`]);
      if (s.sensor) rows.push(['SENSOR', String(s.sensor)]);
      if (s.date) rows.push(['DATE', String(s.date)]);
      spillCard(ctx, L, o, String(s.title || 'Oil spill detected'), rows, a * ck);
    }
  }
}
function fillSlick(ctx, s, pts, cp, maxR, seed, t, unit) {
  const r = rng(seed);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const W = maxX - minX, H = maxY - minY;
  if (s.look === 'heat') { ctx.fillStyle = hexA(s.fill === '#1b1410' ? '#ff2d2d' : s.fill, 0.8); ctx.fillRect(minX, minY, W, H); return; }
  if (s.look === 'sheen') {
    const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
    const hues = [280, 220, 170, 110, 50, 20, 320];
    hues.forEach((h, i) => g.addColorStop(i / (hues.length - 1), `hsla(${(h + t * 12) % 360},85%,58%,0.55)`));
    ctx.fillStyle = g; ctx.fillRect(minX, minY, W, H);
  }
  if (s.look === 'thickness') {
    // concentric zones from the source: thick black-brown, emulsion orange, thin silver sheen
    const zones = [['#120c08', 1], ['#5a3518', 0.75], ['#a8692c', 0.5], ['#c9c7c0', 0.28]];
    for (const [col, k] of zones) { ctx.fillStyle = hexA(col, 0.9); ctx.beginPath(); ctx.ellipse(cp[0], cp[1], W * 0.62 * k, H * 0.62 * k, 0, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  // dark streaks and blobs of the slick (wind rows)
  const base = s.look === 'sheen' ? '#20202a' : (s.fill || '#1b1410');
  ctx.fillStyle = hexA(base, s.look === 'sheen' ? 0.35 : 0.55);
  ctx.fillRect(minX, minY, W, H);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const x = minX + r() * W, y = minY + r() * H;
    const rx = (0.08 + r() * 0.22) * Math.max(W, H), ry = rx * (0.12 + r() * 0.25);
    const ang = 0.6 + r() * 0.5;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, hexA(base, 0.75)); g.addColorStop(1, hexA(base, 0));
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1, ry / rx);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
function spillCard(ctx, L, o, title, rows, alpha) {
  const { frame: fr, unit } = o;
  const s = L.style;
  const w = 250 * unit, rh = 19 * unit, h = 40 * unit + rows.length * rh + 8 * unit;
  const m = 26 * unit;
  const pos = s.position || 'bottom-left';
  let x = pos.includes('right') ? fr.x + fr.w - m - w : fr.x + m;
  let y = pos.includes('top') ? fr.y + m + 90 * unit : fr.y + fr.h - m - h - 120 * unit;
  ctx.save();
  ctx.globalAlpha *= alpha;
  placeAt(ctx, L, fr, x, y, w, h);
  rr(ctx, x, y, w, h, 8 * unit); ctx.fillStyle = 'rgba(8,14,22,0.82)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1 * unit; ctx.stroke();
  ctx.fillStyle = '#ff5a36'; ctx.fillRect(x, y + 10 * unit, 3 * unit, 22 * unit);
  ctx.fillStyle = '#fff'; ctx.font = `700 ${14 * unit}px ${UI}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(title, x + 14 * unit, y + 21 * unit, w - 24 * unit);
  rows.forEach(([k, v], i) => {
    const yy = y + 44 * unit + i * rh;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 ${9.5 * unit}px ${MONO}`; ctx.fillText(k, x + 14 * unit, yy);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${11.5 * unit}px ${UI}`; ctx.textAlign = 'right'; ctx.fillText(v, x + w - 14 * unit, yy, w * 0.62); ctx.textAlign = 'left';
  });
  ctx.restore();
}

// ---------------------------------------------------------------- moving objects: where is it at time t?
const linesOf = (g) => (g?.type === 'LineString' ? g.coordinates : g?.type === 'MultiLineString' ? g.coordinates.flat() : null);
function pathAt(coords, u) {
  if (!coords || coords.length < 2) return { ll: coords?.[0] || [0, 0], heading: 0 };
  const seg = []; let total = 0;
  for (let i = 1; i < coords.length; i++) { const d = distM(coords[i - 1], coords[i]); seg.push(d); total += d; }
  let target = clamp(u, 0, 1) * total, i = 0;
  while (i < seg.length - 1 && target > seg[i]) { target -= seg[i]; i++; }
  const f = seg[i] ? target / seg[i] : 0;
  const [x0, y0] = coords[i], [x1, y1] = coords[i + 1];
  const k = Math.cos(((y0 + y1) / 2) * D2R);
  return { ll: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], heading: (Math.atan2((x1 - x0) * k, y1 - y0) / D2R + 360) % 360 };
}
/** Moving things a label can follow (for the "Follows" list). */
export function movingTargets(scene) {
  const out = [{ id: 'route', name: 'The route arrow / vehicle' }];
  for (const L of scene?.layers || []) {
    if (L.kind === 'tracklabel' || !L.geom) continue;
    const line = L.geom.type === 'LineString' || L.geom.type === 'MultiLineString';
    if (L.kind === 'model3d' || L.kind === 'vehicle' || L.kind === 'trajectory' || L.kind === 'bombing' || (line && ['line', 'crowd', 'satellite', 'vessel'].includes(L.kind)) || L.kind === 'point') out.push({ id: L.id, name: L.name || L.kind });
  }
  return out;
}
/** Position, altitude (m) and heading of a target at scene time t, or null when it is not on screen. */
export function poseOf(id, o, t) {
  if (id === 'route' || !id) {
    const st = t != null && o.model?.stateAt ? o.model.stateAt(t) : null;
    if (!st?.point) return null;
    return { ll: st.point, alt: 0, heading: st.heading || 0, visible: true };
  }
  const L = (o.scene?.layers || []).find((x) => x.id === id);
  if (!L || L.hidden || !L.geom) return null;
  const tm = layerTiming(L, t);
  if (!tm.visible) return null;
  const s = L.style || {};
  const D = Math.max(0.1, +L.duration || 1);
  const lin = tm.edit ? 0.5 : clamp(tm.tau / D, 0, 1);
  if (L.geom.type === 'Point') return { ll: L.geom.coordinates, alt: +s.altitude || 0, heading: +s.heading || 0, visible: true };
  const cs = linesOf(L.geom);
  if (!cs) return null;
  if (L.kind === 'model3d') {
    const air = s.motion === 'takeoff' || s.motion === 'landing';
    const u = air ? (s.motion === 'takeoff' ? lin * lin * 0.6 + lin * 0.4 : 1 - (1 - lin) * (1 - lin) * 0.6 - (1 - lin) * 0.4) : tm.edit ? 0.5 : ease(tm.tau / D);
    const p = pathAt(cs, s.motion === 'none' ? 0 : u);
    let alt = +s.altitude || 0;
    if (air) {
      const climb = s.motion === 'takeoff' ? clamp((u - 0.4) / 0.6, 0, 1) : clamp((0.6 - u) / 0.6, 0, 1);
      alt += Math.max(50, +s.climb || (s.sizeMode === 'real' ? 250 : 120)) * climb ** 1.6;
    }
    return { ll: p.ll, alt, heading: p.heading, visible: true };
  }
  if (L.kind === 'line') { const u = L.anim === 'draw' ? ease(tm.u) : 1; const p = pathAt(cs, u); return { ll: p.ll, alt: 0, heading: p.heading, visible: true }; }
  if (L.kind === 'trajectory' || L.kind === 'bombing') { const p = pathAt(cs, lin); return { ll: p.ll, alt: L.kind === 'bombing' ? (+s.alt3d || 40) : 0, heading: p.heading, visible: true }; }
  const p = pathAt(cs, tm.edit ? 0.5 : ease(tm.tau / D));
  return { ll: p.ll, alt: 0, heading: p.heading, visible: true };
}
const metresPerPx = (lat, zoom) => (40075016.686 * Math.cos(lat * D2R)) / (512 * 2 ** zoom);

// ---------------------------------------------------------------- moving label
function fmtSpeed(kmh, unit) {
  if (unit === 'kn') return `${Math.round(kmh / 1.852)} kn`;
  if (unit === 'mph') return `${Math.round(kmh / 1.609)} mph`;
  if (unit === 'ms') return `${Math.round(kmh / 3.6)} m/s`;
  if (unit === 'mach') return `Mach ${(kmh / 1235).toFixed(2)}`;
  return `${Math.round(kmh)} km/h`;
}
function drawTrackLabel(ctx, L, tm, o) {
  const s = L.style, { proj, unit, frame: fr } = o;
  const t = o.time;
  const pose = poseOf(s.target || 'route', o, t);
  if (!pose) return;
  const view = o.view || {};
  const pitch = (view.pitch || 0) * D2R;
  let [x, y] = proj(pose.ll);
  if (!isFinite(x) || !isFinite(y)) return;
  // lift the anchor for things in the air (approximate perspective)
  if (pose.alt && view.zoom != null) y -= (pose.alt / metresPerPx(pose.ll[1], view.zoom)) * Math.sin(pitch) * (o.px || unit);
  // live values
  const D = Math.max(0.1, +L.duration || 1);
  const u = tm.edit ? 0.5 : clamp(tm.tau / D, 0, 1);
  let kmh;
  if (s.speedMode === 'set') kmh = (+s.speedFrom || 0) + ((+s.speedTo || 0) - (+s.speedFrom || 0)) * ease(u);
  else {
    const dt = 0.12;
    const p0 = t != null ? poseOf(s.target || 'route', o, Math.max(0, t - dt)) : null;
    const p1 = t != null ? poseOf(s.target || 'route', o, t + dt) : null;
    const a = p0 || pose, b = p1 || pose;
    const m = Math.hypot(distM(a.ll, b.ll), (b.alt || 0) - (a.alt || 0));
    const span = (p0 ? dt : 0) + (p1 ? dt : 0);
    kmh = span > 0 ? (m / span) * 3.6 / Math.max(0.01, +s.timeScale || 1) : 0;
  }
  let alt = pose.alt || 0;
  if (s.altFrom !== '' && s.altFrom != null && isFinite(+s.altFrom)) alt = +s.altFrom + ((isFinite(+s.altTo) && s.altTo !== '' ? +s.altTo : +s.altFrom) - +s.altFrom) * ease(u);
  const altTxt = s.altUnit === 'ft' ? `${Math.round(alt * 3.281).toLocaleString('en')} ft` : `${Math.round(alt).toLocaleString('en')} m`;
  const tok = {
    name: s.name || L.name || 'TARGET', speed: fmtSpeed(kmh, s.speedUnit), alt: altTxt,
    heading: `${String(Math.round(pose.heading) % 360).padStart(3, '0')}° ${compass(pose.heading)}`,
    lat: `${Math.abs(pose.ll[1]).toFixed(4)}°${pose.ll[1] >= 0 ? 'N' : 'S'}`, lon: `${Math.abs(pose.ll[0]).toFixed(4)}°${pose.ll[0] >= 0 ? 'E' : 'W'}`,
    dist: '',
  };
  if (String(s.text || '').includes('{dist}')) {
    let d = 0, prev = null;
    const steps = 24;
    const t0 = Math.max(L.start || 0, 0);
    for (let i = 0; i <= steps && t != null; i++) { const q = poseOf(s.target || 'route', o, t0 + ((t - t0) * i) / steps); if (q && prev) d += distM(prev.ll, q.ll); if (q) prev = q; }
    tok.dist = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
  }
  const lines = String(s.text || '{name}').split('\n').map((ln) => ln.replace(/\{(\w+)\}/g, (_, k) => tok[k] ?? '')).filter((ln) => ln.trim());
  const k = clamp(+s.size || 1, 0.3, 3);
  let al = tm.alpha;
  let sc = 1;
  if (!tm.edit) {
    const q = clamp(tm.tau / 0.45, 0, 1);
    if (L.anim === 'fade') al *= ease(q);
    if (L.anim === 'pop') { al *= clamp(q * 2, 0, 1); sc = 0.6 + 0.4 * easeOut(q); }
  }
  const col = s.color || '#ffd23f';
  ctx.save();
  ctx.globalAlpha *= al;
  // trail
  if (s.trail && t != null) {
    ctx.fillStyle = hexA(col, 0.8);
    for (let i = 1; i <= 14; i++) {
      const q = poseOf(s.target || 'route', o, t - i * 0.18);
      if (!q) break;
      const [qx, qy0] = proj(q.ll);
      let qy = qy0;
      if (q.alt && view.zoom != null) qy -= (q.alt / metresPerPx(q.ll[1], view.zoom)) * Math.sin(pitch) * (o.px || unit);
      ctx.globalAlpha = al * (1 - i / 15);
      ctx.beginPath(); ctx.arc(qx, qy, 2.2 * unit * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = al;
  }
  const fs = 13 * unit * k, lh = fs * 1.3;
  ctx.font = `700 ${fs}px ${UI}`;
  const widths = lines.map((ln, i) => { ctx.font = `${i ? 600 : 800} ${i ? fs * 0.86 : fs}px ${i ? MONO : UI}`; return ctx.measureText(ln).width; });
  const pad = 9 * unit * k;
  const bw = Math.max(40 * unit, ...widths) + pad * 2, bh = lines.length * lh + pad * 1.2;
  const gap = 34 * unit * k;
  const side = s.side || 'right';
  let bx = side === 'left' ? x - gap - bw : side === 'right' ? x + gap : x - bw / 2;
  let by = side === 'above' ? y - gap - bh : side === 'below' ? y + gap : y - bh - 14 * unit * k;
  bx += (+s.dx || 0) * unit; by += (+s.dy || 0) * unit;
  if (fr) { bx = clamp(bx, fr.x + 6 * unit, fr.x + fr.w - bw - 6 * unit); by = clamp(by, fr.y + 6 * unit, fr.y + fr.h - bh - 6 * unit); }
  const look = s.look || 'tag';
  // anchor marker
  if (look === 'hud') {
    const R = 22 * unit * k, l = R * 0.45;
    ctx.strokeStyle = col; ctx.lineWidth = 2 * unit;
    const rot = (o.time || 0) * 0.8;
    for (let q = 0; q < 4; q++) {
      const ang = rot + (q * Math.PI) / 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(-R, -R + l); ctx.lineTo(-R, -R); ctx.lineTo(-R + l, -R); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x, y, 2.5 * unit, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    bx = x + R + 12 * unit + (+s.dx || 0) * unit; by = y - R + (+s.dy || 0) * unit;
  } else {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.2 * unit * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 1.5 * unit;
    const pr = (6 + ((o.time || 0) * 1.4 % 1) * 10) * unit * k;
    ctx.globalAlpha = al * (1 - ((o.time || 0) * 1.4 % 1));
    ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = al;
  }
  // leader line
  const ax = clamp(x, bx, bx + bw), ay = clamp(y, by, by + bh);
  if (s.leader !== false && look !== 'hud' && look !== 'minimal') {
    ctx.strokeStyle = col; ctx.lineWidth = 1.6 * unit;
    ctx.beginPath(); ctx.moveTo(x, y);
    if (look === 'flag') ctx.lineTo(bx, by + bh);
    else ctx.lineTo(ax, ay);
    ctx.stroke();
  }
  ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(sc, sc); ctx.translate(-(bx + bw / 2), -(by + bh / 2));
  if (look === 'tag' || look === 'callout' || look === 'flag') {
    rr(ctx, bx, by, bw, bh, (look === 'tag' ? 6 : 3) * unit);
    ctx.fillStyle = hexA(s.bg || '#0b1220', look === 'flag' ? 0.92 : 0.8); ctx.fill();
    if (look === 'callout') { ctx.fillStyle = col; ctx.fillRect(bx, by, 3 * unit, bh); }
    else { ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1.2 * unit; ctx.stroke(); }
  }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  lines.forEach((ln, i) => {
    ctx.font = `${i ? 600 : 800} ${i ? fs * 0.86 : fs}px ${i ? MONO : UI}`;
    ctx.fillStyle = i === 0 && look !== 'minimal' ? col : (s.textColor || '#fff');
    if (look === 'minimal' || look === 'hud') { ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(ln, bx + pad, by + pad * 0.6 + lh * (i + 0.5)); }
    ctx.fillText(ln, bx + pad, by + pad * 0.6 + lh * (i + 0.5));
  });
  ctx.restore();
}
