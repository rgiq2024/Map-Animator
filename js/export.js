// Frame-by-frame video export of all scenes. Each frame is drawn only after the map has finished
// loading for that camera, then encoded with WebCodecs into an MP4 (H.264, or VP9/AV1 as fallback).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/**
 * @param o.scenes array of scenes
 * @param o.map MapLibre map
 * @param o.width/o.height output size, o.fps
 * @param o.join 'cut' | 'fade'
 * @param o.prepareScene async (scene) => model — applies the scene's look and returns its built model
 * @param o.drawFrame (ctx, scene, model, t) => void — positions camera is done by caller in o.applyCamera
 * @param o.applyCamera (model, t) => void
 * @param o.onProgress (fraction, canvas, info) => void
 * @param o.signal AbortSignal
 */
export async function exportVideo(o) {
  const { map, width, height, fps } = o;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const picked = await pickCodec(width, height, fps);
  if (!picked) return recordFallback(o, canvas, ctx);

  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.mjs');
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width, height, frameRate: fps },
    fastStart: 'in-memory',
  });
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
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', codec: picked.mux };
}

async function forEachFrame(o, ctx, emit, canvas) {
  const { map, width, height, fps } = o;
  const totals = [];
  let grand = 0;
  for (const sc of o.scenes) { const n = Math.max(1, Math.ceil(o.durationOf(sc) * fps)); totals.push(n); grand += n; }
  let done = 0;
  for (let si = 0; si < o.scenes.length; si++) {
    const scene = o.scenes[si];
    o.onStatus?.(`Loading the map for ${scene.name}…`);
    const model = await o.prepareScene(scene);
    const n = Math.max(1, Math.ceil(model.total * fps));
    for (let i = 0; i < n; i++) {
      if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const t = i / fps;
      o.applyCamera(model, t);
      await settle(map);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(map.getCanvas(), 0, 0, width, height);
      o.drawFrame(ctx, scene, model, t);
      if (o.join === 'fade' && o.scenes.length > 1) {
        const fd = 0.45;
        let a = 0;
        if (si > 0 && t < fd) a = 1 - t / fd;
        if (si < o.scenes.length - 1 && t > model.total - fd) a = Math.max(a, (t - (model.total - fd)) / fd);
        if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`; ctx.fillRect(0, 0, width, height); }
      }
      await emit();
      done++;
      o.onProgress?.(done / grand, canvas, { scene: si + 1, scenes: o.scenes.length, frame: done, frames: grand });
    }
  }
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
