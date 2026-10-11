// Soundtrack: music files and recorded voiceovers. Tracks sit on the project timeline (seconds from the
// start of the whole video). Used for live preview and mixed + encoded into the MP4 on export.
import { getMedia, putMedia } from './store.js';
import { scheduleAll, hasSound } from './sfx.js';

export const SR = 48000;
const buffers = new Map();
let liveCtx = null;
let playingNodes = [];

const ctxLive = () => (liveCtx ||= new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }));

export async function decodeTrack(track) {
  if (buffers.has(track.id)) return buffers.get(track.id);
  const p = (async () => {
    const blob = await getMedia(track.id);
    if (!blob) return null;
    const ab = await blob.arrayBuffer();
    return await ctxLive().decodeAudioData(ab);
  })();
  buffers.set(track.id, p);
  p.catch(() => buffers.delete(track.id));
  return p;
}

/** Add an audio file as a track. Returns the track. */
export async function addAudioFile(project, file, kind = 'music', start = 0) {
  const id = `au_${Math.random().toString(36).slice(2, 10)}`;
  await putMedia(id, file);
  const track = { id, kind, name: file.name || (kind === 'voice' ? 'Voiceover' : 'Music'), volume: kind === 'voice' ? 1 : 0.7, start: Math.max(0, +start || 0), trimStart: 0, fadeIn: kind === 'music' ? 1 : 0, fadeOut: kind === 'music' ? 2 : 0, duration: 0 };
  const buf = await decodeTrack(track);
  if (!buf) throw new Error('Could not read that audio file');
  track.duration = buf.duration;
  (project.audio ||= []).push(track);
  return track;
}

function envelope(gain, track, at, from, to, ctxTime) {
  // gain automation for [from, to] in project time, scheduled at ctxTime = context time for project time `at`
  const vol = Math.max(0, +track.volume || 0);
  const fi = Math.max(0, +track.fadeIn || 0), fo = Math.max(0, +track.fadeOut || 0);
  const g = gain.gain;
  const T = (pt) => ctxTime + (pt - at);
  const level = (pt) => {
    let v = vol;
    if (fi > 0) v *= Math.min(1, Math.max(0, (pt - track.start) / fi));
    if (fo > 0) v *= Math.min(1, Math.max(0, (to - pt) / fo));
    return v;
  };
  g.setValueAtTime(level(from), T(from));
  if (fi > 0 && from < track.start + fi) g.linearRampToValueAtTime(level(Math.min(to, track.start + fi)), T(Math.min(to, track.start + fi)));
  if (fo > 0 && to - fo > from) { g.setValueAtTime(level(to - fo), T(to - fo)); g.linearRampToValueAtTime(0, T(to)); }
}

/** Glue compressor → brick-wall limiter → soft clip, so big explosions never distort. Returns the input node. */
function masterBus(ctx, dest) {
  const input = ctx.createGain();
  input.gain.value = 0.7;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  const clip = ctx.createWaveShaper();
  const n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2) * 0.89; }
  clip.curve = curve;
  input.connect(glue).connect(lim).connect(clip).connect(dest);
  return input;
}

/** Mix all tracks into one stereo AudioBuffer of `duration` seconds (project time). */
export async function mixProject(project, duration, events = []) {
  const tracks = (project.audio || []).filter((t) => !t.muted);
  const synth = hasSound(project);
  if ((!tracks.length && !synth) || !(duration > 0)) return null;
  const off = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  let any = false;
  if (synth) {
    const bus = masterBus(off, off.destination);
    scheduleAll(off, bus, project, events, 0, duration, 0);
    any = true;
  }
  for (const t of tracks) {
    const buf = await decodeTrack(t).catch(() => null);
    if (!buf) continue;
    const avail = buf.duration - (+t.trimStart || 0);
    const end = Math.min(duration, t.start + avail);
    if (end <= t.start) continue;
    const src = off.createBufferSource();
    src.buffer = buf;
    const gain = off.createGain();
    src.connect(gain).connect(off.destination);
    envelope(gain, t, 0, t.start, end, 0);
    src.start(t.start, +t.trimStart || 0, end - t.start);
    any = true;
  }
  if (!any) return null;
  return await off.startRendering();
}

/** Start live preview playback from project time `pt`. */
let liveBus = null;
export async function playFrom(project, pt, rate = 1, events = [], until = Infinity) {
  stopPlayback();
  const tracks = (project.audio || []).filter((t) => !t.muted);
  if ((!tracks.length && !hasSound(project)) || rate !== 1) return;
  const ctx = ctxLive();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const now = ctx.currentTime + 0.05;
  if (hasSound(project)) {
    liveBus = masterBus(ctx, ctx.destination);
    scheduleAll(ctx, liveBus, project, events, pt, Math.min(until, pt + 120), now);
  }
  for (const t of tracks) {
    const buf = await decodeTrack(t).catch(() => null);
    if (!buf) continue;
    const end = t.start + buf.duration - (+t.trimStart || 0);
    if (end <= pt) continue;
    const from = Math.max(pt, t.start);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    envelope(gain, t, pt, from, end, now);
    src.start(now + (from - pt), (+t.trimStart || 0) + (from - t.start));
    playingNodes.push(src);
  }
}
export function stopPlayback() {
  for (const n of playingNodes) { try { n.stop(); } catch { /* already stopped */ } }
  playingNodes = [];
  if (liveBus) { try { liveBus.disconnect(); } catch { /* ignore */ } liveBus = null; }
}

// ---- voiceover recording ----
let rec = null;
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: r.mimeType || 'audio/webm' })); }; });
  r.start(250);
  rec = { r, done };
}
export async function stopRecording() {
  if (!rec) return null;
  const { r, done } = rec;
  rec = null;
  r.stop();
  return await done;
}
export const isRecording = () => !!rec;

/** Pick an audio encoder config usable inside MP4. */
export async function pickAudioCodec() {
  if (!('AudioEncoder' in window)) return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const config = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, mux }; } catch { /* next */ }
  }
  return null;
}

/** Encode an AudioBuffer and feed chunks to the muxer. */
export async function encodeAudio(buffer, picked, muxer) {
  let err = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { err = e; } });
  enc.configure(picked.config);
  const L = buffer.getChannelData(0), Rr = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const N = 1024 * 4;
  for (let i = 0; i < buffer.length; i += N) {
    const n = Math.min(N, buffer.length - i);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0);
    data.set(Rr.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data });
    enc.encode(ad);
    ad.close();
    if (err) throw err;
  }
  await enc.flush();
  enc.close();
  if (err) throw err;
}
