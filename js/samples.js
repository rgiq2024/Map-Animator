// Real recorded typing sounds (sfx/*.wav sprites built by .github/workflows/sfx-library.yml from openly
// licensed Wikimedia Commons recordings). Loaded once, shared by every audio context (live and export).
let lib = null, loading = null;
export function loadSamples() {
  if (lib) return Promise.resolve(lib);
  loading ||= (async () => {
    const j = await (await fetch(`sfx/samples.json?v=${Math.floor(Date.now() / 864e5)}`)).json();
    const ac = new OfflineAudioContext(1, 1, 44100);
    const sets = {};
    for (const [k, st] of Object.entries(j.sets || {})) {
      const buf = await ac.decodeAudioData(await (await fetch(st.file)).arrayBuffer());
      sets[k] = { ...st, buf };
    }
    lib = sets;
    return lib;
  })().catch(() => { loading = null; return null; });
  return loading;
}
export const samplesReady = () => !!lib;
let last = {};
/**
 * Plays one clip of a group (keys / space / bell …) at `when`. n picks the clip (deterministic),
 * a different one from the previous strike of the same group. Returns false when not loaded.
 */
export function playSample(ctx, out, set, group, when, { vol = 1, rate = 1, n = 0, hp = 0, lp = 0 } = {}) {
  const S = lib?.[set], arr = S?.[group];
  if (!arr?.length || when < ctx.currentTime) return false;
  let k = Math.abs(Math.floor(n * 7919 + 13)) % arr.length;
  const lk = `${set}:${group}`;
  if (arr.length > 1 && k === last[lk]) k = (k + 1) % arr.length;
  last[lk] = k;
  const [st, du] = arr[k];
  const src = ctx.createBufferSource();
  src.buffer = S.buf; src.playbackRate.value = rate;
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  const g = ctx.createGain(); g.gain.value = vol;
  node.connect(g).connect(out);
  src.start(when, st, du);
  return true;
}

// ---------------------------------------------------------------- music tracks (music/*.mp3)
export const MUSIC_TRACKS = {
  'track:total-war-epic-action': { name: 'Total War — epic action trailer', file: 'music/total-war-epic-action.mp3', by: 'AudioAtlant' },
  'track:epic-cinematic': { name: 'Epic cinematic', file: 'music/epic-cinematic.mp3', by: 'The Mountain' },
  'track:epic-mountain': { name: 'Epic (dark, driving)', file: 'music/epic-mountain.mp3', by: 'The Mountain' },
  'track:epic-kulakovka': { name: 'Epic (big build)', file: 'music/epic-kulakovka.mp3', by: 'Kulakovka' },
  'track:motivational-epic': { name: 'Motivational epic', file: 'music/motivational-epic.mp3', by: 'AtlasAudio' },
  'track:in-the-bardo': { name: 'In the Bardo (ambient, slow)', file: 'music/in-the-bardo.mp3', by: 'Alana Jordan' },
};
const tracks = new Map();
/** decoded AudioBuffer of a music track (cached) */
export function loadTrack(id) {
  const t = MUSIC_TRACKS[id];
  if (!t) return Promise.resolve(null);
  if (!tracks.has(id)) {
    tracks.set(id, (async () => { const ac = new OfflineAudioContext(2, 1, 44100); return ac.decodeAudioData(await (await fetch(t.file)).arrayBuffer()); })().catch(() => { tracks.delete(id); return null; }));
  }
  return tracks.get(id);
}
let decoded = new Map();
export function trackBuffer(id) { return decoded.get(id) || null; }
export async function readyTrack(id) { const b = await loadTrack(id); if (b) decoded.set(id, b); return b; }
