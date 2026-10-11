// Your own effect clips (explosions, smoke, fire, muzzle flashes…) placed on the map. Clips on a black
// background are blended with "screen" so only the light parts show; WebM/MOV with alpha use "normal".
import { getMedia } from './store.js';

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
      el.load();
    });
  }
  return v;
}
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
    if (L.kind !== 'videofx' || L.hidden || !L.style.media) continue;
    const v = videoFor(L.style.media);
    if (!v) continue;
    if (!v.ready) await new Promise((res) => { const to = setTimeout(res, 4000); v.el.addEventListener('loadeddata', () => { clearTimeout(to); res(); }, { once: true }); });
    const tm = layerTiming(L, t);
    if (!tm.visible) continue;
    const target = localTime(L, tm.tau, v.el.duration || 0);
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
    if (Math.abs(el.currentTime - target) > 0.08) { try { el.currentTime = target; } catch { /* not seekable yet */ } }
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
