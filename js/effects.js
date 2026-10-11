// Lens effects: depth of field (tilt-shift style blur outside a focus band) and vignette.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let tmp = null;

/**
 * Blur the map image outside the focus band and draw it into ctx over the frame.
 * @param src the map canvas
 * @param sx,sy,sw,sh source rect in the map canvas (the video frame)
 * @param fr {x,y,w,h} destination rect in ctx
 * @param lens {dof, blur, focus (0..1 from top), band (0..1), focusY? (override 0..1)}
 * @param unit px per video unit
 */
export function drawDepthOfField(ctx, src, sx, sy, sw, sh, fr, lens, unit) {
  if (!lens?.dof || !(+lens.blur > 0)) return;
  const W = Math.max(1, Math.round(fr.w)), H = Math.max(1, Math.round(fr.h));
  if (!tmp) tmp = document.createElement('canvas');
  if (tmp.width !== W || tmp.height !== H) { tmp.width = W; tmp.height = H; }
  const t = tmp.getContext('2d');
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, W, H);
  const r = (+lens.blur) * unit;
  t.filter = `${lens.filter && lens.filter !== 'none' ? `${lens.filter} ` : ''}blur(${r.toFixed(1)}px)`;
  // draw slightly larger so the blur does not fade at the edges
  t.drawImage(src, sx, sy, sw, sh, -r * 2, -r * 2, W + r * 4, H + r * 4);
  t.filter = 'none';
  const fy = clamp(lens.focusY ?? lens.focus ?? 0.55, 0, 1);
  const band = clamp(+lens.band || 0.35, 0.05, 0.95);
  const a = clamp(fy - band / 2, 0, 1), b = clamp(fy + band / 2, 0, 1);
  const soft = 0.18;
  const g = t.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(clamp(a - soft, 0, 1), 'rgba(0,0,0,1)');
  g.addColorStop(a, 'rgba(0,0,0,0)');
  g.addColorStop(b, 'rgba(0,0,0,0)');
  g.addColorStop(clamp(b + soft, 0, 1), 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  t.globalCompositeOperation = 'destination-in';
  t.fillStyle = g;
  t.fillRect(0, 0, W, H);
  t.globalCompositeOperation = 'source-over';
  ctx.drawImage(tmp, fr.x, fr.y, fr.w, fr.h);
}

export function drawVignette(ctx, fr, amount) {
  if (!(amount > 0)) return;
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  const R = Math.hypot(fr.w, fr.h) / 2;
  const g = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${clamp(amount, 0, 1) * 0.75})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  ctx.restore();
}

// ---------------------------------------------------------------- colour grading (Lumetri-style basics)
export const GRADE_PRESETS = {
  none: { name: 'None' },
  warm: { name: 'Warm', brightness: 1.03, contrast: 1.05, saturation: 1.1, warmth: 0.45 },
  cool: { name: 'Cool', contrast: 1.06, warmth: -0.45 },
  golden: { name: 'Golden hour', brightness: 1.04, contrast: 1.05, saturation: 1.2, warmth: 0.8 },
  cinematic: { name: 'Cinematic', brightness: 0.97, contrast: 1.18, saturation: 1.2, warmth: 0.12, fade: 0.04 },
  vivid: { name: 'Vivid', contrast: 1.1, saturation: 1.5 },
  muted: { name: 'Muted', contrast: 0.95, saturation: 0.6, fade: 0.08 },
  vintage: { name: 'Vintage', brightness: 1.05, contrast: 0.88, saturation: 0.72, warmth: 0.5, fade: 0.12 },
  night: { name: 'Night', brightness: 0.6, contrast: 1.12, saturation: 0.75, warmth: -0.6 },
  bw: { name: 'Black & white', contrast: 1.15, bw: true },
  noir: { name: 'Noir', brightness: 0.9, contrast: 1.45, bw: true },
};
export function defaultGrade() { return { preset: 'none', brightness: 1, contrast: 1, saturation: 1, warmth: 0, fade: 0, bw: false }; }
export function presetGrade(key) { return { ...defaultGrade(), ...GRADE_PRESETS[key], preset: key, name: undefined }; }

/** CSS/canvas filter string for the map image. */
export function gradeFilter(g) {
  if (!g) return 'none';
  const b = +g.brightness || 1, c = +g.contrast || 1, s = g.saturation == null ? 1 : +g.saturation;
  if (b === 1 && c === 1 && s === 1 && !g.bw) return 'none';
  return `brightness(${b}) contrast(${c}) saturate(${s})${g.bw ? ' grayscale(1)' : ''}`;
}
/** Warm/cool colour wash and faded blacks, drawn over the map (under the route and labels). */
export function drawGradeWash(ctx, fr, g) {
  if (!g) return;
  const w = +g.warmth || 0;
  ctx.save();
  if (w > 0) { ctx.fillStyle = `rgba(255,146,48,${Math.min(0.3, w * 0.17)})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  if (w < 0) { ctx.fillStyle = `rgba(40,118,255,${Math.min(0.3, -w * 0.17)})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  if (+g.fade > 0) { ctx.fillStyle = `rgba(235,232,225,${Math.min(0.4, +g.fade)})`; ctx.fillRect(fr.x, fr.y, fr.w, fr.h); }
  ctx.restore();
}

// ---------------------------------------------------------------- clouds you fly through while zooming
let cloudSprites = null;
function makeCloudSprites() {
  const out = [];
  for (let v = 0; v < 5; v++) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    let s = v * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < 16; k++) {
      const cx = 128 + (r() - 0.5) * 130, cy = 128 + (r() - 0.5) * 70, rr = 30 + r() * 52;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.5, 'rgba(250,251,255,0.32)');
      g.addColorStop(1, 'rgba(240,244,250,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
    }
    out.push(c);
  }
  return out;
}
const CLOUDS = (() => {
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 46 }, () => ({ x: (r() - 0.5) * 2.6, y: (r() - 0.5) * 2.2, d: 0.45 + r() * 0.9, s: 0.18 + r() * 0.3, v: Math.floor(r() * 5), z: (r() - 0.5) * 2.5 }));
})();

/**
 * Clouds that rush past the camera while zooming (Google-Earth style).
 * zoomRef = zoom normalised to a 1000-px-wide frame; amount 0..1.
 */
export function drawClouds(ctx, fr, zoomRef, bearing, amount, unit) {
  if (!(amount > 0)) return;
  cloudSprites ||= makeCloudSprites();
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  const rot = (-bearing * Math.PI) / 180;
  const z0 = 6.2;
  ctx.save();
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
  const band = Math.exp(-(((zoomRef - z0) / 2.2) ** 2));
  if (band * amount > 0.02) {
    ctx.fillStyle = `rgba(236,241,248,${0.28 * band * amount})`;
    ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  }
  for (const c of CLOUDS) {
    const zc = z0 + c.z;
    const k = 2 ** ((zoomRef - zc) * c.d);
    const local = Math.exp(-(((zoomRef - zc) / 1.6) ** 2));
    let a = amount * local;
    const R = c.s * fr.w * k;
    if (R > fr.w * 1.1) a *= Math.max(0, 1.6 - R / fr.w);
    if (a < 0.02 || R < 4) continue;
    const px = c.x * fr.w * 0.5 * k, py = c.y * fr.h * 0.5 * k;
    const x = cx + px * Math.cos(rot) - py * Math.sin(rot), y = cy + px * Math.sin(rot) + py * Math.cos(rot);
    if (x < fr.x - R * 2 || x > fr.x + fr.w + R * 2 || y < fr.y - R || y > fr.y + fr.h + R) continue;
    ctx.globalAlpha = Math.min(1, a * 1.25);
    ctx.drawImage(cloudSprites[c.v], x - R * 1.4, y - R * 0.8, R * 2.8, R * 1.6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- stars behind the globe
let starCanvas = null;
export function starfield(w = 1600, h = 1000) {
  if (starCanvas && starCanvas.width === w && starCanvas.height === h) return starCanvas;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, '#0a1430'); g.addColorStop(1, '#010208');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  let s = 777;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / 900; i++) {
    const b = r();
    x.fillStyle = `rgba(255,255,255,${0.25 + b * 0.75})`;
    const sz = b > 0.97 ? 1.8 : b > 0.85 ? 1.2 : 0.7;
    x.beginPath(); x.arc(r() * w, r() * h, sz, 0, Math.PI * 2); x.fill();
  }
  starCanvas = c;
  return c;
}

/**
 * Radial zoom blur ("warp" while the camera dives in or pulls out): stacks scaled, faded copies of the map.
 * src region (sx,sy,sw,sh) of `src` maps onto dest rect `fr`. speed = zoom levels per second.
 */
export function drawZoomBlur(ctx, src, sx, sy, sw, sh, fr, speed, amount = 1) {
  const k = Math.min(1, Math.max(0, (Math.abs(speed) - 0.6) / 2.4)) * amount;
  if (k < 0.02) return;
  const n = 5;
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
  for (let i = 1; i <= n; i++) {
    const s = 1 + (i / n) * 0.09 * k * (speed > 0 ? 1 : 0.8);
    ctx.globalAlpha = (0.42 * k) / i ** 0.6 / 1.6;
    const w = fr.w * s, h = fr.h * s;
    try { ctx.drawImage(src, sx, sy, sw, sh, cx - w / 2, cy - h / 2, w, h); } catch { /* not ready */ }
  }
  // speed lines toward the edges
  ctx.globalAlpha = 0.25 * k;
  const g = ctx.createRadialGradient(cx, cy, Math.min(fr.w, fr.h) * 0.25, cx, cy, Math.hypot(fr.w, fr.h) * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(225,235,255,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
  ctx.restore();
}
