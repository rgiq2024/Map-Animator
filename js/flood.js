// Rising-water floods on real terrain. For each flood layer with the "terrain" animation we download
// elevation tiles (AWS Terrain Tiles, Terrarium encoding) for its area, and every frame paint the pixels
// whose ground is below the current water level into a canvas that the map drapes over the terrain.
import { toMerc, fromMerc } from './geo.js';
import { polygonsOf, layerBounds, layerTiming } from './layers.js';

const DEM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const MAX_PX = 1400;
const gridCache = new Map();

function hexRGB(hex) {
  const h = (hex || '#2f8fe0').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function loadGrid(L) {
  const b = layerBounds(L);
  const key = `${L.id}|${JSON.stringify(b)}|${JSON.stringify(L.geom.coordinates).length}`;
  if (gridCache.has(key)) return gridCache.get(key);
  const p = (async () => {
    const [mx0, my1] = toMerc(b[0]);
    const [mx1, my0] = toMerc(b[1]);
    let z = 14, tx0, tx1, ty0, ty1;
    for (; z >= 4; z--) {
      const n = 2 ** z;
      tx0 = Math.floor(mx0 * n); tx1 = Math.floor(mx1 * n);
      ty0 = Math.floor(my0 * n); ty1 = Math.floor(my1 * n);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 30) break;
    }
    const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1;
    const scale = Math.min(1, MAX_PX / (Math.max(nx, ny) * 256));
    const W = Math.round(nx * 256 * scale), H = Math.round(ny * 256 * scale);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgb(255,255,255)'; // = very high ground where tiles are missing
    ctx.fillRect(0, 0, W, H);
    const jobs = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
      jobs.push(fetch(DEM(z, x, y)).then((r) => (r.ok ? r.blob() : null)).then((bl) => (bl ? createImageBitmap(bl) : null))
        .then((img) => { if (img) ctx.drawImage(img, (x - tx0) * 256 * scale, (y - ty0) * 256 * scale, 256 * scale, 256 * scale); })
        .catch(() => {}));
    }
    await Promise.all(jobs);
    const data = ctx.getImageData(0, 0, W, H).data;
    const elev = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) elev[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768;
    // tile-aligned bounds
    const n = 2 ** z;
    const gm = { x0: tx0 / n, x1: (tx1 + 1) / n, y0: ty0 / n, y1: (ty1 + 1) / n };
    // polygon mask
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    const mctx = mc.getContext('2d', { willReadFrequently: true });
    mctx.beginPath();
    for (const poly of polygonsOf(L.geom)) for (const ring of poly) {
      ring.forEach((ll, i) => {
        const [mx, my] = toMerc(ll);
        const x = ((mx - gm.x0) / (gm.x1 - gm.x0)) * W, y = ((my - gm.y0) / (gm.y1 - gm.y0)) * H;
        if (i) mctx.lineTo(x, y); else mctx.moveTo(x, y);
      });
      mctx.closePath();
    }
    mctx.fillStyle = '#000';
    mctx.fill('evenodd');
    const md = mctx.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    const inside = [];
    for (let i = 0; i < W * H; i++) { if (md[i * 4 + 3] > 127 && elev[i] > -500 && elev[i] < 9000) { mask[i] = 1; inside.push(elev[i]); } }
    inside.sort((a, b) => a - b);
    const pct = (q) => (inside.length ? inside[Math.min(inside.length - 1, Math.floor(q * inside.length))] : 0);
    const nw = fromMerc([gm.x0, gm.y0]), se = fromMerc([gm.x1, gm.y1]);
    return { W, H, elev, mask, coords: [[nw[0], nw[1]], [se[0], nw[1]], [se[0], se[1]], [nw[0], se[1]]], stats: { min: pct(0), p10: pct(0.1), p40: pct(0.4), p60: pct(0.6), max: pct(1) } };
  })();
  gridCache.set(key, p);
  p.catch(() => gridCache.delete(key));
  return p;
}

export class TerrainFloods {
  constructor(map, onReady) {
    this.map = map;
    this.items = new Map(); // layer id → { grid, canvas, ctx, img, srcId }
    this.onReady = onReady;
    this.scene = null;
  }

  /** Make sure every terrain flood of the scene has its grid, source and layer. */
  async sync(scene) {
    this.scene = scene;
    const want = (scene.layers || []).filter((L) => L.kind === 'flood' && L.anim === 'terrain' && L.geom && !L.hidden);
    const ids = new Set(want.map((L) => L.id));
    for (const [id, it] of this.items) if (!ids.has(id) || it.geomKey !== JSON.stringify(want.find((L) => L.id === id)?.geom.coordinates).length) this.remove(id);
    await Promise.all(want.map(async (L) => {
      if (!this.items.has(L.id)) {
        const it = { geomKey: JSON.stringify(L.geom.coordinates).length, srcId: `ma-flood-${L.id}`, loading: true };
        this.items.set(L.id, it);
        try {
          it.grid = await loadGrid(L);
        } catch (e) { console.warn('DEM load failed', e); this.items.delete(L.id); return; }
        if (L.style.levelFrom == null || L.style.levelTo == null) {
          L.style.levelFrom = Math.round(it.grid.stats.min * 10) / 10;
          L.style.levelTo = Math.round(Math.max(it.grid.stats.p40, it.grid.stats.min + 2) * 10) / 10;
          this.onReady?.(L);
        }
        it.canvas = document.createElement('canvas');
        it.canvas.width = it.grid.W; it.canvas.height = it.grid.H;
        it.ctx = it.canvas.getContext('2d');
        it.img = it.ctx.createImageData(it.grid.W, it.grid.H);
        it.loading = false;
      }
    }));
    this.attach();
  }

  /** (Re)add sources/layers — needed after every style change. */
  attach() {
    const map = this.map;
    if (!map.isStyleLoaded || !map.getStyle()) return;
    const firstSymbol = (map.getStyle().layers || []).find((l) => l.type === 'symbol')?.id;
    for (const it of this.items.values()) {
      if (!it.grid || !it.canvas) continue;
      try {
        if (!map.getSource(it.srcId)) map.addSource(it.srcId, { type: 'canvas', canvas: it.canvas, coordinates: it.grid.coords, animate: false });
        if (!map.getLayer(it.srcId)) map.addLayer({ id: it.srcId, type: 'raster', source: it.srcId, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);
      } catch (e) { /* style not ready yet; retried on next style.load */ }
    }
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    try { if (this.map.getLayer(it.srcId)) this.map.removeLayer(it.srcId); if (this.map.getSource(it.srcId)) this.map.removeSource(it.srcId); } catch { /* ignore */ }
    this.items.delete(id);
  }
  clear() { for (const id of [...this.items.keys()]) this.remove(id); }
  get loading() { return [...this.items.values()].some((it) => it.loading); }

  /** Draw the water for time t (null = editing → final level). */
  update(scene, t) {
    for (const L of scene.layers || []) {
      const it = this.items.get(L.id);
      if (!it || !it.grid || !it.canvas) continue;
      const tm = layerTiming(L, t);
      const s = L.style;
      const from = +s.levelFrom || 0, to = s.levelTo != null ? +s.levelTo : from + 3;
      const level = tm.visible ? from + (to - from) * ease(tm.u) : -1e9;
      const key = `${level.toFixed(3)}|${s.color}|${s.opacity}|${tm.alpha.toFixed(3)}`;
      if (key === it.lastKey) continue;
      it.lastKey = key;
      const { W, H, elev, mask } = it.grid;
      const d = it.img.data;
      const [r1, g1, b1] = hexRGB(s.color);
      const range = Math.max(0.5, to - from);
      const op = clamp(+s.opacity || 0.65, 0, 1) * tm.alpha;
      for (let i = 0, j = 0; i < W * H; i++, j += 4) {
        const depth = level - elev[i];
        if (mask[i] && depth > 0) {
          const k = clamp(depth / range, 0, 1);
          // shallow water is lighter; a thin bright rim at the water's edge
          const rim = depth < range * 0.04 ? 0.55 : 0;
          d[j] = r1 + (255 - r1) * (0.35 * (1 - k) + rim * 0.5);
          d[j + 1] = g1 + (255 - g1) * (0.35 * (1 - k) + rim * 0.5);
          d[j + 2] = b1 + (255 - b1) * (0.25 * (1 - k) + rim * 0.4);
          d[j + 3] = 255 * op * (0.55 + 0.45 * k);
        } else d[j + 3] = 0;
      }
      it.ctx.putImageData(it.img, 0, 0);
      const src = this.map.getSource(it.srcId);
      if (src) { src.play(); this.map.triggerRepaint(); this.map.once('render', () => src.pause()); }
    }
  }
}
