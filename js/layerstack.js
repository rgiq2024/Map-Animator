// Map layer stack — the classic "exploded GIS layers" animation.
// Your pictures (imagery, streets, water, tree canopy, buildings, boundaries …) start as one flat map, tilt into
// an axonometric view, float apart into a stack, then each layer is shown in turn with a leader label and its source.
// Pictures: upload several at once; transparent PNGs work best (white backgrounds can be made see-through).
import { imageFor, storeImage } from './geoimage.js';
import { placeAt } from './place.js';

const SANS = '"Inter","Segoe UI",system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;
const hexA = (h, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return h; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export const LS_KINDS = {
  layerstack: { name: 'Map layer stack', icon: '🗂', geom: null, desc: 'Your map layers (imagery, streets, water, trees, buildings, boundaries …) as one flat map that tilts, floats apart into a 3D stack and shows each layer in turn with its name and source' },
};
export const LS_ANIMS = {
  layerstack: {
    full: 'Overview → flat map → tilt → float apart → each layer in turn',
    explode: 'Flat map → tilt → float apart (no tour)',
    tour: 'Already apart — each layer in turn',
    drop: 'Layers drop in one by one',
    fade: 'Fade in (stack shown)',
    none: 'Shown',
  },
};
export const LS_DEFAULTS = {
  layerstack: {
    layers: [], overview: '', overviewLabel: '',
    shape: 'square', shapeRot: 0, edgeAll: false, rot: 38, tilt: 60, size: 1, gap: 1, spin: 0, cx: 0.5, cy: 0.56,
    focusZoom: 1.18, follow: true, dim: 0.1, outline: '#f2d39b', outlineOn: true,
    labels: true, sources: true, labelsEnd: true, labelColor: '#ffffff', textSize: 1, number: false,
    bg: '#000000', bgAlpha: 1, clearWhite: false, shadow: true,
    title: '', sub: '', titleColor: '#ffffff', credits: false,
  },
};
export const LS_LAYER_DEFAULTS = { layerstack: { anim: 'full', duration: 20, style: LS_DEFAULTS.layerstack } };
const show = (...a) => (L) => a.includes(L.anim);
export const LS_FORMS = {
  layerstack: [
    ['style.layers', 'Layers (bottom → top)', 'stacklayers'],
    ['', 'Tip: transparent PNGs of the same area and size work best. Name files like “0_Imagery.png”, “1_Streets.png” — the number sets the order and the rest becomes the label.', 'note'],
    ['style.overview', 'Overview picture to start from (optional — a wider view the stack zooms out of)', 'image', null, show('full')],
    ['style.overviewLabel', 'Overview caption', 'text', null, (L) => L.anim === 'full' && !!L.style.overview],
    ['style.shape', 'Shape of each layer', 'select', { square: 'Square / rectangle (the whole picture)', rounded: 'Rounded square', circle: 'Circle', oval: 'Oval', hexagon: 'Hexagon', octagon: 'Octagon', diamond: 'Diamond' }],
    ['style.shapeRot', 'Turn the shape (°) — e.g. 30 for a flat-top hexagon', 'range', [-90, 90, 1], (L) => ['hexagon', 'octagon', 'oval', 'diamond'].includes(L.style.shape)],
    ['style.edgeAll', 'Thin edge on every layer', 'switch'],
    ['style.rot', 'Rotate (°)', 'range', [-180, 180, 1]],
    ['style.tilt', 'Tilt (° — 0 = from straight above)', 'range', [0, 80, 1]],
    ['style.size', 'Zoom (size)', 'range', [0.3, 2.5, 0.01]],
    ['style.gap', 'Space between layers', 'range', [0.2, 3, 0.05]],
    ['style.spin', 'Slow turn while it plays (° over the whole animation)', 'range', [-120, 120, 1]],
    ['style.cx', 'Position ←→ (or drag it)', 'range', [0, 1, 0.005]],
    ['style.cy', 'Position ↑↓ (or drag it)', 'range', [0, 1, 0.005]],
    ['style.focusZoom', 'Zoom on the layer being shown', 'range', [1, 2, 0.01], show('full', 'tour')],
    ['style.follow', 'Move the stack so the layer being shown is in the middle', 'switch', null, show('full', 'tour')],
    ['style.dim', 'Other layers while one is shown (opacity)', 'range', [0, 1, 0.01], show('full', 'tour')],
    ['style.outlineOn', 'Thin frame around the layer being shown', 'switch'],
    ['style.outline', 'Frame and line colour', 'color'],
    ['style.labels', 'Name labels with a leader line', 'switch'],
    ['style.sources', 'Source under each name (from the layer’s “Source”)', 'switch', null, (L) => L.style.labels !== false],
    ['style.labelsEnd', 'Label every layer at the end', 'switch', null, (L) => L.style.labels !== false],
    ['style.number', 'Number the labels (1, 2, 3 …)', 'switch', null, (L) => L.style.labels !== false],
    ['style.labelColor', 'Label colour', 'color', null, (L) => L.style.labels !== false],
    ['style.textSize', 'Text size', 'range', [0.5, 2.5, 0.05]],
    ['style.title', 'Title (optional)', 'text'],
    ['style.sub', 'Subtitle (optional)', 'text'],
    ['style.titleColor', 'Title colour', 'color', null, (L) => !!(L.style.title || L.style.sub)],
    ['style.credits', 'List all sources in a corner at the end', 'switch'],
    ['style.bg', 'Background', 'color'],
    ['style.bgAlpha', 'Background opacity (0 = the map shows behind)', 'range', [0, 1, 0.01]],
    ['style.shadow', 'Soft shadow under the stack', 'switch'],
    ['style.clearWhite', 'Make white backgrounds see-through (for pictures without transparency)', 'switch'],
  ],
};
export const LS_SET = new Set(Object.keys(LS_KINDS));
export const lsPhases = () => ['captions'];
export const lsMedia = (L) => (L.kind === 'layerstack' ? [...(L.style?.layers || []).map((x) => x.media), L.style?.overview].filter(Boolean) : []);

/** "0_Tree_Canopy.png" → [0, "Tree Canopy"] */
export function lsNameOf(file) {
  const base = String(file || '').replace(/\.[a-z0-9]+$/i, '');
  const m = base.match(/^\s*(\d+)[\s._-]+(.*)$/);
  const label = (m ? m[2] : base).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return [m ? +m[1] : null, label || 'Layer'];
}
/** Seconds each part takes before fitting to the layer's duration */
function plan(L, n) {
  const a = L.anim || 'full';
  const ov = a === 'full' && L.style?.overview ? 2.2 : 0;
  const flat = a === 'full' || a === 'explode' ? 0.8 : 0;
  const tilt = a === 'full' || a === 'explode' ? 1.6 : 0;
  const expl = a === 'full' || a === 'explode' ? 1.8 : a === 'drop' ? 0.9 * n + 0.6 : 0;
  const per = a === 'full' || a === 'tour' ? 2.2 : 0;
  const end = a === 'full' || a === 'tour' ? 1.8 : 0.6;
  return { ov, flat, tilt, expl, per, tour: per * n, end };
}
export function lsNominal(L) {
  const n = (L.style?.layers || []).filter((x) => !x.hidden).length || 1;
  const p = plan(L, n);
  return Math.ceil(p.ov + p.flat + p.tilt + p.expl + p.tour + p.end);
}

// ---------------------------------------------------------------- pictures (with optional tint / white removal)
const proc = new Map();
function picture(id, tint, clearWhite) {
  const im = imageFor(id);
  if (!im?.ready) return null;
  if (!tint && !clearWhite) return { src: im.bmp, w: im.w, h: im.h };
  const key = `${id}|${tint || ''}|${clearWhite ? 1 : 0}`;
  let e = proc.get(key);
  if (e) return e;
  const maxS = 2400, k = Math.min(1, maxS / Math.max(im.w, im.h));
  const c = document.createElement('canvas'); c.width = Math.round(im.w * k); c.height = Math.round(im.h * k);
  const g = c.getContext('2d', { willReadFrequently: !!clearWhite });
  g.drawImage(im.bmp, 0, 0, c.width, c.height);
  if (clearWhite) {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const s = p[i] + p[i + 1] + p[i + 2]; if (s > 690) p[i + 3] = Math.round(p[i + 3] * clamp((765 - s) / 75, 0, 1)); }
    g.putImageData(d, 0, 0);
  }
  if (tint) { g.globalCompositeOperation = 'source-in'; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); }
  e = { src: c, w: im.w, h: im.h };
  proc.set(key, e);
  return e;
}

// ---------------------------------------------------------------- shapes (in picture pixels)
function shapePts(st, w, h) {
  const sh = st.shape || 'square', cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2, a0 = ((+st.shapeRot || 0) * Math.PI) / 180;
  const ring = (n, rx, ry, start) => Array.from({ length: n }, (_, k) => { const a = start + a0 + (k / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  if (sh === 'circle') return ring(96, r, r, 0);
  if (sh === 'oval') return ring(96, w / 2, h / 2 * 0.68, 0);
  if (sh === 'hexagon') return ring(6, r, r, -Math.PI / 2);
  if (sh === 'octagon') return ring(8, r, r, Math.PI / 8);
  if (sh === 'diamond') return ring(4, r, r, -Math.PI / 2);
  if (sh === 'rounded') {
    const q = Math.min(w, h) * 0.12, out = [];
    const arc = (x, y, a) => { for (let k = 0; k <= 8; k++) { const t = a + (k / 8) * Math.PI / 2; out.push([x + Math.cos(t) * q, y + Math.sin(t) * q]); } };
    arc(w - q, q, -Math.PI / 2); arc(w - q, h - q, 0); arc(q, h - q, Math.PI / 2); arc(q, q, Math.PI);
    return out;
  }
  return [[0, 0], [w, 0], [w, h], [0, h]];
}
const tracePts = (g, P) => { g.beginPath(); P.forEach((c, j) => (j ? g.lineTo(c[0], c[1]) : g.moveTo(c[0], c[1]))); g.closePath(); };

// ---------------------------------------------------------------- drawing
function labelW(g, txt, srcTxt, u, num) {
  g.save(); g.font = `500 ${15 * u}px ${SANS}`; const tw = g.measureText(num ? `${num}  ${txt}` : txt).width;
  g.font = `400 ${10.5 * u}px ${SANS}`; const sw = srcTxt ? Math.min(g.measureText(srcTxt).width, 250 * u) : 0; g.restore();
  return Math.max(tw, sw) + 10 * u;
}
function drawLabel(g, x, y, side, txt, srcTxt, col, lineCol, u, k, num, fr) {
  // leader: corner → elbow → underline; text sits on the underline
  if (k <= 0) return;
  let ex = x + side * 46 * u;
  const ey = y - 30 * u, need = labelW(g, txt, srcTxt, u, num);
  if (fr) { const m = 18 * u; if (side > 0) ex = Math.min(ex, fr.x + fr.w - m - need); else ex = Math.max(ex, fr.x + m + need); }
  g.save();
  g.font = `500 ${15 * u}px ${SANS}`;
  const t = num ? `${num}  ${txt}` : txt;
  const tw = g.measureText(t).width;
  g.font = `400 ${10.5 * u}px ${SANS}`;
  const sw = srcTxt ? Math.min(g.measureText(srcTxt).width, 250 * u) : 0;
  const ul = Math.max(tw, sw) + 10 * u;
  const L1 = Math.hypot(ex - x, ey - y), total = L1 + ul, d = total * clamp(k * 1.4, 0, 1);
  g.strokeStyle = lineCol; g.lineWidth = 1.1 * u; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y);
  if (d <= L1) g.lineTo(x + (ex - x) * d / L1, y + (ey - y) * d / L1);
  else { g.lineTo(ex, ey); g.lineTo(ex + side * (d - L1), ey); }
  g.stroke();
  g.fillStyle = lineCol; g.beginPath(); g.arc(x, y, 2.4 * u, 0, 7); g.fill();
  const a = clamp((k - 0.45) / 0.4, 0, 1);
  if (a > 0) {
    g.globalAlpha *= a;
    const tx = side > 0 ? ex + 4 * u : ex - 4 * u;
    g.textAlign = side > 0 ? 'left' : 'right'; g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 6 * u;
    g.font = `500 ${15 * u}px ${SANS}`; g.fillStyle = col; g.fillText(t, tx, ey - 6 * u);
    if (srcTxt) {
      g.font = `400 ${10.5 * u}px ${SANS}`; g.fillStyle = hexA(col, 0.68);
      wrap(g, srcTxt, tx, ey + 14 * u, 250 * u, 13 * u, side);
    }
  }
  g.restore();
}
function wrap(g, txt, x, y, maxW, lh, side) {
  const words = String(txt).split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; if (++n > 2) return; } else line = t;
  }
  if (line) g.fillText(line, x, y + n * lh);
  void side;
}

export function drawLayerStack(ctx, L, tm, o) {
  const s = { ...LS_DEFAULTS.layerstack, ...L.style }, fr = o.frame;
  if (!fr) return;
  const u = o.unit * (+s.textSize || 1), g = ctx;
  const all = (s.layers || []).filter((x) => !x.hidden && x.media);
  const n = all.length;
  const edit = tm.edit, anim = L.anim || 'full';
  // ---- timing (fitted to the layer's duration)
  const P = plan(L, Math.max(1, n));
  const nominal = P.ov + P.flat + P.tilt + P.expl + P.tour + P.end;
  const f = Math.max(0.2, (+L.duration || nominal) / nominal);
  const T = edit || anim === 'none' ? 1e9 : tm.tau / f; // in nominal seconds
  const t0 = P.ov, t1 = t0 + P.flat, t2 = t1 + P.tilt, t3 = t2 + P.expl, t4 = t3 + P.tour;
  const fadeA = anim === 'fade' && !edit ? clamp(tm.tau / 0.8, 0, 1) : 1;
  const A = (tm.alpha ?? 1) * fadeA;
  if (A <= 0) return;
  g.save(); g.globalAlpha = A;
  if (+s.bgAlpha > 0) { g.save(); g.globalAlpha = A * clamp(+s.bgAlpha, 0, 1); g.fillStyle = s.bg || '#000'; g.fillRect(fr.x, fr.y, fr.w, fr.h); g.restore(); }
  // ---- state at this moment
  let kTilt = 1, kSep = 1, focus = -1, focusK = 0, kOv = 0;
  if (anim === 'full' || anim === 'explode') {
    kOv = P.ov ? 1 - ease(seg(T, t0 - 1.0, t0 + 0.3)) : 0;
    kTilt = ease(seg(T, t1, t2));
    kSep = ease(seg(T, t2, t3));
  }
  if ((anim === 'full' || anim === 'tour') && n && T < t4 + P.end * 0.35) {
    const x = (T - t3) / P.per;
    if (x >= 0) {
      focus = clamp(Math.floor(x), 0, n - 1);
      const fx = x - focus;
      focusK = focus === 0 ? ease(seg(fx, 0, 0.25)) : 1;
      if (x >= n) focusK = 1 - ease(seg(T, t4, t4 + P.end * 0.35));
      L._fx = fx;
    }
  }
  const unit0 = Math.min(fr.w, fr.h);
  let S = unit0 * 0.56 * (+s.size || 1);
  const rot0 = (+s.rot || 0) * Math.PI / 180, tilt0 = (+s.tilt || 0) * Math.PI / 180;
  const spin = edit ? 0 : (+s.spin || 0) * Math.PI / 180 * clamp(tm.tau / Math.max(0.5, +L.duration || 1), 0, 1);
  const R = lerp(0, rot0, kTilt) + spin, kk = Math.cos(lerp(0, tilt0, kTilt));
  const gapPx = S * 0.105 * (+s.gap || 1) * Math.sin(lerp(0, tilt0, kTilt) + 0.0001) / Math.max(0.2, Math.sin(tilt0 || 1));
  const zOf = (i) => (i - (n - 1) / 2) * gapPx * kSep;
  // focus: zoom on the layer and bring it to the middle (smoothly between layers)
  let zF = 0, zoom = 1;
  if (focus >= 0) {
    const fx = L._fx || 0, nxt = Math.min(n - 1, focus + 1);
    const mv = focus < n - 1 && fx > 0.82 ? ease(seg(fx, 0.82, 1)) : 0;
    const zc = lerp(zOf(focus), zOf(nxt), mv);
    zF = s.follow !== false ? zc * focusK : 0;
    zoom = 1 + ((+s.focusZoom || 1) - 1) * focusK;
  }
  S *= zoom;
  let cx = fr.x + fr.w * clamp(+s.cx, 0, 1), cy = fr.y + fr.h * clamp(+s.cy, 0, 1) + zF * zoom;
  // drag to move (the whole stack)
  {
    const hw = S * 0.75, hh = S * 0.6;
    g.save();
    const [dx, dy] = placeAt(g, L, fr, cx - hw, cy - hh, 2 * hw, 2 * hh, { key: 'stack' });
    g.restore();
    if (s.pos_stack) { s.cx = L.style.cx = +((cx + dx - fr.x) / fr.w).toFixed(4); s.cy = L.style.cy = +((cy + dy - zF * zoom - fr.y) / fr.h).toFixed(4); delete L.style.pos_stack; }
    cx += dx; cy += dy;
  }
  const ex = [Math.cos(R), Math.sin(R) * kk], ey = [-Math.sin(R), Math.cos(R) * kk];
  const geom = (pic, i, drop = 0) => {
    const sc = S / Math.max(pic.w, pic.h);
    const z = zOf(i) * zoom + drop;
    const ox = cx - (ex[0] * pic.w + ey[0] * pic.h) * sc / 2, oy = cy - z - (ex[1] * pic.w + ey[1] * pic.h) * sc / 2;
    const at = (a, b) => [ox + (ex[0] * a + ey[0] * b) * sc, oy + (ex[1] * a + ey[1] * b) * sc];
    return { sc, ox, oy, at, corners: shapePts(s, pic.w, pic.h).map(([a, b]) => at(a, b)) };
  };
  // ---- overview picture (zooms in to the stack)
  if (kOv > 0 && s.overview) {
    const im = imageFor(s.overview);
    if (im?.ready) {
      const z = 1 + 1.6 * (1 - kOv);
      const k0 = Math.max(fr.w / im.w, fr.h / im.h) * z, w = im.w * k0, h = im.h * k0;
      g.save(); g.globalAlpha *= kOv; g.beginPath(); g.rect(fr.x, fr.y, fr.w, fr.h); g.clip();
      g.drawImage(im.bmp, fr.x + fr.w / 2 - w / 2, fr.y + fr.h / 2 - h / 2, w, h);
      if (s.overviewLabel) { g.font = `600 ${22 * u}px ${SANS}`; g.fillStyle = '#fff'; g.textAlign = 'left'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8 * u; g.fillText(s.overviewLabel, fr.x + 40 * u, fr.y + fr.h - 50 * u); }
      g.restore();
    }
  }
  const stackA = P.ov && (anim === 'full') ? clamp(1 - kOv * 1.15, 0, 1) : 1;
  if (stackA > 0 && n) {
    const pics = all.map((x) => picture(x.media, x.tint, s.clearWhite || x.clearWhite));
    // shadow under the stack
    if (s.shadow !== false && kTilt > 0.05) {
      const p0 = pics.find(Boolean);
      if (p0) {
        const G = geom(p0, 0, -gapPx * 0.9 * kSep * zoom - 8 * u);
        g.save(); g.globalAlpha *= 0.55 * kTilt * stackA; g.filter = `blur(${Math.round(18 * u)}px)`;
        g.beginPath(); G.corners.forEach((c, j) => (j ? g.lineTo(c[0], c[1]) : g.moveTo(c[0], c[1]))); g.closePath(); g.fillStyle = '#000'; g.fill();
        g.restore();
      }
    }
    const labelAt = [];
    for (let i = 0; i < n; i++) {
      const pic = pics[i]; if (!pic) continue;
      let drop = 0, a = 1;
      if (anim === 'drop' && !edit) { const k = ease(seg(T, 0.9 * i, 0.9 * i + 0.9)); drop = (1 - k) * fr.h * 0.5; a = k; if (a <= 0) continue; }
      if (focus >= 0) a *= i === focus ? 1 : lerp(1, clamp(+s.dim, 0, 1), focusK);
      const G = geom(pic, i, drop);
      g.save(); g.globalAlpha *= a * stackA * clamp(+all[i].opacity || 1, 0, 1);
      g.transform(ex[0] * G.sc, ex[1] * G.sc, ey[0] * G.sc, ey[1] * G.sc, G.ox, G.oy);
      if ((s.shape || 'square') !== 'square') { tracePts(g, shapePts(s, pic.w, pic.h)); g.clip(); }
      g.drawImage(pic.src, 0, 0, pic.w, pic.h);
      g.restore();
      if (s.edgeAll) { g.save(); g.globalAlpha *= a * stackA * 0.75; g.strokeStyle = s.outline; g.lineWidth = 1 * u; tracePts(g, G.corners); g.stroke(); g.restore(); }
      const isF = i === focus && focusK > 0.01;
      if (s.outlineOn !== false && isF) {
        g.save(); g.globalAlpha *= stackA * (isF ? focusK : 1);
        g.strokeStyle = s.outline; g.lineWidth = 1.1 * u; tracePts(g, G.corners); g.stroke();
        g.restore();
      }
      labelAt.push({ i, G });
    }
    // ---- labels
    if (s.labels !== false && kSep > 0.9) {
      const sideOf = (i) => (i % 2 === 0 ? 1 : -1);
      const cornerFor = (G, side) => G.corners.reduce((b, c) => (side > 0 ? (c[0] > b[0] ? c : b) : (c[0] < b[0] ? c : b)));
      const one = (i, k) => {
        const it = labelAt.find((x) => x.i === i); if (!it) return;
        const txt = all[i].label || `Layer ${i + 1}`, src = s.sources !== false ? all[i].source || '' : '', num = s.number ? i + 1 : 0;
        const need = labelW(g, txt, src, u, num) + 70 * u;
        let side = sideOf(i), c = cornerFor(it.G, side);
        const room = (sd, cc) => (sd > 0 ? fr.x + fr.w - cc[0] : cc[0] - fr.x);
        if (room(side, c) < need) { const c2 = cornerFor(it.G, -side); if (room(-side, c2) > room(side, c)) { side = -side; c = c2; } }
        drawLabel(g, c[0], c[1], side, txt, src, s.labelColor, s.outline, u, k * stackA, num, fr);
      };
      if (focus >= 0 && focusK > 0) one(focus, Math.min(focusK, ease(seg(L._fx || 0, 0.05, 0.4))) * (focus === 0 || (L._fx || 0) > 0.05 ? 1 : 0));
      const endK = edit || anim === 'none' || anim === 'fade' ? 1 : anim === 'explode' || anim === 'drop' ? ease(seg(T, t3 - 0.2, t3 + 0.8)) : ease(seg(T, t4 + P.end * 0.3, t4 + P.end * 0.8));
      if (s.labelsEnd !== false && endK > 0 && focus < 0) for (let i = 0; i < n; i++) one(i, endK);
    }
    // ---- credits
    if (s.credits) {
      const endK = edit ? 1 : ease(seg(T, t4, t4 + 0.8));
      const rows = all.filter((x) => x.source).map((x) => [x.label, x.source]);
      if (endK > 0 && rows.length) {
        g.save(); g.globalAlpha *= endK; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        let y = fr.y + fr.h - (rows.length * 15 + 14) * u;
        for (const [a, b] of rows) { g.font = `600 ${10 * u}px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(`${a}:`, fr.x + 28 * u, y); const w = g.measureText(`${a}: `).width; g.font = `400 ${10 * u}px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(b, fr.x + 28 * u + w, y); y += 15 * u; }
        g.restore();
      }
    }
  } else if (!n) {
    g.save(); g.font = `500 ${16 * u}px ${SANS}`; g.fillStyle = 'rgba(255,255,255,0.8)'; g.textAlign = 'center';
    g.fillText('Map layer stack — add your layer pictures in the settings (“Add pictures…”)', fr.x + fr.w / 2, fr.y + fr.h / 2); g.restore();
  }
  // ---- title
  if (s.title || s.sub) {
    g.save(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const [dx, dy] = placeAt(g, L, fr, fr.x + 36 * u, fr.y + 30 * u, 520 * u, 70 * u, { key: 'title' });
    void dx; void dy;
    if (s.title) { g.font = `600 ${30 * u}px ${SANS}`; g.fillStyle = s.titleColor; g.fillText(s.title, fr.x + 40 * u, fr.y + 66 * u); }
    if (s.sub) { g.font = `400 ${15 * u}px ${SANS}`; g.fillStyle = hexA(s.titleColor, 0.72); g.fillText(s.sub, fr.x + 41 * u, fr.y + 92 * u); }
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------- sample (the Seattle layers bundled with the app)
export const LS_SAMPLES = {
  seattle: {
    name: 'Seattle — 6 map layers',
    overview: 'assets/stack/seattle/overview.jpg',
    layers: [
      { file: '0-imagery.jpg', label: 'Imagery', source: 'Esri World Imagery Basemap (Vantor, NASA, NGA, USGS, FEMA)' },
      { file: '1-streets.png', label: 'Streets', source: 'Esri Human Geography Basemap (TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, GIS User Community)', tint: '#ffffff' },
      { file: '2-water.png', label: 'Water', source: 'USGS National Hydrography Dataset, Esri' },
      { file: '3-tree-canopy.png', label: 'Tree Canopy', source: 'University of Vermont Spatial Analysis Laboratory for City of Seattle Office of Sustainability & Environment' },
      { file: '4-buildings.png', label: 'Buildings', source: 'Oak Ridge National Laboratory, FEMA', tint: '#ffffff' },
      { file: '5-neighborhoods.png', label: 'Neighborhoods', source: 'U.S. Census Bureau American Community Survey, City of Seattle Office of Planning and Community Development' },
    ],
  },
};
/** Load a bundled sample into the layer (pictures are stored like uploads, so saved files carry them). */
export async function lsLoadSample(L, key = 'seattle') {
  const S = LS_SAMPLES[key];
  const get = async (p) => storeImage(await (await fetch(p)).blob());
  const layers = [];
  for (const x of S.layers) layers.push({ media: await get(`assets/stack/${key}/${x.file}`), label: x.label, source: x.source, ...(x.tint ? { tint: x.tint } : {}) });
  L.style.layers = layers;
  if (S.overview) { L.style.overview = await get(S.overview); L.style.overviewLabel = 'Seattle, Washington'; }
  return layers.length;
}
