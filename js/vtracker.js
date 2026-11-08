// Point tracker for video clips: you click the subject once, it is followed through the whole clip
// (forwards and backwards) by template matching with normalised cross-correlation, a motion prediction
// and a slowly updated template. The result is a list of [videoTime, x, y, confidence] in 0…1 coordinates.
import { getMedia } from './store.js';

const AW = 360; // analysis width (px)

function grayOf(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  return g;
}
function patch(g, w, h, cx, cy, P) {
  const r = P >> 1, out = new Float32Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const gx = Math.min(w - 1, Math.max(0, Math.round(cx) - r + x)), gy = Math.min(h - 1, Math.max(0, Math.round(cy) - r + y));
    out[y * P + x] = g[gy * w + gx];
  }
  return out;
}
function norm(t) {
  let m = 0; for (const v of t) m += v; m /= t.length;
  let s = 0; const o = new Float32Array(t.length);
  for (let i = 0; i < t.length; i++) { o[i] = t[i] - m; s += o[i] * o[i]; }
  const sd = Math.sqrt(s) || 1;
  for (let i = 0; i < o.length; i++) o[i] /= sd;
  return o;
}
/** best match of a normalised template around (px, py) within radius R */
function search(g, w, h, T, P, px, py, R) {
  const r = P >> 1, n = P * P;
  let best = -2, bx = px, by = py;
  const x0 = Math.max(r, Math.round(px - R)), x1 = Math.min(w - r - 1, Math.round(px + R));
  const y0 = Math.max(r, Math.round(py - R)), y1 = Math.min(h - r - 1, Math.round(py + R));
  for (let cy = y0; cy <= y1; cy += 1) for (let cx = x0; cx <= x1; cx += 1) {
    let s = 0, s2 = 0, st = 0;
    for (let y = 0; y < P; y++) {
      const row = (cy - r + y) * w + cx - r, trow = y * P;
      for (let x = 0; x < P; x++) { const v = g[row + x]; s += v; s2 += v * v; st += v * T[trow + x]; }
    }
    const varI = s2 - (s * s) / n;
    if (varI < 1e-3) continue;
    const ncc = st / Math.sqrt(varI); // T has zero mean and unit norm
    if (ncc > best) { best = ncc; bx = cx; by = cy; }
  }
  return [bx, by, best];
}

/**
 * Tracks a point through a clip.
 * opts: { url, t0, x0, y0 (0…1), box (fraction of width), fps, onProgress(f), cancelled() }
 */
export async function trackPoint(opts) {
  const el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = opts.url;
  await new Promise((res, rej) => { el.addEventListener('loadeddata', res, { once: true }); el.addEventListener('error', () => rej(new Error('This video cannot be read for tracking')), { once: true }); });
  const dur = el.duration || 0;
  const W = AW, Hh = Math.max(2, Math.round((AW * el.videoHeight) / el.videoWidth));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const seek = (t) => new Promise((res) => { const to = setTimeout(res, 3000); el.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true }); el.currentTime = Math.min(Math.max(0, t), Math.max(0, dur - 0.02)); });
  const frameAt = async (t) => { await seek(t); c.drawImage(el, 0, 0, W, Hh); return grayOf(c, W, Hh); };
  let P = Math.round((opts.box || 0.08) * W); P = Math.max(11, Math.min(91, P | 1));
  const step = 1 / (opts.fps || 15);
  const g0 = await frameAt(opts.t0);
  const start = [opts.x0 * W, opts.y0 * Hh];
  const T0 = patch(g0, W, Hh, start[0], start[1], P);
  const out = new Map();
  out.set(+opts.t0.toFixed(3), [start[0] / W, start[1] / Hh, 1]);
  const total = Math.max(1, Math.ceil(dur / step));
  let done = 0;
  for (const dir of [1, -1]) {
    let pos = start.slice(), vel = [0, 0], tpl = T0.slice(), Tn = norm(tpl), lost = 0;
    for (let t = opts.t0 + dir * step; dir > 0 ? t <= dur + 1e-6 : t >= -1e-6; t += dir * step) {
      if (opts.cancelled?.()) throw new Error('cancelled');
      const g = await frameAt(t);
      const pred = [pos[0] + vel[0], pos[1] + vel[1]];
      const R = Math.max(10, P * 0.9) * (lost ? 1.8 : 1);
      let [bx, by, sc] = search(g, W, Hh, Tn, P, pred[0], pred[1], R);
      if (sc < 0.45) { // try around the last sure position too
        const [bx2, by2, sc2] = search(g, W, Hh, Tn, P, pos[0], pos[1], R * 1.6);
        if (sc2 > sc) { bx = bx2; by = by2; sc = sc2; }
      }
      if (sc >= 0.4) {
        const nv = [bx - pos[0], by - pos[1]];
        vel = [vel[0] * 0.5 + nv[0] * 0.5, vel[1] * 0.5 + nv[1] * 0.5];
        pos = [bx, by]; lost = 0;
        if (sc > 0.7) { const np = patch(g, W, Hh, bx, by, P); for (let i = 0; i < tpl.length; i++) tpl[i] = tpl[i] * 0.88 + np[i] * 0.12; Tn = norm(tpl); }
      } else { pos = pred; vel = [vel[0] * 0.7, vel[1] * 0.7]; lost++; }
      out.set(+t.toFixed(3), [Math.min(1, Math.max(0, pos[0] / W)), Math.min(1, Math.max(0, pos[1] / Hh)), Math.max(0, Math.min(1, lost ? 0.2 : sc))]);
      done++; opts.onProgress?.(Math.min(1, done / total), [pos[0] / W, pos[1] / Hh]);
      if (lost > 45) break; // ~3 s without the subject
    }
  }
  el.removeAttribute('src'); el.load();
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([t, p]) => [t, +p[0].toFixed(4), +p[1].toFixed(4), +p[2].toFixed(2)]);
}

// ================================================================= the tracking window
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Opens the "pick the subject" window. onDone(track, info) is called with the result. */
export async function openTracker({ mediaId, videoName, t0 = 0, track = [], box = 0.08, onDone, toast }) {
  const blob = await getMedia(mediaId);
  if (!blob) { toast?.('The video clip is not loaded'); return; }
  const url = URL.createObjectURL(blob);
  const wrap = document.createElement('div');
  wrap.className = 'vt-modal';
  wrap.innerHTML = `<div class="vt-card" role="dialog" aria-label="Track a subject">
    <header><b>Track a subject</b><span class="muted">${esc(videoName || 'Video clip')}</span><button class="vt-x" type="button" aria-label="Close">✕</button></header>
    <div class="vt-stage"><canvas></canvas><div class="vt-hint">Click the person or object to follow — pick a part with clear detail (chest, face, a logo)</div></div>
    <div class="vt-row"><span>Frame</span><input type="range" class="vt-time" min="0" max="1" step="0.01" value="0"><output class="vt-tl">0:00.0</output></div>
    <div class="vt-row"><span>Box size</span><input type="range" class="vt-box" min="0.03" max="0.25" step="0.005" value="${box}"><span class="muted vt-boxv"></span></div>
    <div class="vt-row"><span>Accuracy</span><select class="vt-fps"><option value="10">Fast (10 checks / s)</option><option value="15" selected>Normal (15 / s)</option><option value="30">Precise (30 / s)</option></select></div>
    <div class="vt-prog" hidden><i></i></div>
    <footer><span class="vt-status muted">${track.length ? `Tracked: ${track.length} points` : 'No track yet'}</span><button class="btn sm vt-clear" type="button">Clear</button><button class="btn sm primary vt-go" type="button" disabled>Track</button><button class="btn sm vt-done" type="button">Done</button></footer>
  </div>`;
  document.body.appendChild(wrap);
  const $ = (q) => wrap.querySelector(q);
  const cv = $('canvas'), c = cv.getContext('2d');
  const el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = url;
  let pick = null, busy = false, cancel = false, cur = track.slice();
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const close = () => { cancel = true; wrap.remove(); el.removeAttribute('src'); el.load(); setTimeout(() => URL.revokeObjectURL(url), 1000); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  await new Promise((res) => { el.addEventListener('loadeddata', res, { once: true }); el.addEventListener('error', res, { once: true }); });
  if (!el.videoWidth) { $('.vt-status').textContent = 'This video format cannot be read in the browser — use MP4 (H.264) or WebM.'; return; }
  const dur = el.duration || 0;
  const maxW = Math.min(880, window.innerWidth - 80), maxH = Math.min(500, window.innerHeight - 300);
  const sc = Math.min(maxW / el.videoWidth, maxH / el.videoHeight);
  cv.width = Math.round(el.videoWidth * sc); cv.height = Math.round(el.videoHeight * sc);
  const ts = $('.vt-time'); ts.max = dur.toFixed(2); ts.value = Math.min(dur, t0).toFixed(2);
  const draw = () => {
    try { c.drawImage(el, 0, 0, cv.width, cv.height); } catch { /* not ready */ }
    if (cur.length > 1) {
      c.strokeStyle = 'rgba(255,210,63,0.9)'; c.lineWidth = 2; c.beginPath();
      cur.forEach((p, i) => (i ? c.lineTo(p[1] * cv.width, p[2] * cv.height) : c.moveTo(p[1] * cv.width, p[2] * cv.height))); c.stroke();
      const t = el.currentTime; let k = 0; while (k < cur.length - 1 && cur[k + 1][0] <= t) k++;
      const p = cur[k]; if (p) { c.fillStyle = p[3] < 0.3 ? '#ff4a4a' : '#ffd23f'; c.beginPath(); c.arc(p[1] * cv.width, p[2] * cv.height, 6, 0, Math.PI * 2); c.fill(); }
    }
    if (pick) {
      const b = +$('.vt-box').value * cv.width, x = pick[0] * cv.width, y = pick[1] * cv.height;
      c.strokeStyle = '#2ee6e6'; c.lineWidth = 2; c.strokeRect(x - b / 2, y - b / 2, b, b);
      c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x + 10, y); c.moveTo(x, y - 10); c.lineTo(x, y + 10); c.stroke();
    }
    $('.vt-tl').textContent = fmt(el.currentTime || 0);
    $('.vt-boxv').textContent = `${Math.round(+$('.vt-box').value * 100)}% of the width`;
  };
  const seekTo = (t) => new Promise((res) => { const to = setTimeout(res, 2000); el.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true }); el.currentTime = t; });
  await seekTo(+ts.value); draw();
  ts.addEventListener('input', async () => { if (busy) return; await seekTo(+ts.value); draw(); });
  $('.vt-box').addEventListener('input', draw);
  cv.addEventListener('click', (e) => {
    if (busy) return;
    const r = cv.getBoundingClientRect();
    pick = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    $('.vt-go').disabled = false; $('.vt-hint').hidden = true;
    $('.vt-status').textContent = `Start at ${fmt(+ts.value)} — press Track`;
    draw();
  });
  $('.vt-x').addEventListener('click', close);
  $('.vt-done').addEventListener('click', () => { if (busy) { cancel = true; return; } close(); });
  $('.vt-clear').addEventListener('click', () => { if (busy) return; cur = []; pick = null; $('.vt-go').disabled = true; onDone?.([], ''); $('.vt-status').textContent = 'Track cleared'; draw(); });
  $('.vt-go').addEventListener('click', async () => {
    if (!pick || busy) return;
    busy = true; cancel = false;
    const go = $('.vt-go'); go.disabled = true; $('.vt-done').textContent = 'Stop';
    const bar = $('.vt-prog'); bar.hidden = false;
    const startT = +ts.value;
    try {
      const res = await trackPoint({
        url, t0: startT, x0: pick[0], y0: pick[1], box: +$('.vt-box').value, fps: +$('.vt-fps').value,
        cancelled: () => cancel,
        onProgress: (f, p) => { bar.firstElementChild.style.width = `${Math.round(f * 100)}%`; $('.vt-status').textContent = `Tracking… ${Math.round(f * 100)}%`; c.fillStyle = '#ffd23f'; c.fillRect(p[0] * cv.width - 1.5, p[1] * cv.height - 1.5, 3, 3); },
      });
      cur = res;
      const lost = res.filter((p) => p[3] < 0.3).length;
      const info = `${res.length} points · ${fmt(res[0][0])}–${fmt(res[res.length - 1][0])}${lost ? ` · lost in ${Math.round((lost / res.length) * 100)}%` : ''}`;
      $('.vt-status').textContent = `Done: ${info}. Scrub the frame slider to check it.`;
      onDone?.(res, info, +$('.vt-box').value);
      pick = null;
    } catch (err) {
      $('.vt-status').textContent = err.message === 'cancelled' ? 'Stopped' : err.message;
    }
    busy = false; bar.hidden = true; $('.vt-done').textContent = 'Done'; go.disabled = !pick;
    await seekTo(startT); draw();
  });
}
