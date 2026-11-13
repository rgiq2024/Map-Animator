// Builds real-recording sound sprites for typing (GitHub Actions: .github/workflows/sfx-library.yml):
// downloads openly licensed recordings from Wikimedia Commons, cuts clean single key strikes, space bars,
// a carriage return and a bell, and writes sfx/typewriter.wav, sfx/keyboard.wav and sfx/samples.json.
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const SR = 44100;
const UA = { 'User-Agent': 'GIS-One-Map-Animator sound library (github.com/rgiq2024/Map-Animator)' };
const SRC = {
  typewriter: [
    { file: 'WWS Typewriter.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/2/25/WWS_Typewriter.ogg', credit: '“WWS Typewriter” (Erika 5), Work with Sounds / Wikimedia Commons, CC BY 4.0' },
    { file: 'Smith-Corona Prestige Auto 12 typing.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Smith-Corona_Prestige_Auto_12_typing.ogg', credit: '“Smith-Corona Prestige Auto 12 typing”, Wikimedia Commons, CC BY 3.0', extra: true },
  ],
  bell: { file: '406243 stubb typewriter-ding-near-mono.wav', url: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/406243_stubb_typewriter-ding-near-mono.wav', credit: '“Typewriter ding” by stubb, Wikimedia Commons, CC0' },
  keyboard: [
    { file: 'Typing - Model M 1986.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Typing_-_Model_M_1986.ogg', credit: '“Typing – Model M 1986”, Wikimedia Commons, CC0' },
    { file: 'IBM M2 sound.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/1/16/IBM_M2_sound.ogg', credit: '“IBM M2 sound”, Wikimedia Commons, CC0' },
    { file: 'Typing - Model M13 1999.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Typing_-_Model_M13_1999.ogg', credit: '“Typing – Model M13 1999”, Wikimedia Commons, CC0' },
  ],
};
const log = (...a) => console.log(...a);
async function pcm(src) {
  const r = await fetch(src.url, { headers: UA });
  if (!r.ok) throw new Error(`${src.file}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const p = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-af', 'highpass=f=90', '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'], { input: buf, maxBuffer: 1 << 28 });
  if (p.status !== 0) throw new Error(`ffmpeg: ${p.stderr}`);
  const a = new Float32Array(p.stdout.buffer, p.stdout.byteOffset, p.stdout.length / 4);
  log(`${src.file}: ${(a.length / SR).toFixed(1)} s`);
  return Float32Array.from(a);
}
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
/** onsets from a high-passed energy envelope (2.5 ms hops) */
function onsets(a) {
  // simple 1-pole high-pass so the clicks stand out
  const h = new Float32Array(a.length); let px = 0, py = 0;
  for (let i = 0; i < a.length; i++) { py = 0.97 * (py + a[i] - px); px = a[i]; h[i] = py; }
  const hop = Math.round(SR * 0.0025), n = Math.floor(a.length / hop), env = new Float32Array(n);
  for (let f = 0; f < n; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) s += h[i] * h[i]; env[f] = db(Math.sqrt(s / hop)); }
  const sorted = Array.from(env).sort((x, y) => x - y), floor = sorted[Math.floor(n * 0.2)], top = sorted[Math.floor(n * 0.995)];
  const thr = Math.max(floor + 14, top - 32);
  const out = [];
  for (let f = 6; f < n - 2; f++) {
    const prev = Math.min(...env.slice(f - 6, f));
    if (env[f] > thr && env[f] - prev > 10 && (!out.length || f - out.at(-1).f > 10)) {
      let pk = f; for (let k = f; k < Math.min(n, f + 8); k++) if (env[k] > env[pk]) pk = k;
      out.push({ f, i: f * hop, peak: env[pk] });
    }
  }
  return { list: out, env, hop, floor, thr };
}
/** spectral brightness of a cut (zero-crossing rate is a cheap stand-in for the centroid) */
const zcr = (a) => { let z = 0; for (let i = 1; i < a.length; i++) if ((a[i] >= 0) !== (a[i - 1] >= 0)) z++; return z / a.length; };
function cut(a, i0, len, fadeMs = 18, gate = 0) {
  // start right at the strike: the first sample above a third of the hit's peak, 2 ms before it
  let pk0 = 0; for (let k = i0; k < Math.min(a.length, i0 + Math.round(SR * 0.05)); k++) pk0 = Math.max(pk0, Math.abs(a[k]));
  let st = i0; while (st < a.length && Math.abs(a[st]) < pk0 * 0.33) st++;
  const s = Math.max(0, st - Math.round(SR * 0.002)), out = a.slice(s, Math.min(a.length, s + len));
  // decay gate: let the strike ring, then fade the room noise away
  if (gate > 0) { const g0 = Math.round(SR * gate); for (let k = g0; k < out.length; k++) out[k] *= Math.exp(-(k - g0) / (SR * gate * 0.8)); }
  const f = Math.round(SR * fadeMs / 1000), fi = Math.round(SR * 0.0015);
  for (let k = 0; k < fi && k < out.length; k++) out[k] *= k / fi;
  for (let k = 0; k < f && k < out.length; k++) out[out.length - 1 - k] *= k / f;
  let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
  if (pk > 0) for (let k = 0; k < out.length; k++) out[k] *= 0.7 / pk;  // ≈ −3 dB peak
  return out;
}
function strikes(a, { len = 0.15, iso = 0.09, max = 16, name = '', gate = 0.04 } = {}) {
  const { list } = onsets(a);
  const L = Math.round(SR * len), I = Math.round(SR * iso);
  const best = Math.max(...list.map((o) => o.peak));
  const ok = list.filter((o, k) => (k === list.length - 1 || list[k + 1].i - o.i > Math.max(I, L + Math.round(SR * 0.02))) && (k === 0 || o.i - list[k - 1].i > Math.round(SR * 0.04)) && o.peak > best - 14);
  log(`${name}: ${list.length} onsets, ${ok.length} clean`);
  // spread the picks over the recording
  const step = Math.max(1, ok.length / max), picks = [];
  for (let k = 0; k < ok.length && picks.length < max; k += step) picks.push(ok[Math.floor(k)]);
  return picks.map((o) => { const c = cut(a, o.i, L, 15, gate); return { c, z: zcr(c.slice(0, Math.round(SR * 0.03))), peak: o.peak }; });
}
/** the longest continuous loud stretch (carriage return / ratchet), 0.3–1.2 s */
function carriage(a) {
  const { env, hop, floor } = onsets(a);
  const thr = floor + 12;
  let best = null;
  for (let f = 0, s = -1; f < env.length; f++) {
    if (env[f] > thr) { if (s < 0) s = f; } else if (s >= 0) {
      // allow short gaps of < 20 ms
      let g = f; while (g < env.length && g - f < 8 && env[g] <= thr) g++;
      if (g < env.length && g - f < 8) { f = g; continue; }
      const dur = (f - s) * hop / SR;
      if (dur >= 0.3 && dur <= 1.4 && (!best || dur > best.dur)) best = { i: s * hop, dur };
      s = -1;
    }
  }
  if (!best) return null;
  log(`carriage: ${best.dur.toFixed(2)} s at ${(best.i / SR).toFixed(2)} s`);
  return cut(a, best.i, Math.round(SR * Math.min(1.2, best.dur + 0.12)), 60);
}
function trimBell(a) {
  let i = 0; while (i < a.length && Math.abs(a[i]) < 0.02) i++;
  return cut(a, i, Math.round(SR * 1.4), 400);
}
/** concatenates clips into one mono 16-bit WAV, returns [start, dur] for each */
function sprite(groups) {
  const gap = Math.round(SR * 0.05), idx = {}, parts = [];
  let pos = 0;
  for (const [k, clips] of Object.entries(groups)) {
    idx[k] = [];
    for (const c of clips) { idx[k].push([+(pos / SR).toFixed(5), +(c.length / SR).toFixed(5)]); parts.push(c, new Float32Array(gap)); pos += c.length + gap; }
  }
  const pcm16 = Buffer.alloc(pos * 2); let o = 0;
  for (const p of parts) for (const v of p) { pcm16.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), o); o += 2; }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm16.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm16.length, 40);
  return { wav: Buffer.concat([h, pcm16]), idx };
}
function splitSpace(hits, nSpace = 3) {
  // the space bar is the duller, lower strike
  const byZ = hits.slice().sort((x, y) => x.z - y.z);
  const space = byZ.slice(0, nSpace), keys = byZ.slice(nSpace);
  return { keys: keys.map((h) => h.c), space: space.map((h) => h.c) };
}

await mkdir(new URL('../sfx/', import.meta.url), { recursive: true });
const credits = [];
// typewriter
const tw = await pcm(SRC.typewriter[0]); credits.push(SRC.typewriter[0].credit);
let twHits = strikes(tw, { len: 0.13, iso: 0.13, max: 20, name: 'typewriter', gate: 0.055 });
const ret = null; // the carriage return is built from real clicks in the app
if (twHits.length < 10) {
  const tw2 = await pcm(SRC.typewriter[1]); credits.push(SRC.typewriter[1].credit);
  twHits = twHits.concat(strikes(tw2, { len: 0.13, iso: 0.13, max: 20 - twHits.length, name: 'typewriter 2', gate: 0.055 }));
}
const bell = trimBell(await pcm(SRC.bell)); credits.push(SRC.bell.credit);
const T = splitSpace(twHits, 3);
const twS = sprite({ keys: T.keys, space: T.space, ret: ret ? [ret] : [], bell: [bell] });
await writeFile(new URL('../sfx/typewriter.wav', import.meta.url), twS.wav);
// computer keyboard
let kbHits = [];
for (const s of SRC.keyboard) {
  try { await new Promise((r) => setTimeout(r, 2500)); const a = await pcm(s); const h = strikes(a, { len: 0.1, iso: 0.1, max: 9, name: s.file, gate: 0.035 }); if (h.length) { kbHits = kbHits.concat(h); credits.push(s.credit); } } catch (e) { log(`skip ${s.file}: ${e.message}`); }
}
const K = splitSpace(kbHits, 3);
const kbS = sprite({ keys: K.keys, space: K.space });
await writeFile(new URL('../sfx/keyboard.wav', import.meta.url), kbS.wav);
await writeFile(new URL('../sfx/samples.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), sets: { typewriter: { file: 'sfx/typewriter.wav', ...twS.idx }, keyboard: { file: 'sfx/keyboard.wav', ...kbS.idx } }, credits }, null, 1));
log(`typewriter: ${T.keys.length} keys, ${T.space.length} spaces, return ${ret ? 'yes' : 'no'}, bell yes — ${Math.round(twS.wav.length / 1024)} kB`);
log(`keyboard: ${K.keys.length} keys, ${K.space.length} spaces — ${Math.round(kbS.wav.length / 1024)} kB`);
