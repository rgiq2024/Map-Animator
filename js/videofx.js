// Your own effect clips (explosions, smoke, fire, muzzle flashes…) placed on the map. Clips on a black
// background are blended with "screen" so only the light parts show; WebM/MOV with alpha use "normal".
import { getMedia } from './store.js';
import { drawQuad, quadOf } from './geoimage.js';

const vids = new Map(); // media id → { el, ready, url }

export function videoFor(id) {
  if (!id) return null;
  let v = vids.get(id);
  if (!v) {
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    v = { el, ready: false, url: null };
    vids.set(id, v);
    getMedia(id).then((blob) => {
      if (!blob) return;
      v.url = URL.createObjectURL(blob);
      el.src = v.url;
      el.addEventListener('loadeddata', () => { v.ready = true; }, { once: true });
      el.addEventListener('error', () => { v.error = true; }, { once: true });
      el.load();
    });
  }
  return v;
}
/**
 * Keeps a clip in step with the timeline while previewing. While the timeline plays, the clip really plays
 * (smooth, no per-frame seeking) and is only nudged when it drifts; when paused or scrubbing it is seeked once.
 */
export function syncVideo(v, target, rate = 1) {
  const el = v?.el;
  if (!el || !isFinite(target)) return;
  const now = performance.now();
  const last = v.lastT, lastAt = v.lastAt || 0;
  v.lastT = target; v.lastAt = now;
  // playing = the clip time moved forward at about the speed of the clock (slow machines draw fewer frames)
  const wall = (now - lastAt) / 1000, dt = last == null ? 0 : target - last;
  const playing = dt > 0 && wall < 2 && dt < wall * (rate || 1) * 1.8 + 0.15;
  try {
    if (playing) {
      const r = Math.max(0.0625, Math.min(16, rate || 1));
      if (Math.abs(el.playbackRate - r) > 0.001) el.playbackRate = r;
      if (el.paused && !v.starting) { v.starting = true; el.play().catch(() => {}).finally(() => { v.starting = false; }); }
      if (!el.seeking && Math.abs(el.currentTime - target) > 0.35) el.currentTime = target;
    } else {
      if (!el.paused) el.pause();
      if (!el.seeking && Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
    }
  } catch { /* not seekable yet */ }
}
/** Pause every clip (the timeline was paused). */
export function pauseAllVideos() { for (const v of vids.values()) { try { v.el.pause(); } catch { /* ignore */ } v.lastT = null; } }
// pause clips the preview no longer asks for (playback stopped, layer hidden, scene changed)
setInterval(() => { const now = performance.now(); for (const v of vids.values()) if (!v.el.paused && now - (v.lastAt || 0) > 2100) { try { v.el.pause(); } catch { /* ignore */ } } }, 250);
const localTime = (L, tau, dur) => {
  const sp = +L.style.speed || 1;
  let t = Math.max(0, tau) * sp;
  if (L.style.loop && dur > 0) t %= dur;
  return Math.min(t, Math.max(0, dur - 0.04));
};
/** Seek every clip of a scene to scene time t and wait (used during export for exact frames). */
export async function seekScene(scene, t, layerTiming) {
  const jobs = [];
  for (const L of scene.layers || []) {
    const zf = L.kind === 'zoomframe';
    if ((L.kind !== 'videofx' && L.kind !== 'video' && L.kind !== 'geovideo' && !zf) || L.hidden || !(zf ? L.style.clip : L.style.media)) continue;
    const v = videoFor(zf ? L.style.clip : L.style.media);
    if (!v) continue;
    if (!v.ready) await new Promise((res) => { const to = setTimeout(res, 4000); v.el.addEventListener('loadeddata', () => { clearTimeout(to); res(); }, { once: true }); });
    const tm = layerTiming(L, t);
    if (!tm.visible) continue;
    const dur = v.el.duration || 0;
    let target;
    if (zf) { target = Math.max(0, tm.tau); if (L.style.loop !== false && dur > 0) target %= dur; target = Math.min(target, Math.max(0, dur - 0.04)); }
    else if (L.kind === 'video' || L.kind === 'geovideo') { target = Math.max(0, tm.tau) * (+L.style.speed || 1) + (+L.style.trim || 0); if (L.style.loop && dur > 0) target %= dur; target = Math.min(target, Math.max(0, dur - 0.04)); }
    else target = localTime(L, tm.tau, dur);
    if (!v.el.paused) v.el.pause();
    if (Math.abs(v.el.currentTime - target) < 0.001) continue;
    jobs.push(new Promise((res) => { const to = setTimeout(res, 3000); v.el.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true }); v.el.currentTime = target; }));
  }
  await Promise.all(jobs);
}
export function drawVideoFx(ctx, L, tm, proj, unit, exact) {
  const s = L.style;
  const v = videoFor(s.media);
  if (!L.geom) return;
  const [x, y] = proj(L.geom.coordinates);
  const H = 160 * unit * (+s.size || 1);
  if (!v || !v.ready) {
    if (tm.edit) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([5, 4]); ctx.strokeRect(x - H * 0.5, y - H * 0.8, H, H * 0.8); ctx.restore();
    }
    return;
  }
  const el = v.el;
  if (!exact) {
    const target = tm.edit ? Math.min(0.6, (el.duration || 1) * 0.3) : localTime(L, tm.tau, el.duration || 0);
    syncVideo(v, target, +s.speed || 1);
  }
  const ar = (el.videoWidth || 16) / (el.videoHeight || 9);
  const W = H * ar;
  const keyed = s.blend !== 'normal' ? unscreen(el, W, H, s.blend === 'lighter' ? 1.25 : 1) : null;
  const anchorY = s.anchor === 'center' ? 0.5 : 0.85; // explosions usually sit on the ground
  ctx.save();
  ctx.globalAlpha *= tm.alpha * (+s.opacity || 1);
  if (!keyed) ctx.globalCompositeOperation = s.blend === 'normal' ? 'source-over' : s.blend === 'lighter' ? 'lighter' : 'screen';
  ctx.translate(x, y);
  ctx.rotate(((+s.rotation || 0) * Math.PI) / 180);
  if (s.flip) ctx.scale(-1, 1);
  try { ctx.drawImage(keyed || el, -W / 2, -H * anchorY, W, H); } catch { /* frame not ready */ }
  ctx.restore();
}
// Black → transparent ("unscreen"): alpha = brightest channel, colour un-premultiplied. Looks like a screen
// blend over any background and also works on the transparent preview overlay.
let kc = null;
function unscreen(el, W, H, gain) {
  const cw = Math.max(2, Math.min(720, Math.round(W))), ch = Math.max(2, Math.round(cw * (H / W)));
  kc ||= document.createElement('canvas');
  if (kc.width !== cw || kc.height !== ch) { kc.width = cw; kc.height = ch; }
  const c = kc.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, cw, ch);
  try { c.drawImage(el, 0, 0, cw, ch); } catch { return null; }
  const img = c.getImageData(0, 0, cw, ch);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    let a = Math.max(r, g, b);
    if (a < 6) { d[i + 3] = 0; continue; }
    const k = 255 / a;
    d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k;
    d[i + 3] = Math.min(255, a * gain);
  }
  c.putImageData(img, 0, 0);
  return kc;
}
export const videoGizmoRadius = (L, unit) => 80 * unit * (+L.style.size || 1);

/** Video fitted onto the map by its four corners (TL, TR, BR, BL), warped like a georeferenced image. */
export function drawGeoVideo(ctx, L, tm, o) {
  const q = quadOf(L);
  if (!q) return;
  const s = L.style, { proj, unit } = o;
  const v = videoFor(s.media);
  let a = tm.alpha * (+s.opacity || 1);
  if (L.anim === 'fade' && !tm.edit) a *= Math.min(1, Math.max(0, tm.tau / 0.8));
  if (!v?.ready || !v.el.videoWidth) {
    const pts = q.map(proj);
    ctx.save();
    ctx.globalAlpha *= tm.alpha;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = 'rgba(15,20,30,0.55)'; ctx.fill();
    ctx.setLineDash([6 * unit, 4 * unit]); ctx.strokeStyle = '#2d7ff9'; ctx.lineWidth = 2 * unit; ctx.stroke();
    const c = pts.reduce((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4], [0, 0]);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${14 * unit}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(v?.error ? 'This video format cannot play in the browser — use MP4 (H.264) or WebM' : s.media ? 'Loading video…' : '📹 Choose a video in the layer settings', c[0], c[1]);
    ctx.restore();
    return;
  }
  if (!o.exact) {
    const dur = v.el.duration || 0;
    let target = Math.max(0, tm.edit ? 0 : tm.tau) * (+s.speed || 1) + (+s.trim || 0);
    if (s.loop !== false && dur > 0) target %= dur;
    target = Math.min(target, Math.max(0, dur - 0.04));
    syncVideo(v, target, +s.speed || 1);
  }
  const img = { ready: true, bmp: v.el, w: v.el.videoWidth, h: v.el.videoHeight };
  let clip = null;
  if (L.anim === 'wipe' && !tm.edit) {
    const u = Math.min(1, Math.max(0, tm.tau / Math.min(1.5, +L.duration || 1)));
    if (u <= 0.001) return;
    const P = q.map(proj);
    const lerp = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
    const dir = s.dir || 'lr';
    let poly;
    if (dir === 'lr') poly = [P[0], lerp(P[0], P[1], u), lerp(P[3], P[2], u), P[3]];
    else if (dir === 'rl') poly = [lerp(P[1], P[0], u), P[1], P[2], lerp(P[2], P[3], u)];
    else if (dir === 'tb') poly = [P[0], P[1], lerp(P[1], P[2], u), lerp(P[0], P[3], u)];
    else poly = [lerp(P[3], P[0], u), lerp(P[2], P[1], u), P[2], P[3]];
    clip = (c) => { poly.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
  }
  let pts = null;
  try { pts = drawQuad(ctx, img, q, proj, { crs: s.crs, alpha: a, clip, blend: s.blend === 'screen' ? 'screen' : s.blend === 'multiply' ? 'multiply' : null }); } catch { /* frame not ready */ }
  if (s.border !== false && s.border) {
    const P = q.map(proj);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.strokeStyle = s.borderColor || '#fff'; ctx.lineWidth = 2 * unit; ctx.stroke();
    ctx.restore();
  }
  return pts;
}
