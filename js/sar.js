// SAR open-data library: small preview images from the open programmes of ICEYE, Capella Space and Umbra
// (CC BY 4.0), copied into sar/ by .github/workflows/sar-library.yml — never the full SAR products.
// The layer places a preview on its true footprint (rotated corners), colours it with a SAR palette,
// blends it with the map underneath and reveals it with a radar scan.
import { placeAt } from './place.js';
import { drawMapCrop } from './vizfx.js';
import { H } from './cartofx.js';
import { brandSafeArea } from './branding.js';

const { clamp, easeOut, track } = H;
const FONT = '"Montserrat","Inter","Segoe UI",system-ui,sans-serif';

// ---------------------------------------------------------------- the library index
let indexP = null;
export function loadSarIndex() {
  indexP ||= fetch(`sar/index.json?v=${Math.floor(Date.now() / 36e5)}`).then((r) => { if (!r.ok) throw new Error('SAR library not built yet'); return r.json(); });
  indexP.catch(() => { indexP = null; });
  return indexP;
}

// ---------------------------------------------------------------- palettes (256-entry LUTs)
const stops = (list) => {
  const lut = new Uint8ClampedArray(256 * 3);
  const P = list.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (P.length - 1), k = Math.min(P.length - 2, Math.floor(t)), f = t - k;
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = P[k][j] + (P[k + 1][j] - P[k][j]) * f;
  }
  return lut;
};
export const SAR_PALETTES = {
  gray: { name: 'Classic SAR (grey)', c: ['#000000', '#ffffff'] },
  teal: { name: 'ICEYE teal', c: ['#03141a', '#0c3a44', '#2c7f86', '#8fd3cf', '#effffb'] },
  viridis: { name: 'Viridis (blue → green → yellow)', c: ['#2a0f55', '#2d4a8a', '#1f8a8a', '#3fbf6f', '#b5df2a', '#fff21d'] },
  amber: { name: 'Gold / amber', c: ['#000000', '#3a2400', '#a8650c', '#f2b84b', '#fff4d6'] },
  inferno: { name: 'Thermal (inferno)', c: ['#000004', '#320a5e', '#8a226a', '#d44842', '#fba40a', '#fcffa4'] },
  ice: { name: 'Ice blue', c: ['#000308', '#06223f', '#1f64a8', '#7cc4ff', '#f2fbff'] },
  night: { name: 'Night vision green', c: ['#000400', '#03300c', '#1d8f2c', '#84ff8a', '#eaffea'] },
  turbo: { name: 'Rainbow (turbo)', c: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04'] },
  sepia: { name: 'Sepia', c: ['#0d0905', '#4a3420', '#a07850', '#e9d4b0', '#fffaf0'] },
  duo: { name: 'Two colours (pick below)', c: null },
};
const lutCache = new Map();
function lutFor(s) {
  const key = s.palette === 'duo' ? `duo:${s.low}:${s.high}` : s.palette || 'gray';
  let l = lutCache.get(key);
  if (!l) { l = stops(s.palette === 'duo' ? [s.low || '#05060a', s.high || '#ffd23f'] : (SAR_PALETTES[s.palette] || SAR_PALETTES.gray).c); lutCache.set(key, l); }
  return l;
}

// ---------------------------------------------------------------- images
const imgs = new Map();
function imageOf(url) {
  if (!url) return null;
  let e = imgs.get(url);
  if (!e) {
    const img = new Image();
    e = { img, ready: false, failed: false };
    imgs.set(url, e);
    track(new Promise((res) => { img.onload = () => { e.ready = true; res(); }; img.onerror = () => { e.failed = true; res(); }; img.src = url; }));
  }
  return e;
}
const colored = new Map();
/** the preview recoloured by the palette, contrast, brightness and gamma (cached) */
function coloredOf(L, e) {
  const s = L.style;
  const key = `${L.id}|${s.thumb}|${s.palette}|${s.low}|${s.high}|${s.contrast}|${s.brightness}|${s.gamma}|${s.invert}|${s.speckle}`;
  const hit = colored.get(L.id);
  if (hit?.key === key) return hit.c;
  const w = e.img.naturalWidth, h = e.img.naturalHeight;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(e.img, 0, 0);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  const lut = lutFor(s);
  const ct = +s.contrast || 1, br = +s.brightness || 0, gm = +s.gamma || 1, inv = !!s.invert;
  const map = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    v = (v - 0.5) * ct + 0.5 + br;
    v = Math.pow(clamp(v, 0, 1), 1 / gm);
    if (inv) v = 1 - v;
    map[i] = Math.round(v * 255);
  }
  const smooth = +s.speckle > 0;
  for (let i = 0; i < px.length; i += 4) {
    let v = px[i];
    if (smooth && i > 4 && i < px.length - 4) v = (px[i - 4] + 2 * v + px[i + 4]) >> 2;
    const k = map[v] * 3;
    px[i] = lut[k]; px[i + 1] = lut[k + 1]; px[i + 2] = lut[k + 2];
  }
  g.putImageData(d, 0, 0);
  colored.set(L.id, { key, c });
  return c;
}

// ---------------------------------------------------------------- warp the preview onto its footprint
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** draws img (w×h) so its corners land on the projected quad [tl,tr,br,bl], in N×N cells of 2 affine triangles */
function drawWarp(g, img, Q, N = 10, cut = 1) {
  const w = img.width, h = img.height;
  const P = (u, v) => lerp2(lerp2(Q[0], Q[1], u), lerp2(Q[3], Q[2], u), v);
  const tri = (s0, s1, s2, d0, d1, d2) => {
    // affine that maps source triangle → destination triangle
    const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2, [X0, Y0] = d0, [X1, Y1] = d1, [X2, Y2] = d2;
    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (!den) return;
    const a = ((X1 - X0) * (y2 - y0) - (X2 - X0) * (y1 - y0)) / den, b = ((X2 - X0) * (x1 - x0) - (X1 - X0) * (x2 - x0)) / den;
    const c = ((Y1 - Y0) * (y2 - y0) - (Y2 - Y0) * (y1 - y0)) / den, d = ((Y2 - Y0) * (x1 - x0) - (Y1 - Y0) * (x2 - x0)) / den;
    g.save();
    // grow the clip a hair so the cells do not show seams
    const cx = (X0 + X1 + X2) / 3, cy = (Y0 + Y1 + Y2) / 3, gr = (p) => [p[0] + Math.sign(p[0] - cx) * 0.6, p[1] + Math.sign(p[1] - cy) * 0.6];
    const [q0, q1, q2] = [gr(d0), gr(d1), gr(d2)];
    g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.closePath(); g.clip();
    g.transform(a, c, b, d, X0 - a * x0 - b * y0, Y0 - c * x0 - d * y0);
    g.drawImage(img, 0, 0);
    g.restore();
  };
  const rows = Math.max(1, Math.ceil(N * cut));
  for (let j = 0; j < rows; j++) for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = Math.min(cut, (j + 1) / N);
    if (v1 <= v0) continue;
    const s00 = [u0 * w, v0 * h], s10 = [u1 * w, v0 * h], s01 = [u0 * w, v1 * h], s11 = [u1 * w, v1 * h];
    const d00 = P(u0, v0), d10 = P(u1, v0), d01 = P(u0, v1), d11 = P(u1, v1);
    tri(s00, s10, s11, d00, d10, d11);
    tri(s00, s11, s01, d00, d11, d01);
  }
}
const offs = new Map();
function off(key, w, h) {
  let c = offs.get(key);
  if (!c) { c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); offs.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return [c, c.getContext('2d')];
}

// ---------------------------------------------------------------- registry
export const SAR_KINDS = { sarimage: { name: 'SAR image (open data)', icon: '📡', geom: null, desc: 'A radar satellite preview from the ICEYE, Capella or Umbra open-data libraries on its real footprint, with SAR colour palettes, blend modes and a radar-scan reveal' } };
export const SAR_ANIMS = { sarimage: { scan: 'Radar scan reveals it', wipe: 'Wipe along the image', fade: 'Fade in', none: 'Shown' } };
export const SAR_DEFAULTS = { sarimage: { anim: 'scan', duration: 2.2, style: { thumb: '', corners: null, bbox: null, provider: '', date: '', mode: '', place: '', country: '', credit: '', palette: 'teal', low: '#05060a', high: '#ffd23f', contrast: 1.15, brightness: 0, gamma: 1, invert: false, speckle: 0, opacity: 1, blend: 'normal', outline: true, outlineColor: '#7fe9ff', tag: true, tagTitle: '', scanColor: '#9ff6ff' } } };
const BLENDS = { normal: 'Normal', screen: 'Screen (glow over the map)', multiply: 'Multiply (darken into the map)', overlay: 'Overlay', 'soft-light': 'Soft light', 'hard-light': 'Hard light', lighten: 'Lighten', darken: 'Darken', 'color-dodge': 'Colour dodge', luminosity: 'Luminosity (SAR detail on map colours)', color: 'Colour (map detail, SAR colours)', difference: 'Difference' };
export const SAR_FORMS = {
  sarimage: [
    ['style._sar', 'SAR image', 'sarpick'],
    ['style.palette', 'Colour grade', 'select', Object.fromEntries(Object.entries(SAR_PALETTES).map(([k, v]) => [k, v.name]))],
    ['style.low', 'Dark colour', 'color', null, (L) => L.style.palette === 'duo'],
    ['style.high', 'Bright colour', 'color', null, (L) => L.style.palette === 'duo'],
    ['style.blend', 'Blend with the map', 'select', BLENDS],
    ['style.opacity', 'Opacity', 'range', [0.05, 1, 0.01]],
    ['style.contrast', 'Contrast', 'range', [0.3, 3, 0.05]],
    ['style.brightness', 'Brightness', 'range', [-0.5, 0.5, 0.01]],
    ['style.gamma', 'Gamma (lift the dark areas)', 'range', [0.3, 3, 0.05]],
    ['style.speckle', 'Smooth the speckle', 'switch'],
    ['style.invert', 'Invert', 'switch'],
    ['style.outline', 'Footprint outline', 'switch'],
    ['style.outlineColor', 'Outline / scan colour', 'color'],
    ['style.tag', 'Place / date caption (with the CC BY credit)', 'switch'],
    ['style.tagTitle', 'Caption title (empty = place, country)', 'text', null, (L) => L.style.tag !== false],
  ],
};
export const SAR_SET = new Set(Object.keys(SAR_KINDS));
export const sarPhases = () => ['below', 'captions'];

export function quadOf(s) {
  if (s.corners?.length === 4) return s.corners;
  const b = s.bbox;
  return b ? [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]] : null;
}
const fmtDate = (d) => { const t = new Date(d); return Number.isNaN(+t) ? '' : `${t.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][t.getUTCMonth()]} ${t.getUTCFullYear()} ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} UTC`; };

export function drawSar(ctx, L, tm, o, phase) {
  const s = L.style, unit = o.unit;
  const quad = quadOf(s);
  if (!quad) return;
  const e = imageOf(s.thumb);
  const u = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / Math.max(0.1, +L.duration || 1), 0, 1);
  if (phase === 'below') {
    const Q = quad.map((p) => o.proj(p));
    if (Q.some((q) => !q || !Number.isFinite(q[0]))) return;
    if (!e?.ready) {
      if (s.outline !== false) { ctx.save(); ctx.strokeStyle = s.outlineColor || '#7fe9ff'; ctx.setLineDash([6 * unit, 4 * unit]); ctx.lineWidth = 1.2 * unit; ctx.beginPath(); Q.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke(); ctx.restore(); }
      return;
    }
    const img = coloredOf(L, e);
    const xs = Q.map((q) => q[0]), ys = Q.map((q) => q[1]);
    const x0 = Math.floor(Math.min(...xs)) - 2, y0 = Math.floor(Math.min(...ys)) - 2, bw = Math.ceil(Math.max(...xs)) + 2 - x0, bh = Math.ceil(Math.max(...ys)) + 2 - y0;
    const S = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
    const pw = Math.min(4096, Math.ceil(bw * S)), ph = Math.min(4096, Math.ceil(bh * S));
    if (pw < 2 || ph < 2) return;
    const k = pw / bw;
    const Qo = Q.map((q) => [(q[0] - x0) * k, (q[1] - y0) * k]);
    // reveal: scan sweeps across the image (top → bottom of the picture), wipe the same without the glow
    const reveal = L.anim === 'scan' || L.anim === 'wipe' ? easeOut(u) : 1;
    const fade = L.anim === 'fade' ? u : 1;
    const N = bw * bh > 4e5 ? 14 : 10;
    const [A, ga] = off(`${L.id}:sar`, pw, ph);
    ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, pw, ph);
    ga.imageSmoothingQuality = 'high';
    drawWarp(ga, img, Qo, N, reveal);
    ctx.save();
    ctx.globalAlpha *= tm.alpha * fade * (+s.opacity || 1);
    const blend = s.blend || 'normal';
    if (blend === 'normal') ctx.drawImage(A, x0, y0, bw, bh);
    else {
      // blend with the map underneath: map crop → blend the SAR on top → keep only the footprint
      const [B, gb] = off(`${L.id}:sarb`, pw, ph);
      gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'source-over'; gb.clearRect(0, 0, pw, ph);
      const okMap = drawMapCrop(gb, o, x0, y0, bw, bh, 0, 0, pw, ph);
      if (!okMap) { gb.fillStyle = '#808080'; gb.fillRect(0, 0, pw, ph); }
      gb.globalCompositeOperation = blend; gb.drawImage(A, 0, 0);
      gb.globalCompositeOperation = 'destination-in'; gb.drawImage(A, 0, 0);
      gb.globalCompositeOperation = 'source-over';
      ctx.drawImage(B, x0, y0, bw, bh);
    }
    ctx.restore();
    // scan line with glow + footprint outline
    ctx.save(); ctx.globalAlpha *= tm.alpha * fade;
    const col = s.outlineColor || '#7fe9ff';
    if (L.anim === 'scan' && u < 1 && !tm.edit) {
      const a = lerp2(Q[0], Q[3], reveal), b = lerp2(Q[1], Q[2], reveal);
      ctx.strokeStyle = s.scanColor || '#9ff6ff'; ctx.lineWidth = 2.4 * unit; ctx.shadowColor = s.scanColor || '#9ff6ff'; ctx.shadowBlur = 18 * unit;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.lineWidth = 0.8 * unit; ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
    if (s.outline !== false) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.4 * unit; ctx.shadowColor = col; ctx.shadowBlur = 6 * unit;
      ctx.beginPath(); Q.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  } else if (phase === 'captions' && o.frame) {
    const fr = o.frame;
    const a = (tm.edit ? 1 : clamp(u * 2 - 0.4, 0, 1)) * tm.alpha;
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    const credit = s.credit || `© ${s.provider || 'provider'}, CC BY 4.0`;
    if (s.tag !== false) {
      const title = s.tagTitle || [s.place, s.country].filter(Boolean).join(', ') || 'SAR image';
      const sub = [String(s.provider || '').toUpperCase(), String(s.mode || '').replace(/_/g, ' ').toUpperCase(), fmtDate(s.date)].filter(Boolean).join('  |  ');
      const W = 520 * unit, Hh = 74 * unit;
      // top right, under the logo strip (the bottom is often taken by the lower third)
      const safeTop = brandSafeArea(fr.w, fr.h).top || 0;
      const x = fr.x + fr.w - W - 26 * unit, y = fr.y + Math.max(22 * unit, fr.h * safeTop + 6 * unit);
      placeAt(ctx, L, fr, x, y, W, Hh, { key: 'tag' });
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6 * unit;
      ctx.fillStyle = '#ffffff'; ctx.font = `400 ${26 * unit}px ${FONT}`;
      ctx.fillText(title, x + W, y + 30 * unit);
      ctx.font = `500 ${11.5 * unit}px "JetBrains Mono","Consolas",monospace`; ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(sub, x + W, y + 52 * unit);
      ctx.font = `400 ${10 * unit}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(credit, x + W, y + 70 * unit);
    } else {
      // the licence asks for credit: keep a small one in the corner
      ctx.font = `400 ${10 * unit}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'right'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * unit;
      ctx.fillText(credit, fr.x + fr.w - 14 * unit, fr.y + fr.h - 12 * unit);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the library dialog
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** opens the picker; onPick(item) is called with the chosen index entry */
export function openSarLibrary({ onPick, near = null } = {}) {
  document.getElementById('sar-lib')?.remove();
  const d = document.createElement('dialog');
  d.id = 'sar-lib'; d.className = 'modal sar-lib';
  d.innerHTML = `<form method="dialog" class="sar-head"><div><h3>📡 SAR open-data library</h3><p class="muted small">Small preview images from the open SAR programmes of <b>ICEYE</b>, <b>Capella Space</b> and <b>Umbra</b> — licensed CC BY 4.0 (the credit is added to the video). Only previews are used, never the full SAR files.</p></div><button class="btn sm" value="x" aria-label="Close">✕</button></form>
    <div class="sar-filters"><input type="search" id="sar-q" placeholder="Search a place, country or date…"><select id="sar-prov"><option value="">All providers</option><option>ICEYE</option><option>Capella</option><option>Umbra</option></select><label class="sar-near"><input type="checkbox" id="sar-near" ${near ? 'checked' : ''}> Nearest to the map first</label></div>
    <div class="sar-grid" id="sar-grid"><p class="muted">Loading the library…</p></div>`;
  document.body.appendChild(d);
  d.showModal();
  d.addEventListener('close', () => d.remove());
  let items = [];
  const dist = (x) => (near ? Math.hypot((x.bbox[0] + x.bbox[2]) / 2 - near[0], (x.bbox[1] + x.bbox[3]) / 2 - near[1]) : 0);
  const render = () => {
    const q = d.querySelector('#sar-q').value.trim().toLowerCase(), pv = d.querySelector('#sar-prov').value, nr = d.querySelector('#sar-near').checked && near;
    let list = items.filter((x) => (!pv || x.provider === pv) && (!q || `${x.place} ${x.country} ${x.provider} ${x.date} ${x.mode}`.toLowerCase().includes(q)));
    if (nr) list = list.slice().sort((a, b) => dist(a) - dist(b));
    d.querySelector('#sar-grid').innerHTML = list.length ? list.map((x) => `<button type="button" class="sar-card" data-id="${esc(x.id)}"><span class="sar-img"><img loading="lazy" src="${esc(x.thumb)}" alt=""></span><b>${esc(x.place || 'Unnamed place')}</b><small>${esc(x.country || '')}</small><small class="sar-meta"><i class="sar-p sar-${esc(x.provider.toLowerCase())}">${esc(x.provider)}</i> ${esc(String(x.date).slice(0, 10))} · ${esc(String(x.mode).replace(/_/g, ' '))}</small></button>`).join('') : '<p class="muted">No previews match.</p>';
  };
  loadSarIndex().then((j) => { items = j.items || []; render(); }).catch((e) => { d.querySelector('#sar-grid').innerHTML = `<p class="muted">${esc(e.message)} — run “SAR open-data library” in the repository's Actions tab.</p>`; });
  d.querySelector('#sar-q').addEventListener('input', render);
  d.querySelector('#sar-prov').addEventListener('change', render);
  d.querySelector('#sar-near').addEventListener('change', render);
  d.querySelector('#sar-grid').addEventListener('click', (ev) => {
    const b = ev.target.closest('.sar-card');
    if (!b) return;
    const it = items.find((x) => x.id === b.dataset.id);
    if (it) { d.close(); onPick?.(it); }
  });
}
/** layer style from an index entry */
export const sarStyleOf = (it) => ({ thumb: it.thumb, corners: it.corners || null, bbox: it.bbox, provider: it.provider, date: it.date, mode: it.mode, place: it.place, country: it.country, credit: it.credit, sarId: it.id });
