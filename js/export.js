// Frame-by-frame video export of all scenes. Each frame is drawn only after the map has finished
// loading for that camera, then encoded with WebCodecs into an MP4 (H.264, or VP9/AV1 as fallback),
// with scene transitions and an optional mixed soundtrack.
import { videoFor } from './videofx.js';
import { chromaKey } from './screenfx.js';
import { pickAudioCodec, encodeAudio } from './audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function nextRender(map, timeout = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once('render', finish);
    map.triggerRepaint();
    setTimeout(finish, timeout);
  });
}

/** Wait until the map has drawn the current camera with all tiles loaded. */
export async function settle(map, maxWait = 20000) {
  await nextRender(map);
  const t0 = performance.now();
  while (!(map.loaded() && map.areTilesLoaded() && map.isStyleLoaded()) && performance.now() - t0 < maxWait) await sleep(25);
  await nextRender(map);
}

const CODECS = [
  ...['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.640028', 'avc1.4d0034', 'avc1.4d0028', 'avc1.42e034', 'avc1.42001f'].map((c) => [c, 'avc']),
  ['vp09.00.51.08', 'vp9'], ['vp09.00.41.08', 'vp9'], ['vp09.00.40.08', 'vp9'], ['vp09.00.31.08', 'vp9'],
  ['av01.0.12M.08', 'av1'], ['av01.0.08M.08', 'av1'],
];

export async function pickCodec(width, height, fps, seconds = 0) {
  if (!('VideoEncoder' in window)) return null;
  // long videos are kept in memory until saved: cap the total size (~1.2 GB) by lowering the bitrate
  const cap = seconds > 0 ? 9.6e9 / seconds : Infinity;
  const bitrate = Math.round(Math.max(2e6, Math.min(80e6, width * height * fps * 0.15, cap)));
  for (const [codec, mux] of CODECS) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const config = { codec, width, height, bitrate, framerate: fps, hardwareAcceleration };
      if (mux === 'avc') config.avc = { format: 'avc' };
      try {
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (supported) return { config, mux };
      } catch { /* try next */ }
    }
  }
  return null;
}

const NEW_TR = ['cube', 'pageturn', 'newsspin', 'shatter', 'mosaic', 'checker', 'diagonal', 'clock', 'diamond', 'split', 'slidedown', 'slideright', 'zoomin', 'rgbsplit', 'lightsweep', 'stripes', 'flipcard'];
const hash01 = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
let rgbTmp = null;
/** The newer scene transitions. snap = last frame of the old scene, cur = the new scene, e = 0 → 1. */
export function drawNewTransition(ctx, tr, snap, cur, e, W, H, frame) {
  const clipDraw = (path, img) => { ctx.save(); ctx.beginPath(); path(); ctx.clip(); ctx.drawImage(img, 0, 0); ctx.restore(); };
  if (tr === 'cube') {
    // old face turns away to the left, new face turns in from the right
    const a = e * Math.PI / 2, wOld = W * Math.cos(a), wNew = W * Math.sin(a);
    ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(snap, 0, 0, W, H, 0, H * 0.04 * Math.sin(a * 2), Math.max(1, wOld), H * (1 - 0.08 * Math.sin(a * 2)));
    ctx.fillStyle = `rgba(0,0,0,${0.5 * e})`; ctx.fillRect(0, 0, wOld, H);
    ctx.drawImage(cur, 0, 0, W, H, wOld, H * 0.04 * Math.sin(a * 2), Math.max(1, wNew), H * (1 - 0.08 * Math.sin(a * 2)));
    ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - e)})`; ctx.fillRect(wOld, 0, wNew, H);
    ctx.restore();
  } else if (tr === 'pageturn') {
    ctx.drawImage(cur, 0, 0);
    const x = W * (1 - e) * 1.25;
    clipDraw(() => { ctx.moveTo(0, 0); ctx.lineTo(x, 0); ctx.lineTo(x - W * 0.25, H); ctx.lineTo(0, H); ctx.closePath(); }, snap);
    const g = ctx.createLinearGradient(x - W * 0.25, 0, x + W * 0.05, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0.35)'); g.addColorStop(0.85, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - W * 0.08, 0); ctx.lineTo(x + W * 0.06, 0); ctx.lineTo(x - W * 0.19, H); ctx.lineTo(x - W * 0.33, H); ctx.closePath(); ctx.fill();
  } else if (tr === 'newsspin') {
    // classic newspaper spin: the old frame spins away, the new one spins in
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const out = e < 0.5, k = out ? 1 - e * 2 : (e - 0.5) * 2;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate((out ? 1 : -1) * (1 - k) * Math.PI * 2); ctx.scale(Math.max(0.01, k), Math.max(0.01, k));
    ctx.drawImage(out ? snap : cur, -W / 2, -H / 2); ctx.restore();
  } else if (tr === 'shatter' || tr === 'mosaic' || tr === 'checker') {
    ctx.drawImage(cur, 0, 0);
    const nx = tr === 'checker' ? 8 : 12, ny = tr === 'checker' ? 5 : 7, tw = W / nx, th = H / ny;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const r = hash01(i, j);
      const start = tr === 'checker' ? ((i + j) % 2) * 0.4 : r * 0.6;
      const k = Math.max(0, Math.min(1, (e - start) / 0.4));
      if (k >= 1) continue;
      ctx.save();
      const cx = i * tw + tw / 2, cy = j * th + th / 2;
      if (tr === 'shatter') { ctx.translate(cx + (cx - W / 2) * k * 1.2, cy + (cy - H / 2) * k * 1.2 + k * k * H * 0.3); ctx.rotate((r - 0.5) * 3 * k); ctx.globalAlpha = 1 - k; }
      else { ctx.translate(cx, cy); ctx.scale(1 - k, tr === 'mosaic' ? 1 : 1 - k); }
      ctx.drawImage(snap, i * tw, j * th, tw + 1, th + 1, -tw / 2, -th / 2, tw + 1, th + 1);
      ctx.restore();
    }
  } else if (tr === 'diagonal') {
    ctx.drawImage(snap, 0, 0);
    const d = (W + H) * e;
    clipDraw(() => { ctx.moveTo(0, 0); ctx.lineTo(d, 0); ctx.lineTo(d - H, H); ctx.lineTo(0, H); ctx.closePath(); }, cur);
  } else if (tr === 'clock') {
    ctx.drawImage(snap, 0, 0);
    clipDraw(() => { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e); ctx.closePath(); }, cur);
  } else if (tr === 'diamond') {
    ctx.drawImage(snap, 0, 0);
    const r = (W + H) * 0.55 * e;
    clipDraw(() => { ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2 + r, H / 2); ctx.lineTo(W / 2, H / 2 + r); ctx.lineTo(W / 2 - r, H / 2); ctx.closePath(); }, cur);
  } else if (tr === 'split') {
    ctx.drawImage(cur, 0, 0);
    ctx.drawImage(snap, 0, 0, W, H / 2, 0, -H / 2 * e, W, H / 2);
    ctx.drawImage(snap, 0, H / 2, W, H / 2, 0, H / 2 + H / 2 * e, W, H / 2);
  } else if (tr === 'slidedown') { ctx.drawImage(snap, 0, H * e); ctx.drawImage(cur, 0, -H * (1 - e)); }
  else if (tr === 'slideright') { ctx.drawImage(snap, W * e, 0); ctx.drawImage(cur, -W * (1 - e), 0); }
  else if (tr === 'zoomin') {
    ctx.drawImage(snap, 0, 0);
    const k = 0.05 + 0.95 * e;
    ctx.save(); ctx.globalAlpha = Math.min(1, e * 2); ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.drawImage(cur, -W / 2, -H / 2); ctx.restore();
  } else if (tr === 'rgbsplit') {
    const img = e < 0.5 ? snap : cur, peak = 1 - Math.abs(e - 0.5) * 2, off = peak * W * 0.03;
    rgbTmp ||= document.createElement('canvas'); rgbTmp.width = W; rgbTmp.height = H;
    const t = rgbTmp.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [dx, col] of [[-off, 'rgb(255,0,0)'], [off, 'rgb(0,90,255)']]) {
      t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H); t.drawImage(img, 0, 0);
      t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(img, 0, 0);
      ctx.globalAlpha = 0.6 * peak; ctx.drawImage(rgbTmp, dx, 0);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (peak > 0.6) for (let k = 0; k < 8; k++) { const y = hash01(k, frame) * H, h = H * 0.02; ctx.drawImage(img, 0, y, W, h, (hash01(frame, k) - 0.5) * W * 0.08, y, W, h); }
  } else if (tr === 'lightsweep') {
    ctx.drawImage(e < 0.5 ? snap : cur, 0, 0);
    const x = -W * 0.3 + e * W * 1.6;
    const g = ctx.createLinearGradient(x - W * 0.25, 0, x + W * 0.25, 0);
    const peak = 1 - Math.abs(e - 0.5) * 2;
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.95 * peak + 0.2})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.translate(x, H / 2); ctx.rotate(-0.25); ctx.translate(-x, -H / 2); ctx.fillStyle = g; ctx.fillRect(x - W * 0.25, -H, W * 0.5, H * 3); ctx.restore();
  } else if (tr === 'stripes') {
    ctx.drawImage(snap, 0, 0);
    const n = 9, sw = (W + H) / n;
    clipDraw(() => { for (let k = 0; k < n; k++) { const kk = Math.max(0, Math.min(1, e * 1.6 - k * 0.07)); const x0 = k * sw - H; ctx.moveTo(x0, H); ctx.lineTo(x0 + H, 0); ctx.lineTo(x0 + H + sw * kk, 0); ctx.lineTo(x0 + sw * kk, H); ctx.closePath(); } }, cur);
  } else if (tr === 'flipcard') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const a = e * Math.PI, sx = Math.abs(Math.cos(a));
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(Math.max(0.01, sx), 1 - 0.1 * Math.sin(a)); ctx.drawImage(e < 0.5 ? snap : cur, -W / 2, -H / 2); ctx.restore();
  }
}
export const TRANSITIONS = { cut: 'Cut', fadeBlack: 'Dip to black', fadeWhite: 'Dip to white', dissolve: 'Cross dissolve', wipe: 'Wipe', zoom: 'Zoom through', slide: 'Slide in', push: 'Push', whip: 'Whip pan', iris: 'Circle reveal', flash: 'Flash', blur: 'Blur dissolve', glitch: 'Glitch', spin: 'Spin zoom', bars: 'Venetian blinds', pixelate: 'Pixelate', filmburn: 'Film burn', lightleak: 'Light leak flash', ink: 'Ink bleed', luma: 'Noise dissolve', zoomblur: 'Zoom blur', slideup: 'Slide up', doors: 'Doors open', cube: '3D cube turn', pageturn: 'Page turn', newsspin: 'Newspaper spin', shatter: 'Shatter', mosaic: 'Tile mosaic', checker: 'Checkerboard', diagonal: 'Diagonal wipe', clock: 'Clock wipe', diamond: 'Diamond reveal', split: 'Split open', slidedown: 'Slide down', slideright: 'Slide from left', zoomin: 'Zoom in (new scene grows)', rgbsplit: 'RGB split', lightsweep: 'Light sweep', stripes: 'Diagonal stripes', flipcard: 'Card flip', stinger: 'Your video (stinger)' };

/**
 * @param o.scenes array of scenes
 * @param o.map MapLibre map
 * @param o.width/o.height output size, o.fps
 * @param o.prepareScene async (scene) => model (with trimIn/trimOut/duration)
 * @param o.applyCamera (model, t) => void
 * @param o.mapFilter (scene) => CSS filter string for the map image
 * @param o.drawFrame (ctx, scene, model, t) => void — overlays
 * @param o.mixAudio async (duration) => AudioBuffer | null
 * @param o.onProgress (fraction, canvas, info) => void
 * @param o.signal AbortSignal
 */
export async function exportVideo(o) {
  const { width, height, fps } = o;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const totalSec = o.scenes.reduce((a, sc) => a + (o.durationOf?.(sc) || 0), 0);
  const picked = await pickCodec(width, height, fps, totalSec);
  if (!picked) return recordFallback(o, canvas, ctx);

  // soundtrack first (it is quick and tells us whether the MP4 needs an audio track)
  let audioBuf = null, audioPick = null;
  if (o.mixAudio) {
    o.onStatus?.('Mixing the soundtrack…');
    const total = o.scenes.reduce((s, sc) => s + o.durationOf(sc), 0);
    audioBuf = await o.mixAudio(total).catch((e) => { console.warn('audio mix failed', e); return null; });
    if (audioBuf) audioPick = await pickAudioCodec();
  }

  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.mjs');
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width, height, frameRate: fps },
    ...(audioPick ? { audio: { codec: audioPick.mux, sampleRate: audioPick.config.sampleRate, numberOfChannels: 2 } } : {}),
    fastStart: 'in-memory',
  });
  if (audioPick) {
    o.onStatus?.('Encoding the soundtrack…');
    await encodeAudio(audioBuf, audioPick, muxer);
  }
  let encodeError = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encodeError = e; } });
  encoder.configure(picked.config);
  const frameDur = 1e6 / fps;
  let frameNo = 0;
  try {
    await forEachFrame(o, ctx, async () => {
      if (encodeError) throw encodeError;
      const frame = new VideoFrame(canvas, { timestamp: Math.round(frameNo * frameDur), duration: Math.round(frameDur) });
      encoder.encode(frame, { keyFrame: frameNo % (fps * 2) === 0 });
      frame.close();
      frameNo++;
      while (encoder.encodeQueueSize > 6) await sleep(4);
    }, canvas);
    await encoder.flush();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (encodeError) throw encodeError;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', codec: picked.mux, audio: !!audioPick };
}

/** Draw one finished frame (map + grade + overlays) for scene time t into ctx. */
async function drawOne(o, ctx, scene, model, t) {
  const { map, width, height } = o;
  o.applyCamera(model, t);
  await o.beforeFrame?.(scene, model, t);
  await settle(map);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const bg = o.background?.(scene);
  if (bg) ctx.drawImage(bg, 0, 0, width, height);
  const f = o.mapFilter?.(scene, t) || 'none';
  ctx.filter = f;
  ctx.drawImage(map.getCanvas(), 0, 0, width, height);
  ctx.filter = 'none';
  o.drawFrame(ctx, scene, model, t);
}

async function forEachFrame(o, ctx, emit, canvas) {
  const { width, height, fps } = o;
  const totals = o.scenes.map((sc) => Math.max(1, Math.ceil(o.durationOf(sc) * fps)));
  const grand = totals.reduce((a, b) => a + b, 0);
  let done = 0;
  const snap = document.createElement('canvas');
  snap.width = width; snap.height = height;
  const sctx = snap.getContext('2d');
  let haveSnap = false;
  let cur = null;
  let tmpPix = null, mask = null, cur2 = null;
  // load transition clips before rendering
  for (const sc of o.scenes) if (sc.transition === 'stinger' && sc.transitionMedia) { const v = videoFor(sc.transitionMedia); if (v && !v.ready) await new Promise((res) => { const to = setTimeout(res, 5000); v.el.addEventListener('loadeddata', () => { clearTimeout(to); res(); }, { once: true }); }); }
  let sceneStart = 0;
  for (let si = 0; si < o.scenes.length; si++) {
    const scene = o.scenes[si];
    o.onStatus?.(`Loading the map for ${scene.name}…`);
    const model = await o.prepareScene(scene);
    const n = Math.max(1, Math.ceil(model.duration * fps));
    const prevTr = si > 0 ? o.scenes[si - 1].transition || o.join || 'cut' : 'cut';
    const prevD = si > 0 ? Math.max(0.2, +o.scenes[si - 1].transitionSeconds || 0.8) : 0;
    const nextTr = si < o.scenes.length - 1 ? scene.transition || o.join || 'cut' : 'cut';
    const nextD = Math.max(0.2, +scene.transitionSeconds || 0.8);
    for (let i = 0; i < n; i++) {
      if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const gt = sceneStart + i / fps;
      const tau = i / fps;
      const t = model.srcTime ? model.srcTime(tau) : model.trimIn + tau;
      await drawOne(o, ctx, scene, model, t);
      // ---- transitions ----
      const dip = (tr) => (tr === 'fadeBlack' ? '0,0,0' : tr === 'fadeWhite' ? '255,255,255' : null);
      let a = 0, col = null;
      if (dip(prevTr) && tau < prevD / 2) { a = 1 - tau / (prevD / 2); col = dip(prevTr); }
      if (dip(nextTr) && model.duration - tau < nextD / 2) { const b = 1 - (model.duration - tau) / (nextD / 2); if (b > a) { a = b; col = dip(nextTr); } }
      if (a > 0) { ctx.fillStyle = `rgba(${col},${clamp(a, 0, 1)})`; ctx.fillRect(0, 0, width, height); }
      if (haveSnap && tau < prevD) {
        const u = tau / prevD;
        const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
        if (['slide', 'push', 'whip', 'iris', 'flash', 'blur', 'glitch', 'spin', 'bars', 'pixelate', 'filmburn', 'lightleak', 'ink', 'luma', 'zoomblur', 'slideup', 'doors', 'stinger', ...NEW_TR].includes(prevTr)) {
          cur ||= Object.assign(document.createElement('canvas'), { width, height });
          const cc = cur.getContext('2d');
          cc.clearRect(0, 0, width, height); cc.drawImage(canvas, 0, 0);
          ctx.save();
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
          if (prevTr === 'slide') { ctx.drawImage(snap, 0, 0); ctx.drawImage(cur, width * (1 - e), 0); }
          if (prevTr === 'push') { ctx.drawImage(snap, -width * e, 0); ctx.drawImage(cur, width * (1 - e), 0); }
          if (prevTr === 'whip') {
            const steps = 6;
            for (let k = 0; k < steps; k++) {
              const ee = Math.min(1, e + (k / steps) * 0.12);
              ctx.globalAlpha = 1 / (k + 1);
              ctx.drawImage(snap, -width * ee, 0); ctx.drawImage(cur, width * (1 - ee), 0);
            }
            ctx.globalAlpha = 1;
          }
          if (prevTr === 'iris') { ctx.drawImage(snap, 0, 0); ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.hypot(width, height) * 0.5 * e, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(cur, 0, 0); }
          if (prevTr === 'flash') { ctx.drawImage(e < 0.5 ? snap : cur, 0, 0); ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(e - 0.5) * 2})`; ctx.fillRect(0, 0, width, height); }
          if (prevTr === 'blur') { ctx.filter = `blur(${(1 - e) * 18}px)`; ctx.drawImage(cur, 0, 0); ctx.filter = `blur(${e * 18}px)`; ctx.globalAlpha = 1 - e; ctx.drawImage(snap, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; }
          if (prevTr === 'spin') { ctx.drawImage(cur, 0, 0); ctx.globalAlpha = 1 - e; ctx.translate(width / 2, height / 2); ctx.rotate(e * 0.9); ctx.scale(1 + e * 1.5, 1 + e * 1.5); ctx.drawImage(snap, -width / 2, -height / 2); }
          if (prevTr === 'pixelate') {
            const peak = 1 - Math.abs(e - 0.5) * 2, px = Math.max(1, Math.round(4 + peak * 60));
            tmpPix ||= document.createElement('canvas');
            const w2 = Math.max(1, Math.round(width / px)), h2 = Math.max(1, Math.round(height / px));
            tmpPix.width = w2; tmpPix.height = h2;
            const tc = tmpPix.getContext('2d'); tc.imageSmoothingEnabled = true; tc.drawImage(e < 0.5 ? snap : cur, 0, 0, w2, h2);
            ctx.imageSmoothingEnabled = false; ctx.drawImage(tmpPix, 0, 0, width, height); ctx.imageSmoothingEnabled = true;
          }
          if (prevTr === 'filmburn' || prevTr === 'lightleak') {
            ctx.drawImage(e < 0.5 ? snap : cur, 0, 0);
            const peak = 1 - Math.abs(e - 0.5) * 2;
            ctx.globalCompositeOperation = 'screen';
            const cols = prevTr === 'filmburn' ? ['255,90,20', '255,200,80', '255,255,230'] : ['255,140,60', '255,60,120', '255,220,160'];
            for (let k = 0; k < 3; k++) {
              const cx = width * (0.2 + 0.6 * ((k * 0.37 + e * (k + 1) * 0.6) % 1)), cy = height * (0.3 + 0.4 * Math.sin(k * 2 + e * 3)), R = Math.max(width, height) * (0.25 + peak * (0.5 + k * 0.15));
              const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, `rgba(${cols[k]},${Math.min(1, peak * 1.2)})`); g.addColorStop(1, `rgba(${cols[k]},0)`);
              ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
            }
            ctx.globalCompositeOperation = 'source-over';
            if (prevTr === 'filmburn' && peak > 0.7) { ctx.fillStyle = `rgba(255,250,235,${(peak - 0.7) * 3})`; ctx.fillRect(0, 0, width, height); }
          }
          if (prevTr === 'ink' || prevTr === 'luma') {
            // reveal the new scene through a growing noise mask
            ctx.drawImage(snap, 0, 0);
            mask ||= document.createElement('canvas');
            const mw = 160, mh = Math.max(1, Math.round((160 * height) / width));
            mask.width = mw; mask.height = mh;
            const mc = mask.getContext('2d');
            const md = mc.createImageData(mw, mh);
            for (let yy = 0; yy < mh; yy++) for (let xx = 0; xx < mw; xx++) {
              let v;
              if (prevTr === 'ink') { const dx = xx / mw - 0.5, dy = (yy / mh - 0.5) * (mh / mw); v = Math.hypot(dx, dy) * 1.4 + 0.18 * Math.sin(xx * 0.31 + yy * 0.17) * Math.sin(yy * 0.23 - xx * 0.11) + 0.08 * Math.sin(xx * 0.9 + yy * 1.3); }
              else v = 0.5 + 0.25 * Math.sin(xx * 0.13 + yy * 0.07) * Math.cos(yy * 0.11 - xx * 0.05) + 0.25 * Math.sin(xx * 0.41 + yy * 0.37);
              const a = clamp((e * 1.25 - v) / 0.08, 0, 1);
              md.data[(yy * mw + xx) * 4 + 3] = a * 255;
            }
            mc.putImageData(md, 0, 0);
            cur2 ||= document.createElement('canvas');
            cur2.width = width; cur2.height = height;
            const c2 = cur2.getContext('2d');
            c2.clearRect(0, 0, width, height); c2.drawImage(cur, 0, 0);
            c2.globalCompositeOperation = 'destination-in'; c2.imageSmoothingEnabled = true; c2.drawImage(mask, 0, 0, width, height); c2.globalCompositeOperation = 'source-over';
            ctx.drawImage(cur2, 0, 0);
          }
          if (prevTr === 'zoomblur') {
            const src = e < 0.5 ? snap : cur, peak = 1 - Math.abs(e - 0.5) * 2;
            ctx.drawImage(src, 0, 0);
            for (let k = 1; k <= 6; k++) { const z = 1 + peak * 0.06 * k; ctx.globalAlpha = 0.22; ctx.drawImage(src, width / 2 - (width * z) / 2, height / 2 - (height * z) / 2, width * z, height * z); }
            ctx.globalAlpha = 1;
          }
          if (prevTr === 'slideup') { ctx.drawImage(snap, 0, -height * e); ctx.drawImage(cur, 0, height * (1 - e)); }
          if (prevTr === 'doors') { ctx.drawImage(cur, 0, 0); ctx.drawImage(snap, 0, 0, width / 2, height, -width / 2 * e, 0, width / 2, height); ctx.drawImage(snap, width / 2, 0, width / 2, height, width / 2 + (width / 2) * e, 0, width / 2, height); }
          if (prevTr === 'stinger') {
            ctx.drawImage(u < 0.5 ? snap : cur, 0, 0);
            const v = videoFor(o.scenes[si - 1].transitionMedia);
            if (v?.ready) {
              const vt = Math.min(tau, Math.max(0, (v.el.duration || prevD) - 0.04));
              await seekVideo(v.el, vt);
              const mode = o.scenes[si - 1].transitionBlend || 'screen';
              const src = mode === 'green' ? chromaKey(v.el, { key: 'green', tolerance: 0.38, softness: 0.12, spill: true }, width) : v.el;
              ctx.globalCompositeOperation = mode === 'screen' ? 'screen' : 'source-over';
              try { ctx.drawImage(src, 0, 0, width, height); } catch { /* not ready */ }
              ctx.globalCompositeOperation = 'source-over';
            }
          }
          if (NEW_TR.includes(prevTr)) drawNewTransition(ctx, prevTr, snap, cur, e, width, height, i);
          if (prevTr === 'bars') { ctx.drawImage(snap, 0, 0); const n = 10, bh = height / n; ctx.beginPath(); for (let k = 0; k < n; k++) ctx.rect(0, k * bh, width, bh * e); ctx.clip(); ctx.drawImage(cur, 0, 0); }
          if (prevTr === 'glitch') {
            ctx.drawImage(e < 0.5 ? snap : cur, 0, 0);
            const n = 14;
            for (let k = 0; k < n; k++) {
              const r1 = Math.abs(Math.sin((k + 1) * 12.9898 + i * 78.233)) % 1, r2 = Math.abs(Math.sin((k + 3) * 4.1414 + i * 3.7)) % 1;
              const y = r1 * height, h = (0.02 + r2 * 0.08) * height;
              ctx.drawImage(r2 < 0.5 ? snap : cur, 0, y, width, h, (r1 - 0.5) * width * 0.15 * (1 - Math.abs(e - 0.5) * 2), y, width, h);
            }
          }
          ctx.restore();
        }
        ctx.save();
        if (prevTr === 'dissolve') { ctx.globalAlpha = 1 - e; ctx.drawImage(snap, 0, 0); }
        if (prevTr === 'wipe') { ctx.beginPath(); ctx.rect(width * e, 0, width * (1 - e), height); ctx.clip(); ctx.drawImage(snap, 0, 0); ctx.restore(); ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(width * e - 2, 0, 4, height); }
        if (prevTr === 'zoom') { const k = 1 + e * 0.6; ctx.globalAlpha = 1 - e; ctx.translate(width / 2, height / 2); ctx.scale(k, k); ctx.drawImage(snap, -width / 2, -height / 2); }
        ctx.restore();
      }
      // the clean last frame (without the overlays) is what the next scene transitions from
      if (i === n - 1) { sctx.drawImage(canvas, 0, 0); haveSnap = true; }
      // overlays that run through the whole video (logo strip, lower third) — drawn after the transition
      o.drawOverlay?.(ctx, gt, si);
      await emit();
      done++;
      o.onProgress?.(done / grand, canvas, { scene: si + 1, scenes: o.scenes.length, frame: done, frames: grand });
    }
    sceneStart += n / fps;
  }
}

/** Render a single still frame (PNG). */
export async function renderStill(o, scene, t) {
  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const model = await o.prepareScene(scene);
  await drawOne(o, ctx, scene, model, Math.max(model.trimIn, Math.min(model.trimOut, t)));
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}

async function recordFallback(o, canvas, ctx) {
  if (!('MediaRecorder' in window) || !canvas.captureStream) throw new Error('This browser cannot make videos. Please use a recent Chrome, Edge, Safari or Firefox.');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 20e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(1000);
  await forEachFrame(o, ctx, async () => {
    track.requestFrame?.();
    await sleep(1000 / o.fps);
  }, canvas);
  rec.stop();
  await stopped;
  const type = rec.mimeType || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', codec: 'recorder' };
}

async function seekVideo(el, t) {
  if (!el.paused) el.pause();
  if (Math.abs(el.currentTime - t) < 0.001 && el.readyState >= 2) return;
  await new Promise((res) => { const to = setTimeout(res, 2000); el.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true }); el.currentTime = t; });
}
