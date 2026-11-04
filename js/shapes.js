// Shape layers: rectangles, rounded boxes, circles, ellipses, triangles, hexagons, polygons, stars, rings,
// lines and arrows drawn on the video. Drag them anywhere; size, rotation, fill, outline and glow are editable.
import { placeAt } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const backOut = (u) => { const c = 1.7, x = clamp(u, 0, 1) - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };
function hexA(hex, a) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const SHAPE_TYPES = {
  rect: 'Rectangle', rounded: 'Rounded rectangle', circle: 'Circle', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Diamond',
  hexagon: 'Hexagon', polygon: 'Polygon (choose sides)', star: 'Star', ring: 'Ring', line: 'Line', arrow: 'Arrow', cross: 'Cross / plus', bracket: 'Corner brackets',
};
export const SH_KINDS = { shape: { name: 'Shape', icon: '⬢', geom: null, desc: 'Rectangle, circle, hexagon, polygon, star, line, arrow… on the video' } };
export const SH_ANIMS = { shape: { draw: 'Outline draws, then fills', pop: 'Pop in', fade: 'Fade in', wipe: 'Wipe in', grow: 'Grow from the centre', spin: 'Spin in', none: 'Already there' } };
export const SH_DEFAULTS = { shape: { anim: 'draw', duration: 1, style: { type: 'rect', w: 0.3, h: 0.22, rotation: 0, fill: '#ff3b30', fillOpacity: 0.25, stroke: '#ffffff', strokeWidth: 3, dash: 'solid', radius: 18, sides: 6, points: 5, inner: 0.45, glow: false, pulse: false, spinSpeed: 0, label: '', labelColor: '#ffffff', labelSize: 1, position: 'center', head: 1 } } };
export const SH_FORMS = {
  shape: [
    ['style.type', 'Shape', 'select', SHAPE_TYPES],
    ['style.w', 'Width (part of the video)', 'range', [0.01, 1.2, 0.005]],
    ['style.h', 'Height (part of the video)', 'range', [0.01, 1.2, 0.005], (L) => !['circle', 'hexagon', 'polygon', 'star', 'ring', 'line', 'arrow'].includes(L.style.type)],
    ['style.rotation', 'Rotation (°)', 'range', [-180, 180, 1]],
    ['style.sides', 'Sides', 'range', [3, 12, 1], (L) => L.style.type === 'polygon'],
    ['style.points', 'Points', 'range', [3, 12, 1], (L) => L.style.type === 'star'],
    ['style.inner', 'Inner size', 'range', [0.15, 0.9, 0.01], (L) => ['star', 'ring'].includes(L.style.type)],
    ['style.radius', 'Corner radius', 'range', [0, 120, 1], (L) => L.style.type === 'rounded'],
    ['style.head', 'Arrow head size', 'range', [0.3, 3, 0.05], (L) => L.style.type === 'arrow'],
    ['style.fill', 'Fill colour', 'color', null, (L) => !['line', 'arrow', 'bracket'].includes(L.style.type)],
    ['style.fillOpacity', 'Fill opacity', 'range', [0, 1, 0.01], (L) => !['line', 'arrow', 'bracket'].includes(L.style.type)],
    ['style.stroke', 'Outline colour', 'color'],
    ['style.strokeWidth', 'Outline width', 'range', [0, 30, 0.5]],
    ['style.dash', 'Outline style', 'select', { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', marching: 'Marching dashes' }],
    ['style.glow', 'Glow', 'switch'],
    ['style.pulse', 'Pulse (keeps breathing)', 'switch'],
    ['style.spinSpeed', 'Keep spinning (°/s)', 'range', [-180, 180, 1]],
    ['style.label', 'Text inside', 'text'],
    ['style.labelColor', 'Text colour', 'color', null, (L) => !!L.style.label],
    ['style.labelSize', 'Text size', 'range', [0.3, 4, 0.05], (L) => !!L.style.label],
    ['style.position', 'Position (or drag it)', 'select', { center: 'Centre', 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' }],
  ],
};
export const SH_SET = new Set(['shape']);
export const shPhases = () => ['captions'];

function regular(ctx, n, rx, ry, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rx, Math.sin(a) * ry); }
  ctx.closePath();
}
function shapePath(ctx, s, W, H) {
  const t = s.type || 'rect', rx = W / 2, ry = H / 2;
  if (t === 'rect') { ctx.beginPath(); ctx.rect(-rx, -ry, W, H); }
  else if (t === 'rounded') { ctx.beginPath(); const r = Math.min(+s.radius || 0, rx, ry); if (ctx.roundRect) ctx.roundRect(-rx, -ry, W, H, r); else ctx.rect(-rx, -ry, W, H); }
  else if (t === 'circle') { ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); }
  else if (t === 'ellipse') { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); }
  else if (t === 'triangle') { ctx.beginPath(); ctx.moveTo(0, -ry); ctx.lineTo(rx, ry); ctx.lineTo(-rx, ry); ctx.closePath(); }
  else if (t === 'diamond') { ctx.beginPath(); ctx.moveTo(0, -ry); ctx.lineTo(rx, 0); ctx.lineTo(0, ry); ctx.lineTo(-rx, 0); ctx.closePath(); }
  else if (t === 'hexagon') regular(ctx, 6, rx, rx, 0);
  else if (t === 'polygon') regular(ctx, clamp(Math.round(+s.sides || 6), 3, 24), rx, rx);
  else if (t === 'star') {
    const n = clamp(Math.round(+s.points || 5), 3, 24), ir = rx * clamp(+s.inner || 0.45, 0.1, 0.95);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? ir : rx; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  } else if (t === 'ring') { ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.moveTo(rx * clamp(+s.inner || 0.6, 0.1, 0.95), 0); ctx.arc(0, 0, rx * clamp(+s.inner || 0.6, 0.1, 0.95), 0, Math.PI * 2, true); }
  else if (t === 'cross') { const a = Math.min(rx, ry) * 0.32; ctx.beginPath(); ctx.moveTo(-a, -ry); ctx.lineTo(a, -ry); ctx.lineTo(a, -a); ctx.lineTo(rx, -a); ctx.lineTo(rx, a); ctx.lineTo(a, a); ctx.lineTo(a, ry); ctx.lineTo(-a, ry); ctx.lineTo(-a, a); ctx.lineTo(-rx, a); ctx.lineTo(-rx, -a); ctx.lineTo(-a, -a); ctx.closePath(); }
}
function pathLength(s, W, H) {
  const t = s.type, rx = W / 2, ry = H / 2;
  if (t === 'circle' || t === 'ring') return Math.PI * 2 * rx;
  if (t === 'ellipse') return Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  if (t === 'line' || t === 'arrow') return W;
  return 2 * (W + H) * 1.15;
}
export function drawShape(ctx, L, tm, o) {
  const s = L.style, fr = o.frame, t = o.time || 0;
  if (!fr) return;
  const unit = o.unit;
  const D = Math.max(0.05, +L.duration || 1);
  const u = tm.edit || L.anim === 'none' ? 1 : clamp(tm.tau / D, 0, 1);
  const W = fr.w * clamp(+s.w || 0.3, 0.005, 2);
  const square = ['circle', 'hexagon', 'polygon', 'star', 'ring'].includes(s.type);
  const H = s.type === 'line' || s.type === 'arrow' ? Math.max(20 * unit, (+s.strokeWidth || 3) * unit * 4) : square ? W : fr.h * clamp(+s.h || 0.2, 0.005, 2);
  const m = 40 * unit, pos = s.position || 'center';
  let cx = pos.includes('right') ? fr.x + fr.w - m - W / 2 : pos.includes('left') ? fr.x + m + W / 2 : fr.x + fr.w / 2;
  let cy = pos.includes('bottom') ? fr.y + fr.h - m - H / 2 : pos.includes('top') ? fr.y + m + H / 2 : fr.y + fr.h / 2;
  ctx.save();
  ctx.globalAlpha *= tm.alpha;
  placeAt(ctx, L, fr, cx - W / 2, cy - H / 2, W, H);
  ctx.translate(cx, cy);
  let rot = (+s.rotation || 0) * Math.PI / 180 + (+s.spinSpeed || 0) * Math.PI / 180 * (tm.edit ? 0 : tm.tau);
  let sc = 1;
  if (L.anim === 'pop') sc = backOut(u);
  if (L.anim === 'grow') sc = easeOut(u);
  if (L.anim === 'spin') { sc = easeOut(u); rot += (1 - easeOut(u)) * Math.PI * 1.5; }
  if (L.anim === 'fade') ctx.globalAlpha *= ease(u);
  if (s.pulse && !tm.edit) sc *= 1 + 0.06 * Math.sin(t * 3.2);
  ctx.rotate(rot); ctx.scale(Math.max(0.001, sc), Math.max(0.001, sc));
  if (L.anim === 'wipe' && u < 1) { ctx.beginPath(); ctx.rect(-W / 2 - 40 * unit, -H / 2 - 40 * unit, (W + 80 * unit) * easeOut(u), H + 80 * unit); ctx.clip(); }
  const sw = (+s.strokeWidth || 0) * unit;
  const strokeCol = s.stroke || '#ffffff';
  const drawK = L.anim === 'draw' ? clamp(u / 0.7, 0, 1) : 1, fillK = L.anim === 'draw' ? clamp((u - 0.55) / 0.45, 0, 1) : 1;
  if (s.glow) { ctx.shadowColor = strokeCol; ctx.shadowBlur = 16 * unit; }
  const setDash = (len) => {
    if (s.dash === 'dashed') ctx.setLineDash([sw * 3 + 6 * unit, sw * 2 + 5 * unit]);
    else if (s.dash === 'dotted') { ctx.setLineDash([0.01, sw * 2.2 + 4 * unit]); ctx.lineCap = 'round'; }
    else if (s.dash === 'marching') { ctx.setLineDash([sw * 3 + 8 * unit, sw * 2 + 6 * unit]); ctx.lineDashOffset = -t * 30 * unit; }
    else ctx.setLineDash([]);
    if (drawK < 1) { ctx.setLineDash([len * drawK, len]); ctx.lineDashOffset = 0; }
  };
  if (s.type === 'line' || s.type === 'arrow') {
    const x0 = -W / 2, x1 = -W / 2 + W * drawK;
    ctx.strokeStyle = strokeCol; ctx.lineWidth = Math.max(1, sw); ctx.lineCap = 'round';
    if (s.dash && s.dash !== 'solid') { setDash(W); }
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(s.type === 'arrow' ? x1 - Math.max(1, sw) * 2 * (+s.head || 1) : x1, 0); ctx.stroke();
    ctx.setLineDash([]);
    if (s.type === 'arrow' && drawK > 0.05) {
      const hs = (Math.max(2, sw) * 3.2 + 8 * unit) * (+s.head || 1);
      ctx.fillStyle = strokeCol; ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1 - hs, -hs * 0.6); ctx.lineTo(x1 - hs, hs * 0.6); ctx.closePath(); ctx.fill();
    }
  } else if (s.type === 'bracket') {
    const b = Math.min(W, H) * 0.22, rx = W / 2, ry = H / 2;
    ctx.strokeStyle = strokeCol; ctx.lineWidth = Math.max(1, sw); ctx.lineCap = 'square';
    ctx.globalAlpha *= drawK;
    for (const [px, py, dx, dy] of [[-rx, -ry, 1, 1], [rx, -ry, -1, 1], [-rx, ry, 1, -1], [rx, ry, -1, -1]]) { ctx.beginPath(); ctx.moveTo(px, py + dy * b); ctx.lineTo(px, py); ctx.lineTo(px + dx * b, py); ctx.stroke(); }
  } else {
    shapePath(ctx, s, W, H);
    if (+s.fillOpacity > 0 && fillK > 0) { ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = hexA(s.fill || '#ff3b30', clamp(+s.fillOpacity, 0, 1) * fillK); ctx.fill('evenodd'); ctx.restore(); }
    if (sw > 0) { ctx.strokeStyle = strokeCol; ctx.lineWidth = sw; ctx.lineJoin = 'round'; setDash(pathLength(s, W, H)); shapePath(ctx, s, W, H); ctx.stroke(); }
  }
  if (s.label) {
    ctx.setLineDash([]); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * unit;
    ctx.rotate(-rot);
    ctx.fillStyle = s.labelColor || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha *= L.anim === 'draw' ? fillK : 1;
    ctx.font = `800 ${20 * unit * (+s.labelSize || 1)}px "Antarctica Expanded","Inter",system-ui,sans-serif`;
    ctx.fillText(s.label, 0, s.type === 'line' || s.type === 'arrow' ? -H : 1 * unit, Math.max(40 * unit, W * 0.9));
  }
  ctx.restore();
}
