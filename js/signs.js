// Sign styles drawn on a 2D canvas. Every sign stands on its map point (x, y = ground anchor).
// `s` is the scale (canvas px per sign unit), `k` the appear animation 0..1.

export const SIGN_TYPES = {
  board:    { name: 'Plain board',     desc: 'White board on a dark post', text: 'Sign' },
  standing: { name: 'Standing sign',   desc: 'Board with an edge and a shadow on the ground', text: 'Sign' },
  pointer:  { name: 'Trail pointer',   desc: 'Yellow arrow on a metal pole, like hiking signs', text: 'Sign', flip: true },
  pill:     { name: 'Pill marker',     desc: 'Rounded white tag with a green dot', text: 'Sign' },
  callout:  { name: 'Callout card',    desc: 'Floating card with a detail line', text: 'Sign', detail: '1,875 m' },
  summit:   { name: 'Summit flag',     desc: 'Red pennant for peaks, passes and finishes', text: 'Sign', detail: '1,875 m' },
  night:    { name: 'Night board',     desc: 'Dark glowing board for dark maps', text: 'Sign' },
  plaque:   { name: 'Treasure plaque', desc: 'Parchment on a wooden stake', text: 'Sign' },
  warning:  { name: 'Warning',         desc: 'Yellow warning triangle, your text on a white plate below', text: 'Sign' },
  accident: { name: 'Accident',        desc: 'Big red X, your text on a white plate below', text: 'Sign' },
  camp:     { name: 'Camp',            desc: 'A green tent for a camp spot, with an optional name above it', text: '' },
  start:    { name: 'Start banner',    desc: 'A black and white race arch over the route, your text on the banner', text: 'START' },
  finish:   { name: 'Finish flag',     desc: 'A chequered flag, with an optional text below it', text: '' },
  hotel:    { name: 'Hotel',           desc: 'A blue hotel road sign with a bed, the name on a plate below', text: 'Hotel' },
  photo:    { name: 'Photo',           desc: 'Your photo as an instant print, with a caption', text: 'Caption', image: true },
  custom:   { name: 'Your own',        desc: 'Your own picture standing on the map: an SVG, or a PNG with a see-through background', text: '', image: true },
};

const UI0 = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
let UI = UI0; // replaced by the sign's own font while it is drawn
const HAND = '"Caveat","Segoe Print","Bradley Hand",cursive';
const SERIF = 'Georgia,"Times New Roman",serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (u) => { u = clamp(u, 0, 1); const c = 1.6; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function groundShadow(ctx, x, y, w, h, s, skew = 0.9) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * skew, y - h * 0.18);
  ctx.lineTo(x + w * skew + w * 0.6, y - h * 0.18);
  ctx.lineTo(x + w * 0.6, y);
  ctx.closePath();
  ctx.filter = `blur(${2 * s}px)`;
  ctx.fill();
  ctx.restore();
}
function post(ctx, x, y, h, w, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - h, w, h);
}
function text(ctx, str, x, y, font, color, align = 'center') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}
function measure(ctx, str, font) { ctx.font = font; return ctx.measureText(str || '').width; }
function plate(ctx, cx, top, str, s, opts = {}) {
  const font = `700 ${opts.size || 15 * s}px ${opts.family || UI}`;
  const tw = measure(ctx, str, font);
  const w = tw + 20 * s, h = (opts.h || 28) * s;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6 * s;
  ctx.shadowOffsetY = 2 * s;
  ctx.fillStyle = opts.bg || '#ffffff';
  rr(ctx, cx - w / 2, top, w, h, (opts.r ?? 4) * s);
  ctx.fill();
  ctx.restore();
  if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = (opts.bw || 2) * s; rr(ctx, cx - w / 2, top, w, h, (opts.r ?? 4) * s); ctx.stroke(); }
  text(ctx, str, cx, top + h / 2 + 0.5 * s, font, opts.fg || '#16181d');
  return { w, h };
}

const imageCache = new Map();
export function signImage(src) {
  if (!src) return null;
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
export function preloadSignImages(signs) {
  return Promise.all((signs || []).filter((s) => s.image).map((s) => new Promise((res) => {
    signImage(s.image);
    const img = imageCache.get(s.image);
    if (img.complete) res(); else { img.onload = res; img.onerror = res; }
  })));
}

const DRAW = {
  board(ctx, sg, x, y, s) {
    const label = sg.text || ' ';
    const font = `700 ${17 * s}px ${UI}`;
    const w = measure(ctx, label, font) + 24 * s, h = 34 * s, pole = 30 * s;
    post(ctx, x, y, pole + 2 * s, 3.5 * s, '#2b2b2b');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8 * s; ctx.shadowOffsetY = 3 * s;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x - w / 2, y - pole - h, w, h, 3 * s); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.5 * s; rr(ctx, x - w / 2, y - pole - h, w, h, 3 * s); ctx.stroke();
    text(ctx, label, x, y - pole - h / 2 + s, font, '#16181d');
    return [x - w / 2, y - pole - h, x + w / 2, y];
  },
  standing(ctx, sg, x, y, s) {
    const label = sg.text || ' ';
    const font = `700 ${17 * s}px ${UI}`;
    const w = measure(ctx, label, font) + 26 * s, h = 34 * s, pole = 28 * s;
    groundShadow(ctx, x, y, w * 0.9, pole + h, s);
    post(ctx, x, y, pole + 2 * s, 4 * s, '#3a3a3a');
    ctx.fillStyle = '#9aa0a8';
    rr(ctx, x - w / 2 + 3 * s, y - pole - h + 3 * s, w, h, 3 * s); ctx.fill();
    ctx.fillStyle = '#ffffff';
    rr(ctx, x - w / 2, y - pole - h, w, h, 3 * s); ctx.fill();
    ctx.strokeStyle = '#1d1f23'; ctx.lineWidth = 2 * s; rr(ctx, x - w / 2 + 3 * s, y - pole - h + 3 * s, w - 6 * s, h - 6 * s, 2 * s); ctx.stroke();
    text(ctx, label, x, y - pole - h / 2 + s, font, '#16181d');
    return [x - w / 2, y - pole - h, x + w / 2 + 3 * s, y];
  },
  pointer(ctx, sg, x, y, s) {
    const label = sg.text || ' ';
    const font = `700 ${16 * s}px ${UI}`;
    const tw = measure(ctx, label, font);
    const w = tw + 34 * s, h = 30 * s, pole = 34 * s, tip = 14 * s;
    const dir = sg.flip ? -1 : 1;
    groundShadow(ctx, x, y, w, pole + h, s);
    post(ctx, x, y, pole + h + 6 * s, 4 * s, '#8b9096');
    const top = y - pole - h;
    const x0 = x - 8 * s * dir;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s;
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x0 + (w - tip) * dir, top);
    ctx.lineTo(x0 + w * dir, top + h / 2);
    ctx.lineTo(x0 + (w - tip) * dir, top + h);
    ctx.lineTo(x0, top + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#c9a200'; ctx.lineWidth = 1.2 * s; ctx.stroke();
    ctx.fillStyle = '#c62828';
    ctx.fillRect(x0 + (dir > 0 ? 4 * s : -10 * s), top + h / 2 - 3 * s, 6 * s, 6 * s);
    text(ctx, label, x0 + ((w - tip) / 2 + 6 * s) * dir, top + h / 2 + s, font, '#1d1d1d');
    const xa = Math.min(x0, x0 + w * dir), xb = Math.max(x0, x0 + w * dir);
    return [xa, top, xb, y];
  },
  pill(ctx, sg, x, y, s) {
    const label = (sg.text || ' ').toUpperCase();
    const font = `800 ${14 * s}px ${UI}`;
    ctx.font = font;
    const tw = ctx.measureText(label).width + label.length * 1.2 * s;
    const w = tw + 46 * s, h = 32 * s, stem = 26 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x, y - 3 * s); ctx.lineTo(x, y - stem); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, 7 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#2fbf71'; ctx.lineWidth = 2 * s; ctx.stroke();
    const top = y - stem - h;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 10 * s; ctx.shadowOffsetY = 3 * s;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x - w / 2, top, w, h, h / 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2fbf71';
    ctx.beginPath(); ctx.arc(x - w / 2 + 17 * s, top + h / 2, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.font = font; ctx.fillStyle = '#16181d'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if ('letterSpacing' in ctx) { ctx.letterSpacing = `${1.2 * s}px`; }
    ctx.fillText(label, x - w / 2 + 30 * s, top + h / 2 + s);
    ctx.restore();
    return [x - w / 2, top, x + w / 2, y + 4 * s];
  },
  callout(ctx, sg, x, y, s) {
    const label = sg.text || ' ', det = sg.detail || '';
    const f1 = `800 ${17 * s}px ${UI}`, f2 = `500 ${12.5 * s}px ${UI}`;
    const w = Math.max(measure(ctx, label, f1), measure(ctx, det, f2)) + 30 * s;
    const h = (det ? 50 : 34) * s, gap = 16 * s;
    const top = y - gap - h;
    ctx.fillStyle = '#1d1f23';
    ctx.beginPath(); ctx.arc(x, y, 3.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 12 * s; ctx.shadowOffsetY = 4 * s;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x - w / 2, top, w, h, 6 * s); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7 * s, top + h - 1); ctx.lineTo(x, top + h + 8 * s); ctx.lineTo(x + 7 * s, top + h - 1); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2fbf71'; ctx.fillRect(x - w / 2, top + 6 * s, 4 * s, h - 12 * s);
    text(ctx, label, x - w / 2 + 15 * s, top + (det ? 18 : 17) * s, f1, '#16181d', 'left');
    if (det) text(ctx, det, x - w / 2 + 15 * s, top + 36 * s, f2, '#5b616e', 'left');
    return [x - w / 2, top, x + w / 2, y + 4 * s];
  },
  summit(ctx, sg, x, y, s) {
    const label = sg.text || ' ', det = sg.detail || '';
    const f1 = `800 ${15 * s}px ${UI}`, f2 = `600 ${10.5 * s}px ${UI}`;
    const w = Math.max(measure(ctx, label, f1), measure(ctx, det, f2)) + 34 * s;
    const h = (det ? 42 : 30) * s, pole = 62 * s;
    groundShadow(ctx, x, y, w, pole, s);
    post(ctx, x, y, pole, 3 * s, '#5a5f66');
    const top = y - pole;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s;
    ctx.fillStyle = '#e02424';
    ctx.beginPath();
    ctx.moveTo(x + 1.5 * s, top);
    ctx.lineTo(x + w, top + 3 * s);
    ctx.lineTo(x + w - 12 * s, top + h / 2);
    ctx.lineTo(x + w, top + h - 3 * s);
    ctx.lineTo(x + 1.5 * s, top + h);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    text(ctx, label, x + 9 * s, top + (det ? 15 * s : h / 2 + s), f1, '#ffffff', 'left');
    if (det) text(ctx, det, x + 9 * s, top + 31 * s, f2, 'rgba(255,255,255,0.9)', 'left');
    return [x - 2 * s, top, x + w, y];
  },
  night(ctx, sg, x, y, s) {
    const label = sg.text || ' ';
    const font = `700 ${17 * s}px ${UI}`;
    const w = measure(ctx, label, font) + 26 * s, h = 36 * s, pole = 28 * s;
    post(ctx, x, y, pole + 2 * s, 3.5 * s, '#15171a');
    const top = y - pole - h;
    ctx.save();
    ctx.shadowColor = 'rgba(120,200,255,0.55)'; ctx.shadowBlur = 16 * s;
    ctx.fillStyle = '#1b1e24';
    rr(ctx, x - w / 2, top, w, h, 5 * s); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5 * s; rr(ctx, x - w / 2, top, w, h, 5 * s); ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 8 * s;
    text(ctx, label, x, top + h / 2 + s, font, '#ffffff');
    ctx.restore();
    return [x - w / 2, top, x + w / 2, y];
  },
  plaque(ctx, sg, x, y, s) {
    const label = sg.text || ' ';
    const font = `italic 600 ${18 * s}px ${SERIF}`;
    const w = measure(ctx, label, font) + 30 * s, h = 36 * s, pole = 30 * s;
    groundShadow(ctx, x, y, w * 0.8, pole + h, s);
    ctx.fillStyle = '#7a4f2a';
    ctx.beginPath(); ctx.moveTo(x - 3 * s, y - pole); ctx.lineTo(x + 3 * s, y - pole); ctx.lineTo(x + 1.5 * s, y); ctx.lineTo(x - 1.5 * s, y); ctx.fill();
    const top = y - pole - h;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s;
    ctx.fillStyle = '#f1dfb0';
    rr(ctx, x - w / 2, top, w, h, 3 * s); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2.5 * s; rr(ctx, x - w / 2, top, w, h, 3 * s); ctx.stroke();
    ctx.strokeStyle = 'rgba(138,90,43,0.45)'; ctx.lineWidth = 1 * s; rr(ctx, x - w / 2 + 4 * s, top + 4 * s, w - 8 * s, h - 8 * s, 2 * s); ctx.stroke();
    text(ctx, label, x, top + h / 2 + s, font, '#4a2e17');
    return [x - w / 2, top, x + w / 2, y];
  },
  warning(ctx, sg, x, y, s) {
    const label = sg.text || '';
    const pole = 30 * s;
    post(ctx, x, y, pole + 40 * s, 3 * s, '#8b9096');
    let top = y - pole;
    let bbox = [x - 24 * s, y - pole - 46 * s, x + 24 * s, y];
    if (label) {
      const p = plate(ctx, x, y - pole + 2 * s, label, s, { h: 22, size: 12 * s, border: '#1d1d1d', bw: 1.2, r: 2 });
      bbox = [Math.min(x - p.w / 2, bbox[0]), bbox[1], Math.max(x + p.w / 2, bbox[2]), y];
      top = y - pole;
    }
    const ts = 46 * s, ty = top - 4 * s;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s;
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.moveTo(x, ty - ts); ctx.lineTo(x + ts * 0.58, ty); ctx.lineTo(x - ts * 0.58, ty); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd21f';
    const i = 5 * s;
    ctx.beginPath(); ctx.moveTo(x, ty - ts + i * 1.7); ctx.lineTo(x + ts * 0.58 - i * 1.5, ty - i * 0.8); ctx.lineTo(x - ts * 0.58 + i * 1.5, ty - i * 0.8); ctx.closePath(); ctx.fill();
    text(ctx, '!', x, ty - ts * 0.32, `900 ${20 * s}px ${UI}`, '#1d1d1d');
    return bbox;
  },
  accident(ctx, sg, x, y, s) {
    const label = sg.text || '';
    const pole = 30 * s;
    post(ctx, x, y, pole, 3 * s, '#8b9096');
    let bbox = [x - 24 * s, y - pole - 54 * s, x + 24 * s, y];
    if (label) {
      const p = plate(ctx, x, y - pole + 2 * s, label, s, { h: 22, size: 12 * s, border: '#1d1d1d', bw: 1.2, r: 2 });
      bbox = [Math.min(x - p.w / 2, bbox[0]), bbox[1], Math.max(x + p.w / 2, bbox[2]), y];
    }
    const c = y - pole - 26 * s, r = 18 * s;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s;
    ctx.strokeStyle = '#e02424'; ctx.lineWidth = 9 * s;
    ctx.beginPath(); ctx.moveTo(x - r, c - r); ctx.lineTo(x + r, c + r); ctx.moveTo(x + r, c - r); ctx.lineTo(x - r, c + r); ctx.stroke();
    ctx.restore();
    return bbox;
  },
  camp(ctx, sg, x, y, s) {
    const w = 64 * s, h = 44 * s;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x + 8 * s, y + 1 * s, w * 0.62, 6 * s, 0, 0, Math.PI * 2); ctx.filter = `blur(${2 * s}px)`; ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2e9d48';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - 2 * s, y - h); ctx.lineTo(x + 2 * s, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#23803a';
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 - 6 * s, y); ctx.lineTo(x, y - h + 4 * s); ctx.fill();
    ctx.fillStyle = '#14552a';
    ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x, y - h * 0.62); ctx.lineTo(x + 9 * s, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x - 4 * s, y - h - 6 * s); ctx.lineTo(x + 4 * s, y - h + 4 * s); ctx.moveTo(x + 4 * s, y - h - 6 * s); ctx.lineTo(x - 4 * s, y - h + 4 * s); ctx.stroke();
    let bbox = [x - w / 2, y - h - 8 * s, x + w / 2, y];
    if (sg.text) {
      const p = plate(ctx, x, y - h - 40 * s, sg.text, s, { h: 26, size: 14 * s, r: 13 });
      bbox = [Math.min(bbox[0], x - p.w / 2), y - h - 40 * s, Math.max(bbox[2], x + p.w / 2), y];
    }
    return bbox;
  },
  start(ctx, sg, x, y, s) {
    const label = (sg.text || 'START').toUpperCase();
    const font = `900 ${16 * s}px ${UI}`;
    const tw = measure(ctx, label, font);
    const w = Math.max(tw + 70 * s, 110 * s), h = 26 * s, pole = 58 * s;
    groundShadow(ctx, x - w / 2, y, w, pole, s, 0.5);
    ctx.fillStyle = '#b8bcc2';
    ctx.fillRect(x - w / 2 - 2 * s, y - pole - h, 4 * s, pole + h);
    ctx.fillRect(x + w / 2 - 2 * s, y - pole - h, 4 * s, pole + h);
    const top = y - pole - h;
    // chequered ends
    const cs = h / 2;
    for (let side = 0; side < 2; side++) {
      const bx = side ? x + w / 2 - 3 * cs : x - w / 2;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#111111';
        ctx.fillRect(bx + i * cs, top + j * cs, cs, cs);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w / 2 + 3 * cs, top, w - 6 * cs, h);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2 * s; ctx.strokeRect(x - w / 2, top, w, h);
    text(ctx, label, x, top + h / 2 + s, font, '#111111');
    return [x - w / 2 - 2 * s, top, x + w / 2 + 2 * s, y];
  },
  finish(ctx, sg, x, y, s) {
    const pole = 60 * s, fw = 40 * s, fh = 28 * s;
    groundShadow(ctx, x, y, fw, pole, s);
    post(ctx, x, y, pole, 3 * s, '#3a3d42');
    const top = y - pole, cs = fw / 6;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#111111';
      const wave = Math.sin(i / 1.8) * 2 * s;
      ctx.fillRect(x + 1.5 * s + i * cs, top + j * (fh / 4) + wave, cs + 0.5, fh / 4 + 0.5);
    }
    let bbox = [x - 2 * s, top - 3 * s, x + fw + 3 * s, y];
    if (sg.text) {
      const p = plate(ctx, x, y - 26 * s, sg.text, s, { h: 22, size: 12 * s, border: '#1d1d1d', bw: 1.2, r: 2 });
      bbox = [Math.min(bbox[0], x - p.w / 2), bbox[1], Math.max(bbox[2], x + p.w / 2), y];
    }
    return bbox;
  },
  hotel(ctx, sg, x, y, s) {
    const pole = 26 * s, b = 40 * s;
    post(ctx, x, y, pole + b, 3 * s, '#8b9096');
    let plateTop = y - pole;
    let bbox = [x - b / 2, y - pole - b - 26 * s, x + b / 2, y];
    if (sg.text) {
      const p = plate(ctx, x, plateTop - 2 * s, sg.text, s, { h: 22, size: 12 * s, border: '#1d1d1d', bw: 1.2, r: 2 });
      bbox = [Math.min(bbox[0], x - p.w / 2), bbox[1], Math.max(bbox[2], x + p.w / 2), y];
    }
    const top = plateTop - 4 * s - b;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s;
    ctx.fillStyle = '#1565c0';
    rr(ctx, x - b / 2, top, b, b, 5 * s); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6 * s; rr(ctx, x - b / 2 + 3 * s, top + 3 * s, b - 6 * s, b - 6 * s, 3 * s); ctx.stroke();
    // bed glyph
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 12 * s, top + 12 * s, 3 * s, 18 * s);
    ctx.fillRect(x - 12 * s, top + 22 * s, 24 * s, 3.5 * s);
    ctx.fillRect(x + 9 * s, top + 22 * s, 3 * s, 8 * s);
    ctx.beginPath(); ctx.arc(x - 4.5 * s, top + 18 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
    rr(ctx, x - 1 * s, top + 15.5 * s, 13 * s, 6 * s, 2 * s); ctx.fill();
    return bbox;
  },
  photo(ctx, sg, x, y, s) {
    const img = signImage(sg.image);
    const iw = 120 * s, ih = img ? Math.min(150 * s, iw * img.naturalHeight / img.naturalWidth) : 90 * s;
    const pad = 8 * s, cap = sg.text ? 28 * s : 10 * s;
    const W = iw + pad * 2, H = ih + pad + cap;
    const stem = 18 * s;
    ctx.fillStyle = '#6b5a45';
    ctx.fillRect(x - 1.5 * s, y - stem, 3 * s, stem);
    ctx.save();
    ctx.translate(x, y - stem);
    ctx.rotate((sg.tilt ?? -3) * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14 * s; ctx.shadowOffsetY = 5 * s;
    ctx.fillStyle = '#fbfaf6';
    ctx.fillRect(-W / 2, -H, W, H);
    ctx.shadowColor = 'transparent';
    if (img) {
      // cover-fit
      const r = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
      const sw = iw / r, sh = ih / r;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, -W / 2 + pad, -H + pad, iw, ih);
    } else {
      ctx.fillStyle = '#d9d6cf'; ctx.fillRect(-W / 2 + pad, -H + pad, iw, ih);
      text(ctx, 'Add a photo', 0, -H + pad + ih / 2, `600 ${12 * s}px ${UI}`, '#8a8578');
    }
    if (sg.text) text(ctx, sg.text, 0, -cap / 2 - 1 * s, `600 ${19 * s}px ${HAND}`, '#2a2a2a');
    ctx.restore();
    return [x - W / 2 - 6 * s, y - stem - H - 6 * s, x + W / 2 + 6 * s, y];
  },
  custom(ctx, sg, x, y, s) {
    const img = signImage(sg.image);
    const h = 90 * s;
    if (!img) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.setLineDash([4 * s, 3 * s]); ctx.lineWidth = 1.5 * s;
      ctx.strokeRect(x - 30 * s, y - h, 60 * s, h); ctx.setLineDash([]);
      text(ctx, 'Image', x, y - h / 2, `600 ${12 * s}px ${UI}`, 'rgba(0,0,0,0.5)');
      return [x - 30 * s, y - h, x + 30 * s, y];
    }
    const w = h * img.naturalWidth / img.naturalHeight;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.4, 5 * s, 0, 0, Math.PI * 2); ctx.filter = `blur(${2 * s}px)`; ctx.fill();
    ctx.restore();
    ctx.drawImage(img, x - w / 2, y - h, w, h);
    if (sg.text) plate(ctx, x, y + 6 * s, sg.text, s, { h: 22, size: 12 * s, r: 11 });
    return [x - w / 2, y - h, x + w / 2, y + (sg.text ? 28 * s : 0)];
  },
};

/** Draw a sign; returns its bounding box in canvas px. */
export function drawSign(ctx, sg, x, y, s, k = 1) {
  const fn = DRAW[sg.type] || DRAW.board;
  if (k <= 0) return null;
  UI = sg.font ? `"${sg.font}", ${UI0}` : UI0;
  ctx.save();
  if (k < 1) {
    const sc = Math.max(0.001, easeOutBack(k));
    ctx.globalAlpha *= clamp(k * 2.5, 0, 1);
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.translate(-x, -y);
  }
  const bbox = fn(ctx, sg, x, y, s);
  ctx.restore();
  UI = UI0;
  return bbox;
}

/** Preview tile for the "Add a sign" picker. */
export function drawSignPreview(canvas, type) {
  const ctx = canvas.getContext('2d');
  const dpr = canvas.width / canvas.clientWidth || 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ece8df';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const t = SIGN_TYPES[type];
  const sg = { type, text: t.text || (type === 'camp' ? '' : 'Sign'), detail: t.detail || '' };
  if (type === 'start') sg.text = 'START';
  const s = 0.62 * dpr;
  drawSign(ctx, sg, canvas.width * 0.5, canvas.height * 0.92, s, 1);
}
