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
    header: true, logo: '', logoName: '', headerScale: 1,
    lower: true,
    country: 'NEPAL', place: 'BUDHI GANDAKI RIVER', date: `${d.getDate()} - ${M[d.getMonth()]} - ${d.getFullYear()}`,
    ticker: 'Heavy rain upstream raises the level of water downstream | 5 people reported missing. | 96 people evacuated from riverside villages',
    speed: 1, color: '#292a66', font: 'Lexend', animate: true,
  };
}

let builtIn = null;
function headerImage(brand) {
  if (brand.logo) { const im = imageFor(brand.logo); return im?.bmp || null; }
  if (!builtIn) { builtIn = new Image(); builtIn.src = 'assets/brand/header.png'; }
  return builtIn.complete && builtIn.naturalWidth ? builtIn : null;
}
/** Resolves when the logo strip is ready to draw (for export). */
export function preloadBrand(brand) {
  if (!brand?.header) return Promise.resolve();
  if (brand.logo) return imageFor(brand.logo)?.p || Promise.resolve();
  headerImage(brand);
  return builtIn.complete ? Promise.resolve() : new Promise((res) => { builtIn.onload = res; builtIn.onerror = res; });
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
      const k = clamp(+brand.headerScale || 1, 0.4, 2);
      const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight;
      const dw = w * k, dh = dw * (ih / iw);
      ctx.drawImage(im, x + (w - dw) / 2, y, dw, dh);
    }
  }
  if (brand.lower) {
    const navy = brand.color || '#292a66';
    const F = `"${brand.font || 'Lexend'}", "Montserrat", "Inter", sans-serif`;
    const r1 = h * 0.088, r2 = h * 0.064;
    const slide = brand.animate === false ? 1 : easeOut(t / 0.7);
    const top = y + h - (r1 + r2) * slide;
    const bw = w * 0.067, bx = x + w - bw;
    // row 1: white bar with the country tag and place name
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, top, w - bw, r1);
    ctx.fillStyle = navy; ctx.fillRect(bx, top, bw, r1);
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
    const dw = w * 0.155;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y2, dw, r2);
    ctx.fillStyle = navy; ctx.fillRect(x + dw, y2, bx - x - dw, r2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, y2, bw, r2);
    ctx.fillStyle = navy; ctx.fillRect(bx + bw * 0.24, y2 + r2 * 0.12, bw * 0.55, r2 * 0.62);
    ctx.fillStyle = '#0b0b10'; ctx.font = `400 ${r2 * 0.42}px ${F}`; ctx.textAlign = 'center';
    ctx.fillText(String(brand.date || ''), x + dw / 2, y2 + r2 * 0.58, dw * 0.92);
    // ticker
    const items = String(brand.ticker || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (items.length) {
      const txt = `${items.join('  |  ')}  |  `;
      ctx.save();
      ctx.beginPath(); ctx.rect(x + dw, y2, bx - x - dw, r2); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.font = `400 ${r2 * 0.66}px ${F}`; ctx.textAlign = 'left';
      const tw = Math.max(1, ctx.measureText(txt).width);
      const off = (Math.max(0, t - 0.6) * 130 * unit * (+brand.speed || 1)) % tw;
      for (let xx = x + dw + w * 0.02 - off; xx < bx; xx += tw) ctx.fillText(txt, xx, y2 + r2 * 0.54);
      ctx.restore();
    }
  }
  ctx.restore();
}
