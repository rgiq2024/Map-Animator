// Project branding drawn on every scene: the logo strip across the top and a two-row lower third
// (country tag, place name, date and a scrolling news ticker) in the house navy.
import { imageFor } from './geoimage.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;

export function defaultBrand() {
  const d = new Date();
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    v: 1,
    _aligned: true, header: true, logo: '', logoName: '', headerScale: 1, headerAlign: 'edges', headerPlace: 'top', headerY: 0, headerX: 0, headerSpread: 0, leftX: 0, rightX: 0, lowerY: 0,
    lower: true,
    country: 'NEPAL', place: 'BUDHI GANDAKI RIVER', date: `${d.getDate()} - ${M[d.getMonth()]} - ${d.getFullYear()}`,
    ticker: 'Heavy rain upstream raises the level of water downstream | 5 people reported missing. | 96 people evacuated from riverside villages',
    speed: 1, color: '#292a66', font: BRAND_FONT, animate: true,
    // the logo strip as it was last placed (any project) is the starting point for new projects
    ...lastLogoPlacement(),
  };
}
const LOGO_KEYS = ['header', 'logo', 'logoName', 'headerScale', 'headerAlign', 'headerPlace', 'headerY', 'headerX', 'headerSpread', 'leftX', 'rightX', 'lowerY'];
function lastLogoPlacement() {
  try { const v = JSON.parse(localStorage.getItem('ma.logoPlacement') || 'null'); if (v && !v.headerAlign) return v.logo ? { logo: v.logo, logoName: v.logoName } : {}; return v && typeof v === 'object' ? Object.fromEntries(LOGO_KEYS.filter((k) => k in v).map((k) => [k, v[k]])) : {}; } catch { return {}; }
}
/** Remember where the logo strip was placed (its file, size and position) for the next new project. */
export function rememberLogoPlacement(b) {
  try { localStorage.setItem('ma.logoPlacement', JSON.stringify(Object.fromEntries(LOGO_KEYS.map((k) => [k, b?.[k]])))); } catch { /* private mode */ }
}

// Antarctica Expanded (supplied with the project) for the lower third and ticker
const BRAND_FONT = 'Antarctica Expanded';
let fontsP = null;
export function loadBrandFonts() {
  if (fontsP) return fontsP;
  if (typeof FontFace === 'undefined' || !document.fonts) return (fontsP = Promise.resolve());
  const files = [[300, 'Light'], [400, ''], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold']];
  fontsP = Promise.all(files.map(([wt, n]) => new FontFace(BRAND_FONT, `url(assets/fonts/Antarctica-Expanded${n}.otf)`, { weight: String(wt) }).load().then((f) => { document.fonts.add(f); }).catch(() => {})));
  return fontsP;
}

let builtIn = null;
function headerImage(brand) {
  if (brand.logo) { const im = imageFor(brand.logo); return im?.bmp || null; }
  if (!builtIn) { builtIn = new Image(); builtIn.src = 'assets/brand/header.png'; }
  return builtIn.complete && builtIn.naturalWidth ? builtIn : null;
}
/** A copy of a logo strip with its flat background colour turned transparent (cached). */
const knocked = new WeakMap();
function knockout(im) {
  if (knocked.has(im)) return knocked.get(im);
  let out = im;
  try {
    const W = im.width || im.naturalWidth, H = im.height || im.naturalHeight;
    const sc = Math.min(1, 2400 / W);
    const c = document.createElement('canvas'); c.width = Math.round(W * sc); c.height = Math.round(H * sc);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    // background = the corner colour (a flat panel, or the dark see-through shading of the default strip)
    const br = p[0], bg = p[1], bb = p[2];
    for (let i = 0; i < p.length; i += 4) {
      const dist = Math.abs(p[i] - br) + Math.abs(p[i + 1] - bg) + Math.abs(p[i + 2] - bb);
      if (dist < 60) p[i + 3] = Math.round(p[i + 3] * clamp((dist - 18) / 42, 0, 1));
    }
    g.putImageData(d, 0, 0);
    out = c;
  } catch { out = im; }
  knocked.set(im, out);
  return out;
}
// ---- logo strip geometry: size, place and the left / centre / right thirds
const EDGE = 0.03, TOPM = 0.022;
/** where the strip and its three parts go. Aligned (the default): the left logo sits on the left margin, the right logo on the right margin, the logos close to the top. */
function stripGeom(b, im, x, y, w, h) {
  const k = clamp(+b.headerScale || 1, 0.4, 2);
  const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight;
  const dw = w * k, dh = dw * (ih / iw);
  const aligned = b.headerAlign !== 'free';
  const ink = inkBox(im);
  let ly = b.headerPlace === 'bottom' ? y + h - dh - (b.lower ? h * 0.152 : 0) : y;
  if (aligned) ly = b.headerPlace === 'bottom' ? ly + (1 - ink.y1) * dh - h * TOPM : y + h * TOPM - ink.y0 * dh;
  ly += (+b.headerY || 0) * h;
  const x0 = x + (w - dw) / 2 + (+b.headerX || 0) * w;
  let sp = aligned ? 0 : (+b.headerSpread || 0) * w, lx = (+b.leftX || 0) * w, rx = (+b.rightX || 0) * w;
  if (aligned && ink.l1 > ink.l0) {
    lx += x + w * EDGE - (x0 + ink.l0 * dw);            // left logo's first pixel on the left margin
    rx += x + w * (1 - EDGE) - (x0 + ink.r1 * dw);      // right logo's last pixel on the right margin
  }
  return { k, dw, dh, ly, sp, lx, rx, x0, ink };
}
const inkBoxes = new WeakMap();
/** logo pixels of the strip: rows y0..y1, left third from l0, right third to r1 (fractions of the strip) */
function inkBox(im) {
  if (inkBoxes.has(im)) return inkBoxes.get(im);
  let box = { y0: 0, y1: 1, l0: 0, l1: 0, r1: 1 };
  try {
    const src = knockout(im);
    const c = document.createElement('canvas'); c.width = Math.min(900, src.width); c.height = Math.max(1, Math.round(c.width * (src.height / src.width)));
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
    const p = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    let y0 = -1, y1 = -1, l0 = W, l1 = -1, r1 = -1;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      if (p[(yy * W + xx) * 4 + 3] <= 120) continue;
      if (y0 < 0) y0 = yy; y1 = yy;
      if (xx < W / 3) { l0 = Math.min(l0, xx); l1 = Math.max(l1, xx); }
      if (xx >= (2 * W) / 3) r1 = Math.max(r1, xx);
    }
    if (y0 >= 0) box = { y0: y0 / H, y1: (y1 + 1) / H, l0: l1 >= 0 ? l0 / W : 0, l1: l1 >= 0 ? (l1 + 1) / W : 0, r1: r1 >= 0 ? (r1 + 1) / W : 1 };
  } catch { /* whole strip */ }
  inkBoxes.set(im, box);
  return box;
}

// ---- where the logo strip ends, so layouts (briefing frames) can keep clear of it
let activeBrand = null;
export const setActiveBrand = (b) => { activeBrand = b || null; };
const inkRows = new WeakMap();
/** first and last row (0..1 of the strip height) that hold logo pixels, ignoring the see-through shading */
function inkExtent(im) {
  if (inkRows.has(im)) return inkRows.get(im);
  let ext = [0, 1];
  try {
    const src = knockout(im);
    const c = document.createElement('canvas'); c.width = Math.min(800, src.width); c.height = Math.max(1, Math.round(c.width * (src.height / src.width)));
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, c.width, c.height);
    const p = g.getImageData(0, 0, c.width, c.height).data;
    let first = -1, last = -1;
    for (let y = 0; y < c.height; y++) { let n = 0; for (let x = 0; x < c.width; x++) if (p[(y * c.width + x) * 4 + 3] > 120) n++; if (n > 0) { if (first < 0) first = y; last = y; } }
    if (last >= 0) ext = [first / c.height, (last + 1) / c.height];
  } catch { /* keep the whole strip */ }
  inkRows.set(im, ext);
  return ext;
}
/** { top, bottom }: fractions of the frame height taken by the logo strip at the top / bottom (0 when off). */
export function brandSafeArea(fw, fh) {
  const b = activeBrand;
  if (!b?.header || !fw || !fh) return { top: 0, bottom: 0 };
  const im = headerImage(b);
  if (!im) return { top: 0, bottom: 0 };
  const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight;
  if (!iw || !ih) return { top: 0, bottom: 0 };
  const { dh, ly } = stripGeom(b, im, 0, 0, fw, fh);
  const [e0, e1] = inkExtent(im);
  const gap = fh * 0.02;
  return b.headerPlace === 'bottom' ? { top: 0, bottom: Math.max(0, (fh - (ly + e0 * dh) + gap) / fh) } : { top: Math.max(0, (ly + e1 * dh + gap) / fh), bottom: 0 };
}
/** Resolves when the logo strip is ready to draw (for export). */
export function preloadBrand(brand) {
  loadBrandFonts();
  if (!brand?.header) return fontsP;
  if (brand.logo) return imageFor(brand.logo)?.p || Promise.resolve();
  headerImage(brand);
  return Promise.all([fontsP, builtIn.complete ? null : new Promise((res) => { builtIn.onload = res; builtIn.onerror = res; })]);
}

/**
 * Draw the branding. frame = video frame in canvas units, unit = px per design px,
 * t = time into the scene (ticker scroll and slide-in), first = whether this is the first scene.
 */
export function drawBranding(ctx, brand, frame, unit, t) {
  if (!brand || (!brand.header && !brand.lower)) return;
  const { x, y, w, h } = frame;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (brand.header) {
    const im = headerImage(brand);
    if (im) {
      const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight;
      const G = stripGeom(brand, im, x, y, w, h);
      const { dw, dh, ly, sp, lx, rx, x0 } = G;
      if (sp || Math.abs(lx) > 0.5 || Math.abs(rx) > 0.5) {
        // the strip's own background is made see-through first, so moving its thirds leaves no seams
        const src = knockout(im);
        // one even shade across the top instead of the strip's own (so the moved parts join up)
        const sg = ctx.createLinearGradient(0, ly, 0, ly + dh); sg.addColorStop(0, 'rgba(0,0,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(x, ly, w, dh);
        const sw = src.width || iw, sh = src.height || ih, t3 = sw / 3;
        ctx.drawImage(src, 0, 0, t3, sh, x0 - sp + lx, ly, dw / 3, dh);
        ctx.drawImage(src, t3, 0, t3, sh, x0 + dw / 3, ly, dw / 3, dh);
        ctx.drawImage(src, 2 * t3, 0, sw - 2 * t3, sh, x0 + (2 * dw) / 3 + sp + rx, ly, dw / 3, dh);
      } else ctx.drawImage(im, x0, ly, dw, dh);
    }
  }
  if (brand.lower) {
    const navy = brand.color || '#292a66';
    const F = `"${brand.font || BRAND_FONT}", "Lexend", "Montserrat", "Inter", sans-serif`;
    const r1 = Math.round(h * 0.088), r2 = Math.round(h * 0.064);
    const slide = brand.animate === false ? 1 : easeOut(t / 0.7);
    const top = Math.round(y + h - (r1 + r2) * slide - (+brand.lowerY || 0) * h);
    const bw = Math.round(w * 0.067), bx = x + w - bw;
    // one white backing under both rows (no seam between them)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, top, w, r1 + r2 + 2);
    // row 1: country tag and place name
    ctx.fillStyle = navy; ctx.fillRect(bx, top, bw, r1 + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bw * 0.24, top + r1 * 0.24, bw * 0.42, r1 * 0.5);
    const sq = r1 * 0.44;
    ctx.fillStyle = navy; ctx.fillRect(x + w * 0.016, top + (r1 - sq) / 2, sq, sq);
    const fs1 = r1 * 0.55;
    const reveal = brand.animate === false ? 1 : clamp((t - 0.5) / 0.6, 0, 1);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b0b10';
    ctx.save(); ctx.globalAlpha *= reveal;
    ctx.font = `700 ${fs1}px ${F}`; ctx.textAlign = 'left';
    ctx.fillText(String(brand.country || '').toUpperCase(), x + w * 0.016 + sq + w * 0.012, top + r1 * 0.52, w * 0.4);
    ctx.font = `400 ${fs1}px ${F}`; ctx.textAlign = 'right';
    ctx.fillText(String(brand.place || '').toUpperCase(), bx - w * 0.009, top + r1 * 0.52, w * 0.5);
    ctx.restore();
    // row 2: date, navy ticker band, end block
    const y2 = top + r1;
    const dw = Math.round(w * 0.155);
    ctx.fillStyle = navy; ctx.fillRect(x + dw, y2, bx - x - dw, r2 + 2);
    ctx.fillStyle = navy; ctx.fillRect(bx + bw * 0.24, y2 + r2 * 0.12, bw * 0.55, r2 * 0.62);
    ctx.fillStyle = '#0b0b10'; ctx.font = `400 ${r2 * 0.42}px ${F}`; ctx.textAlign = 'center';
    ctx.fillText(String(brand.date || ''), x + dw / 2, y2 + r2 * 0.58, dw * 0.92);
    // ticker
    const items = String(brand.ticker || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (items.length) {
      const txt = `${items.join('  |  ')}  |  `;
      ctx.save();
      ctx.beginPath(); ctx.rect(x + dw, y2, bx - x - dw, r2 + 2); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.font = `400 ${r2 * 0.66}px ${F}`; ctx.textAlign = 'left';
      const tw = Math.max(1, ctx.measureText(txt).width);
      const off = (Math.max(0, t - 0.6) * 130 * unit * (+brand.speed || 1)) % tw;
      for (let xx = x + dw + w * 0.02 - off; xx < bx; xx += tw) ctx.fillText(txt, xx, y2 + r2 * 0.54);
      ctx.restore();
    }
  }
  ctx.restore();
}
