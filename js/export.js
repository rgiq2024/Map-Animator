// Frame-by-frame video export: renders each frame deterministically and encodes it to MP4
// with WebCodecs (H.264) + mp4-muxer, falling back to MediaRecorder (WebM) where WebCodecs is missing.
import { drawOverlay, drawAttribution } from './render.js';

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
export async function settle(map, maxWait = 15000) {
  await nextRender(map);
  const t0 = performance.now();
  while (!(map.loaded() && map.areTilesLoaded()) && performance.now() - t0 < maxWait) await sleep(25);
  await nextRender(map);
}

// H.264 first (plays everywhere), then VP9 / AV1 in MP4 for browsers without an H.264 encoder.
const CODECS = [
  ...['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.640028', 'avc1.4d0034', 'avc1.4d0028', 'avc1.42e034', 'avc1.42001f'].map((c) => [c, 'avc']),
  ['vp09.00.51.08', 'vp9'], ['vp09.00.41.08', 'vp9'], ['vp09.00.40.08', 'vp9'], ['vp09.00.31.08', 'vp9'],
  ['av01.0.12M.08', 'av1'], ['av01.0.08M.08', 'av1'],
];

async function pickCodec(width, height, fps, bitrate) {
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
 * @param o.map MapLibre map
 * @param o.project project
 * @param o.timeline timeline (built for the stage's CSS size)
 * @param o.applyCamera (t) => void — positions the map for time t
 * @param o.width/o.height output pixels
 * @param o.cssWidth/o.cssHeight stage CSS size
 * @param o.fps frames per second
 * @param o.attribution attribution text burnt into the video
 * @param o.onProgress (fraction, frameCanvas?) => void
 * @param o.signal AbortSignal
 * @returns {Promise<{blob: Blob, ext: string}>}
 */
export async function exportVideo(o) {
  const { map, width, height, fps } = o;
  const scale = width / o.cssWidth;
  const frames = Math.max(1, Math.ceil(o.timeline.total * fps));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  const prevRatio = map.getPixelRatio();
  map.setPixelRatio(scale);
  await settle(map);

  const drawFrame = async (i) => {
    const t = i / fps;
    o.applyCamera(t);
    await settle(map);
    ctx.fillStyle = '#dfe3e8';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(map.getCanvas(), 0, 0, width, height);
    drawOverlay(ctx, map, o.project, o.timeline, t, scale);
    drawAttribution(ctx, o.attribution, scale, width, height);
  };

  try {
    if ('VideoEncoder' in window) {
      const bitrate = Math.round(Math.min(80e6, width * height * fps * 0.14));
      const picked = await pickCodec(width, height, fps, bitrate);
      if (picked) return await encodeMp4(o, picked, canvas, frames, drawFrame);
    }
    return await recordWebm(o, canvas, frames, drawFrame);
  } finally {
    map.setPixelRatio(prevRatio);
  }
}

async function encodeMp4(o, { config, mux }, canvas, frames, drawFrame) {
  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.mjs');
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: mux, width: config.width, height: config.height, frameRate: o.fps },
    fastStart: 'in-memory',
  });
  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  encoder.configure(config);
  const frameDur = 1e6 / o.fps;
  for (let i = 0; i < frames; i++) {
    if (o.signal?.aborted) { encoder.close(); throw new DOMException('Export cancelled', 'AbortError'); }
    if (encodeError) throw encodeError;
    await drawFrame(i);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    encoder.encode(frame, { keyFrame: i % (o.fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) await sleep(4);
    o.onProgress?.((i + 1) / frames, canvas);
  }
  await encoder.flush();
  encoder.close();
  if (encodeError) throw encodeError;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
}

async function recordWebm(o, canvas, frames, drawFrame) {
  if (!('MediaRecorder' in window) || !canvas.captureStream) throw new Error('This browser cannot record video. Try a recent Chrome, Edge, Safari or Firefox.');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(50e6, canvas.width * canvas.height * o.fps * 0.12) });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  // Last-resort path: real-time recording. Frames that take long to load will be held a little longer.
  await drawFrame(0);
  rec.start(1000);
  for (let i = 0; i < frames; i++) {
    if (o.signal?.aborted) { rec.stop(); throw new DOMException('Export cancelled', 'AbortError'); }
    const t0 = performance.now();
    if (i > 0) await drawFrame(i);
    track.requestFrame?.();
    await sleep(Math.max(0, 1000 / o.fps - (performance.now() - t0)));
    o.onProgress?.((i + 1) / frames, canvas);
  }
  rec.stop();
  await stopped;
  const type = rec.mimeType || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}
