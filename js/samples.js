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
