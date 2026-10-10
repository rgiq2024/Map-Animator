// Frame-by-frame video export of all scenes. Each frame is drawn only after the map has finished
// loading for that camera, then encoded with WebCodecs into an MP4 (H.264, or VP9/AV1 as fallback),
// with scene transitions and an optional mixed soundtrack.
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

export async function pickCodec(width, height, fps) {
  if (!('VideoEncoder' in window)) return null;
  const bitrate = Math.round(Math.min(80e6, width * height * fps * 0.15));
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

export const TRANSITIONS = { cut: 'Cut', fadeBlack: 'Dip to black', fadeWhite: 'Dip to white', dissolve: 'Cross dissolve', wipe: 'Wipe', zoom: 'Zoom through' };

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
  const picked = await pickCodec(width, height, fps);
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
  await settle(map);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const f = o.mapFilter?.(scene) || 'none';
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
      const tau = i / fps;
      const t = model.trimIn + tau;
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
        ctx.save();
        if (prevTr === 'dissolve') { ctx.globalAlpha = 1 - e; ctx.drawImage(snap, 0, 0); }
        if (prevTr === 'wipe') { ctx.beginPath(); ctx.rect(width * e, 0, width * (1 - e), height); ctx.clip(); ctx.drawImage(snap, 0, 0); ctx.restore(); ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(width * e - 2, 0, 4, height); }
        if (prevTr === 'zoom') { const k = 1 + e * 0.6; ctx.globalAlpha = 1 - e; ctx.translate(width / 2, height / 2); ctx.scale(k, k); ctx.drawImage(snap, -width / 2, -height / 2); }
        ctx.restore();
      }
      await emit();
      done++;
      o.onProgress?.(done / grand, canvas, { scene: si + 1, scenes: o.scenes.length, frame: done, frames: grand });
    }
    sctx.drawImage(canvas, 0, 0);
    haveSnap = true;
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
