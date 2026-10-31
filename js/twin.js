// Digital twin: the real city (OpenStreetMap buildings and roads from the map's vector tiles) rebuilt as a
// glowing 3D model — white "clay" model, cyan hologram or blueprint — rising in a ripple or a sweep from a
// point, with light trails flowing along the roads, a scan ring, and floating live-data sensor cards.
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

export const TWIN_LOOKS = {
  clay: { name: 'White model (clay)', bld: '#e9edf2', top: '#ffffff', front: '#7fe3ff', edge: '#9fdcff', road: '#7fe3ff', opacity: 0.96 },
  hologram: { name: 'Hologram (cyan glass)', bld: '#1fb6ff', top: '#9ff0ff', front: '#ffffff', edge: '#4fe0ff', road: '#38e1ff', opacity: 0.55 },
  blueprint: { name: 'Blueprint (outlines)', bld: '#2a6fdb', top: '#6fa8ff', front: '#ffffff', edge: '#8ec5ff', road: '#5fb0ff', opacity: 0.28 },
  gold: { name: 'Night gold', bld: '#d9a441', top: '#ffd77a', front: '#ffffff', edge: '#ffcf66', road: '#ffb547', opacity: 0.85 },
  heat: { name: 'Height colours (data)', bld: 'height', top: '#ffffff', front: '#ffffff', edge: '#ffffff', road: '#ffffff', opacity: 0.92 },
};
const POS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', ...CUSTOM_POS };
export const TWIN_KINDS = {
  twin: { name: 'Digital twin city', icon: '🏙', geom: 'point', desc: 'The real city rebuilt as a glowing 3D model that rises from a point, with light trails on the roads' },
  sensor: { name: 'Live data card', icon: '📡', geom: 'point', desc: 'A sensor beacon with a floating card of live, ticking values (IoT, traffic, air quality…)' },
};
export const TWIN_ANIMS = {
  twin: { ripple: 'Rise in a ripple from the point', sweep: 'Rise in a sweep across', none: 'Already there' },
  sensor: { pop: 'Pop up', none: 'Already there' },
};
export const TWIN_DEFAULTS = {
  twin: { anim: 'ripple', duration: 5, style: { look: 'clay', radius: 2.5, buildings: true, roads: true, traffic: true, trafficSpeed: 1, pulses: 4, footprints: true, scanRing: true, sweepDir: 90, hud: true, title: 'DIGITAL TWIN', position: 'top-left', minHeight: 4, exaggerate: 1 } },
  sensor: { anim: 'pop', duration: 0.8, style: { title: 'Sensor 01', values: 'Temperature: 31.4 °C\nHumidity: 62 %\nAir quality: 42 AQI', icon: '📡', color: '#38e1ff', height: 90, live: true, beacon: true, size: 1 } },
};
export const TWIN_FORMS = {
  twin: [['style.look', 'Look', 'select', Object.fromEntries(Object.entries(TWIN_LOOKS).map(([k, v]) => [k, v.name]))], ['style.radius', 'Radius (km)', 'range', [0.3, 8, 0.1]], ['style.sweepDir', 'Sweep from (°)', 'range', [0, 359, 1], (L) => L.anim === 'sweep'], ['style.buildings', '3D buildings', 'switch'], ['style.exaggerate', 'Building height ×', 'range', [0.5, 4, 0.05], (L) => L.style.buildings !== false], ['style.footprints', 'Glowing footprints', 'switch'], ['style.roads', 'Roads', 'switch'], ['style.traffic', 'Light trails on the roads', 'switch', null, (L) => L.style.roads !== false], ['style.trafficSpeed', 'Light trail speed', 'range', [0.1, 4, 0.05], (L) => L.style.roads !== false && L.style.traffic !== false], ['style.pulses', 'Light trails per road', 'range', [1, 10, 1], (L) => L.style.roads !== false && L.style.traffic !== false], ['style.scanRing', 'Scan ring', 'switch'], ['style.hud', 'Info panel', 'switch'], ['style.title', 'Panel title', 'text', null, (L) => L.style.hud !== false], ['style.position', 'Panel position', 'select', POS, (L) => L.style.hud !== false]],
  sensor: [['style.title', 'Title', 'text'], ['style.values', 'Values (“Label: number unit”, one per line)', 'textarea'], ['style.icon', 'Icon (emoji)', 'text'], ['style.color', 'Colour', 'color'], ['style.height', 'Card height above the point (px)', 'range', [20, 300, 1]], ['style.live', 'Values tick (live)', 'switch'], ['style.beacon', 'Pulsing beacon', 'switch'], ['style.size', 'Size', 'range', [0.5, 2.5, 0.05]]],
};
export const TWIN_SET = new Set(Object.keys(TWIN_KINDS));
export const twinPhases = (kind) => (kind === 'twin' ? ['below', 'captions'] : ['above']);

/** 0…1 front of the reveal at time t, and the distance (m) it has reached. */
function front(L, tm) {
  if (tm.edit || L.anim === 'none') return 1;
  return easeOut(tm.tau / Math.max(0.3, +L.duration || 5));
}

// ---------------------------------------------------------------- 2D overlay: scan ring and info panel
function dest([lng, lat], brg, d) {
  const R = 6371008.8, φ1 = lat * D2R, λ1 = lng * D2R, θ = brg * D2R, δ = d / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 / D2R, φ2 / D2R];
}
export function drawTwin(ctx, L, tm, o, phase) {
  const s = L.style;
  const { proj, unit, frame } = o;
  const look = TWIN_LOOKS[s.look] || TWIN_LOOKS.clay;
  const f = front(L, tm);
  const Rm = Math.max(300, (+s.radius || 2.5) * 1000);
  const c = L.geom.coordinates;
  if (phase === 'below' && s.scanRing !== false && f < 0.999) {
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    ctx.globalCompositeOperation = 'lighter';
    if (L.anim === 'sweep') {
      const dir = (+s.sweepDir || 90) * D2R;
      const off = (f * 2 - 1) * Rm;
      const mid = dest(c, (dir * 180) / Math.PI, -off);
      const a = proj(dest(mid, ((dir * 180) / Math.PI) + 90, Rm)), b = proj(dest(mid, ((dir * 180) / Math.PI) - 90, Rm));
      ctx.strokeStyle = hexA(look.front, 0.9); ctx.lineWidth = 3 * unit; ctx.shadowColor = look.edge; ctx.shadowBlur = 18 * unit;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else {
      const ring = [];
      for (let i = 0; i <= 96; i++) ring.push(proj(dest(c, (i / 96) * 360, Math.max(1, f * Rm))));
      ctx.shadowColor = look.edge; ctx.shadowBlur = 20 * unit;
      ctx.strokeStyle = hexA(look.front, 0.85); ctx.lineWidth = 2.5 * unit;
      ctx.beginPath(); ring.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.strokeStyle = hexA(look.edge, 0.25); ctx.lineWidth = 14 * unit; ctx.stroke();
    }
    ctx.restore();
  }
  if (phase === 'captions' && frame && s.hud !== false) {
    const W = 270 * unit, H = 104 * unit, m = 26 * unit, pos = s.position || 'top-left';
    const x = pos.includes('right') ? frame.x + frame.w - m - W : frame.x + m, y = pos.includes('bottom') ? frame.y + frame.h - m - H : frame.y + m;
    ctx.save();
    ctx.globalAlpha *= tm.alpha * (tm.edit ? 1 : clamp(tm.tau / 0.6, 0, 1));
    placeAt(ctx, L, frame, x, y, W, H);
    ctx.fillStyle = 'rgba(6,14,24,0.72)'; rr(ctx, x, y, W, H, 10 * unit); ctx.fill();
    ctx.strokeStyle = hexA(look.edge, 0.5); ctx.lineWidth = 1 * unit; rr(ctx, x + 0.5, y + 0.5, W - 1, H - 1, 10 * unit); ctx.stroke();
    ctx.fillStyle = look.edge; ctx.fillRect(x + 14 * unit, y + 16 * unit, 18 * unit, 3 * unit);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = `800 ${13 * unit}px ${UI}`; ctx.fillText(String(s.title || 'DIGITAL TWIN').toUpperCase(), x + 14 * unit, y + 34 * unit, W - 28 * unit);
    const nb = Math.round((L._twin?.buildings || 0) * Math.min(1, f * 1.05));
    const rows = [['BUILDINGS', nb.toLocaleString()], ['ROADS', `${((L._twin?.roadKm || 0) * Math.min(1, f * 1.05)).toFixed(1)} km`], ['MODEL', `${Math.round(f * 100)} %`]];
    rows.forEach(([k, v], i) => {
      const yy = y + 58 * unit + i * 15 * unit;
      ctx.font = `600 ${9.5 * unit}px ${UI}`; ctx.fillStyle = 'rgba(200,225,240,0.7)'; ctx.fillText(k, x + 14 * unit, yy);
      ctx.font = `700 ${10.5 * unit}px ${MONO}`; ctx.fillStyle = '#e8f7ff'; ctx.textAlign = 'right'; ctx.fillText(v, x + W - 14 * unit, yy); ctx.textAlign = 'left';
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- live data cards
export function drawSensor(ctx, L, tm, o) {
  const s = L.style;
  const { proj, unit } = o;
  const p = proj(L.geom.coordinates);
  const k = +s.size || 1;
  const t = tm.edit ? 2 : tm.tau;
  const col = s.color || '#38e1ff';
  const pop = tm.edit || L.anim === 'none' ? 1 : easeOut(tm.tau / Math.max(0.2, +L.duration || 0.8));
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  // beacon
  if (s.beacon !== false) for (let i = 0; i < 2; i++) {
    const ph = ((t * 0.8 + i * 0.5) % 1);
    ctx.strokeStyle = hexA(col, 0.8 * (1 - ph)); ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.ellipse(p[0], p[1], (6 + ph * 28) * unit * k, (3 + ph * 14) * unit * k, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12 * unit;
  ctx.beginPath(); ctx.arc(p[0], p[1], 4.5 * unit * k, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  // leader line
  const hh = (+s.height || 90) * unit * k * pop;
  const top = p[1] - hh;
  const g = ctx.createLinearGradient(0, p[1], 0, top); g.addColorStop(0, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0.25));
  ctx.strokeStyle = g; ctx.lineWidth = 1.6 * unit; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], top); ctx.stroke();
  if (pop < 0.6) { ctx.restore(); return; }
  // card
  const lines = String(s.values || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const fs = 11 * unit * k;
  ctx.font = `600 ${fs}px ${UI}`;
  const vals = lines.map((ln, i) => {
    const m = ln.match(/^(.*?):\s*(-?[\d.,]+)\s*(.*)$/);
    if (!m) return { label: ln, val: '', unit: '' };
    const base = +m[2].replace(/,/g, '');
    const dec = (m[2].split('.')[1] || '').length;
    const v = s.live !== false && !tm.edit ? base * (1 + 0.018 * Math.sin(t * (0.9 + i * 0.37) + i * 2) + 0.008 * Math.sin(t * 3.1 + i)) : base;
    return { label: m[1], val: v.toFixed(dec), unit: m[3] };
  });
  const W = Math.max(150 * unit * k, ...vals.map((v) => ctx.measureText(`${v.label}  ${v.val} ${v.unit}`).width + 34 * unit * k));
  const H = 34 * unit * k + vals.length * 17 * unit * k;
  const x = p[0] - W / 2, y = top - H;
  const a = clamp((pop - 0.6) / 0.4, 0, 1);
  ctx.globalAlpha *= a;
  ctx.fillStyle = 'rgba(6,14,24,0.82)'; rr(ctx, x, y + (1 - a) * 10 * unit, W, H, 8 * unit * k); ctx.fill();
  ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = 1.2 * unit; ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(x, y + 10 * unit * k, 3 * unit * k, H - 20 * unit * k);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `${13 * unit * k}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.fillText(s.icon || '📡', x + 10 * unit * k, y + 16 * unit * k);
  ctx.font = `800 ${11.5 * unit * k}px ${UI}`; ctx.fillStyle = '#fff'; ctx.fillText(String(s.title || 'Sensor'), x + 30 * unit * k, y + 16 * unit * k, W - 60 * unit * k);
  if (s.live !== false) { const on = Math.floor(t * 2) % 2 === 0; ctx.fillStyle = on ? '#2ecc71' : 'rgba(46,204,113,0.35)'; ctx.beginPath(); ctx.arc(x + W - 12 * unit * k, y + 16 * unit * k, 3.5 * unit * k, 0, Math.PI * 2); ctx.fill(); }
  vals.forEach((v, i) => {
    const yy = y + 36 * unit * k + i * 17 * unit * k;
    ctx.font = `500 ${10 * unit * k}px ${UI}`; ctx.fillStyle = 'rgba(200,225,240,0.75)'; ctx.textAlign = 'left'; ctx.fillText(v.label, x + 12 * unit * k, yy);
    ctx.font = `700 ${11 * unit * k}px ${MONO}`; ctx.fillStyle = '#e8f7ff'; ctx.textAlign = 'right'; ctx.fillText(`${v.val}${v.unit ? ` ${v.unit}` : ''}`, x + W - 12 * unit * k, yy);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- the 3D city (map layers)
const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'street', 'residential']);
/** Rebuilds the real buildings and roads around each twin layer as glowing map layers. */
export class TwinCity {
  constructor(map) {
    this.map = map; this.layers = []; this.key = ''; this.dirty = true; this.last = new Map(); this.lastBuild = 0; this.ids = [];
    map.on('sourcedata', (e) => { if (e.sourceId === 'openmaptiles' && e.tile) this.dirty = true; });
    map.on('idle', () => { if (this.dirty && this.layers.length) this.rebuild(); });
  }
  attach() { this.key = ''; this.dirty = true; if (this.scene) this.sync(this.scene); }
  sync(scene) {
    this.scene = scene;
    const m = this.map;
    if (!m.getStyle?.()) return;
    const want = (scene.layers || []).filter((L) => L.kind === 'twin' && !L.hidden && L.geom);
    const key = JSON.stringify(want.map((L) => [L.id, L.geom.coordinates, L.style.look, L.style.radius, L.style.buildings, L.style.roads, L.style.footprints, L.style.traffic, L.style.exaggerate]));
    if (key === this.key) return;
    this.key = key;
    for (const id of this.ids) if (m.getLayer(id)) m.removeLayer(id);
    this.ids = [];
    this.layers = want;
    this.last.clear();
    // the theme's own 3D buildings would double up
    if (m.getLayer('ma-buildings')) m.setLayoutProperty('ma-buildings', 'visibility', want.length ? 'none' : 'visible');
    if (!want.length) return;
    for (const [id, opt] of [['ma-twin-b', {}], ['ma-twin-r', { lineMetrics: true }]]) if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, ...opt });
    const before = m.getLayer('ma-models') ? 'ma-models' : undefined;
    const add = (def) => { m.addLayer(def, before); this.ids.push(def.id); };
    for (const L of want) {
      const s = L.style, look = TWIN_LOOKS[s.look] || TWIN_LOOKS.clay;
      const f = ['==', ['get', 'lid'], L.id];
      if (s.roads !== false) {
        add({ id: `ma-twr-base-${L.id}`, type: 'line', source: 'ma-twin-r', filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': hexA(look.road, 0.35), 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, ['*', ['get', 'w'], 0.4], 17, ['*', ['get', 'w'], 3]] } });
        if (s.traffic !== false) add({ id: `ma-twr-flow-${L.id}`, type: 'line', source: 'ma-twin-r', filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, ['*', ['get', 'w'], 0.9], 17, ['*', ['get', 'w'], 4.5]], 'line-blur': 1, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)'] } });
      }
      if (s.footprints !== false) add({ id: `ma-twb-foot-${L.id}`, type: 'line', source: 'ma-twin-b', filter: f, paint: { 'line-color': look.edge, 'line-width': 1.2, 'line-blur': 0.6, 'line-opacity': 0.9 } });
      if (s.buildings !== false) {
        const color = look.bld === 'height'
          ? ['interpolate', ['linear'], ['get', 'H'], 0, '#2c7bb6', 20, '#abd9e9', 45, '#ffffbf', 80, '#fdae61', 150, '#d7191c']
          : ['interpolate', ['linear'], ['get', 'H'], 0, look.bld, 120, look.top];
        add({ id: `ma-twb-3d-${L.id}`, type: 'fill-extrusion', source: 'ma-twin-b', filter: f, paint: { 'fill-extrusion-color': color, 'fill-extrusion-height': ['get', 'H'], 'fill-extrusion-base': ['get', 'B'], 'fill-extrusion-opacity': look.opacity, 'fill-extrusion-vertical-gradient': true } });
      }
    }
    this.rebuild();
  }
  rebuild() {
    const m = this.map;
    this.dirty = false;
    this.lastBuild = performance.now();
    if (!m.getSource('openmaptiles') || !m.getSource('ma-twin-b')) return;
    let blds = [], roads = [];
    try { blds = m.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }); } catch { blds = []; }
    try { roads = m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }); } catch { roads = []; }
    const bOut = [], rOut = [];
    for (const L of this.layers) {
      const s = L.style;
      const c = L.geom.coordinates;
      const kx = 111320 * Math.cos(c[1] * D2R), ky = 110540;
      const Rm = Math.max(300, (+s.radius || 2.5) * 1000);
      const dir = (+s.sweepDir || 90) * D2R, ux = Math.sin(dir), uy = Math.cos(dir);
      const ex = Math.max(0.3, +s.exaggerate || 1);
      const dOf = (x, y) => {
        const dx = (x - c[0]) * kx, dy = (y - c[1]) * ky;
        const r = Math.hypot(dx, dy);
        return { r, s: L.anim === 'sweep' ? (dx * ux + dy * uy + Rm) / (2 * Rm) : r / Rm };
      };
      let nb = 0, rkm = 0;
      const seen = new Set();
      if (s.buildings !== false || s.footprints !== false) for (const f of blds) {
        const g = f.geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const poly of polys) {
          const ring = poly[0];
          if (!ring || ring.length < 4) continue;
          let x = 0, y = 0;
          for (let i = 0; i < ring.length - 1; i++) { x += ring[i][0]; y += ring[i][1]; }
          x /= ring.length - 1; y /= ring.length - 1;
          const d = dOf(x, y);
          if (d.r > Rm) continue;
          const p = f.properties || {};
          const H = Math.max(+s.minHeight || 4, +p.render_height || 8) * ex;
          bOut.push({ type: 'Feature', properties: { lid: L.id, d: d.s, H, B: (+p.render_min_height || 0) * ex, h0: H }, geometry: { type: 'Polygon', coordinates: poly } });
          const key = f.id ?? `${x.toFixed(5)},${y.toFixed(5)}`;
          if (!seen.has(key)) { seen.add(key); nb++; }
        }
      }
      if (s.roads !== false) for (const f of roads) {
        const cls = f.properties?.class;
        if (cls && !ROAD_CLASSES.has(cls)) continue;
        const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
        const w = { motorway: 3, trunk: 2.6, primary: 2.2, secondary: 1.8, tertiary: 1.4 }[cls] || 1;
        for (const ln of lines) {
          if (ln.length < 2) continue;
          const mid = ln[Math.floor(ln.length / 2)];
          const d = dOf(mid[0], mid[1]);
          if (d.r > Rm) continue;
          let len = 0;
          for (let i = 1; i < ln.length; i++) len += Math.hypot((ln[i][0] - ln[i - 1][0]) * kx, (ln[i][1] - ln[i - 1][1]) * ky);
          rkm += len / 1000;
          rOut.push({ type: 'Feature', properties: { lid: L.id, d: d.s, w }, geometry: { type: 'LineString', coordinates: ln } });
        }
      }
      L._twin = { buildings: nb, roadKm: rkm };
    }
    m.getSource('ma-twin-b').setData({ type: 'FeatureCollection', features: bOut });
    m.getSource('ma-twin-r').setData({ type: 'FeatureCollection', features: rOut });
    this.last.clear();
    this.onChange?.();
  }
  /** Per frame: reveal front and the moving light trails. */
  update(scene, t, layerTiming) {
    const m = this.map;
    if (this.dirty && this.layers.length && (t == null || performance.now() - this.lastBuild > 500)) this.rebuild();
    for (const L0 of this.layers) {
      const L = (scene.layers || []).find((x) => x.id === L0.id) || L0;
      const s = L.style, look = TWIN_LOOKS[s.look] || TWIN_LOOKS.clay;
      const tm = layerTiming(L, t);
      const vis = tm.visible;
      const f = vis ? front(L, tm) : 0;
      const fq = Math.round(f * 300) / 300;
      const band = 0.06;
      const ids = { b3d: `ma-twb-3d-${L.id}`, foot: `ma-twb-foot-${L.id}`, rb: `ma-twr-base-${L.id}`, flow: `ma-twr-flow-${L.id}` };
      const key = `${vis}|${fq}`;
      if (this.last.get(L.id) !== key) {
        this.last.set(L.id, key);
        const shown = ['all', ['==', ['get', 'lid'], L.id], ['<=', ['get', 'd'], fq + 0.0001]];
        for (const id of Object.values(ids)) if (m.getLayer(id)) { m.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none'); m.setFilter(id, shown); }
        if (m.getLayer(ids.b3d)) {
          // buildings rise just behind the front, and glow at the front
          const grow = fq >= 1 ? 1 : ['interpolate', ['linear'], ['get', 'd'], Math.max(0, fq - band), 1, fq + 0.0001, 0.02];
          m.setPaintProperty(ids.b3d, 'fill-extrusion-height', ['*', ['get', 'H'], grow]);
          m.setPaintProperty(ids.b3d, 'fill-extrusion-base', ['*', ['get', 'B'], grow]);
          if (look.bld !== 'height') m.setPaintProperty(ids.b3d, 'fill-extrusion-color', fq >= 1 ? ['interpolate', ['linear'], ['get', 'H'], 0, look.bld, 120, look.top] : ['interpolate', ['linear'], ['get', 'd'], Math.max(0, fq - band * 1.5), look.bld, fq + 0.0001, look.front]);
        }
      }
      // light trails: a few comets per road, moving with time
      if (m.getLayer(ids.flow) && vis) {
        const n = clamp(Math.round(+s.pulses || 4), 1, 10);
        const ph = ((t ?? 0) * 0.12 * (+s.trafficSpeed || 1)) % 1;
        const stops = [];
        const col = look.road;
        const heads = Array.from({ length: n }, (_, i) => (ph + i / n) % 1).sort((a, b) => a - b);
        const tail = 0.5 / n;
        const pts = [[0, 0]];
        for (const h of heads) { pts.push([Math.max(0, h - tail), 0], [h, 1], [Math.min(1, h + 0.004), 0]); }
        pts.push([1, 0]);
        pts.sort((a, b) => a[0] - b[0]);
        let lastX = -1;
        for (const [x, a] of pts) { const xx = Math.max(x, lastX + 1e-4); if (xx > 1) continue; stops.push(xx, hexA(col, a)); lastX = xx; }
        if (stops.length >= 4) {
          const expr = ['interpolate', ['linear'], ['line-progress'], ...stops];
          const k = Math.round(ph * 600);
          if (this.last.get(`${L.id}f`) !== k) { this.last.set(`${L.id}f`, k); try { m.setPaintProperty(ids.flow, 'line-gradient', expr); } catch { /* ignore */ } }
        }
      }
    }
  }
}
