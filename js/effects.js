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
  t.filter = `blur(${r.toFixed(1)}px)`;
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
