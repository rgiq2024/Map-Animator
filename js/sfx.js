// Synthesised cinematic sound: background scores and sound effects (explosions, bomb whistles, jet
// fly-bys, drones, helicopters, missile launches, rocket rumble, wind, whooshes, HUD beeps & glitches,
// typing). Everything is generated with Web Audio, so it works offline and exports into the MP4.

export const MUSIC = { none: 'None', tension: 'Tension (military)', epic: 'Epic (drums & brass)', ambient: 'Ambient (calm)', documentary: 'Documentary (piano)', space: 'Space (atmospheric)' };
export const SFX_KINDS = new Set(['strike', 'bombing', 'trajectory', 'launch', 'satellite', 'iss', 'vehicle', 'hud', 'flicker', 'capture', 'model3d', 'videofx', 'target', 'hudtext', 'compare', 'timeseries', 'title', 'news', 'effect']);
export function defaultSound() { return { auto: true, sfxVolume: 0.9, music: 'none', musicVolume: 0.45, zoomWind: true }; }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const noiseCache = new WeakMap();
function noise(ctx, kind = 'white') {
  let m = noiseCache.get(ctx);
  if (!m) { m = {}; noiseCache.set(ctx, m); }
  if (m[kind]) return m[kind];
  const len = ctx.sampleRate * 3;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
      else d[i] = w;
    }
  }
  m[kind] = b;
  return b;
}
function src(ctx, kind, when, dur, loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx, kind);
  s.loop = loop;
  s.start(when, Math.random() * 2);
  s.stop(when + dur + 0.05);
  return s;
}
function env(ctx, when, pts) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  for (const [t, v, exp] of pts) {
    if (exp) g.gain.exponentialRampToValueAtTime(Math.max(1e-4, v), when + t);
    else g.gain.linearRampToValueAtTime(v, when + t);
  }
  return g;
}
function filt(ctx, type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function osc(ctx, type, f, when, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, when); o.start(when); o.stop(when + dur + 0.05); return o; }
function pan(ctx, v) { const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = clamp(v, -1, 1); return p; }
let _rev = new WeakMap();
function reverb(ctx, out) {
  let r = _rev.get(ctx);
  if (r && r.out === out) return r.node;
  const len = ctx.sampleRate * 2.6;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  const c = ctx.createConvolver(); c.buffer = ir;
  const g = ctx.createGain(); g.gain.value = 0.35;
  c.connect(g).connect(out);
  _rev.set(ctx, { out, node: c });
  return c;
}

// ---------------------------------------------------------------- effect synths: (ctx, out, when, p)
const SYN = {
  explosion(ctx, out, w, p) {
    const k = clamp(p.size || 1, 0.3, 3);
    const v = (p.vol ?? 1) * Math.min(1.2, 0.55 + 0.25 * k);
    const pn = pan(ctx, p.pan || 0); pn.connect(out); pn.connect(reverb(ctx, out));
    // crack
    const c = src(ctx, 'white', w, 0.25); const cf = filt(ctx, 'highpass', 900); const cg = env(ctx, w, [[0.005, 0.9 * v], [0.2, 0.001, 1]]);
    c.connect(cf).connect(cg).connect(pn);
    // body
    const b = src(ctx, 'white', w, 3.5); const bf = filt(ctx, 'lowpass', 2400, 0.5);
    bf.frequency.setValueAtTime(2400, w); bf.frequency.exponentialRampToValueAtTime(160, w + 2.2);
    const bg = env(ctx, w, [[0.01, 1.1 * v], [0.35, 0.6 * v], [3.4, 0.001, 1]]);
    b.connect(bf).connect(bg).connect(pn);
    // sub thump
    const o = osc(ctx, 'sine', 70, w, 1.4); o.frequency.exponentialRampToValueAtTime(28, w + 1.2);
    const og = env(ctx, w, [[0.01, 1.2 * v], [1.3, 0.001, 1]]); o.connect(og).connect(pn);
    // rumble tail
    const r = src(ctx, 'brown', w + 0.2, 5); const rf = filt(ctx, 'lowpass', 220); const rg = env(ctx, w + 0.2, [[0.4, 0.7 * v], [4.8, 0.001, 1]]);
    r.connect(rf).connect(rg).connect(pn);
    // debris crackle
    for (let i = 0; i < 10; i++) {
      const t = w + 0.3 + Math.random() * 1.8;
      const d = src(ctx, 'white', t, 0.05); const df = filt(ctx, 'bandpass', 1500 + Math.random() * 3000, 3); const dg = env(ctx, t, [[0.003, 0.25 * v * Math.random()], [0.05, 0.001, 1]]);
      d.connect(df).connect(dg).connect(pn);
    }
  },
  whistle(ctx, out, w, p) {
    const d = p.dur || 1.1;
    const o = osc(ctx, 'sine', 2200, w, d); o.frequency.exponentialRampToValueAtTime(520, w + d);
    const g = env(ctx, w, [[0.1, 0.06 * (p.vol ?? 1)], [d * 0.85, 0.18 * (p.vol ?? 1)], [d, 0.001, 1]]);
    o.connect(g).connect(out);
  },
  jet(ctx, out, w, p) {
    const d = Math.max(1.5, p.dur || 3), v = p.vol ?? 1;
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pn.pan) { pn.pan.setValueAtTime(-0.9, w); pn.pan.linearRampToValueAtTime(0.9, w + d); }
    pn.connect(out); pn.connect(reverb(ctx, out));
    const n = src(ctx, 'pink', w, d); const f = filt(ctx, 'bandpass', 1400, 0.9);
    f.frequency.setValueAtTime(2200, w); f.frequency.linearRampToValueAtTime(1600, w + d * 0.45); f.frequency.exponentialRampToValueAtTime(380, w + d);
    const g = env(ctx, w, [[d * 0.15, 0.25 * v], [d * 0.48, 1.0 * v], [d * 0.62, 0.8 * v], [d, 0.001, 1]]);
    n.connect(f).connect(g).connect(pn);
    const r = src(ctx, 'brown', w, d); const rf = filt(ctx, 'lowpass', 300); const rg = env(ctx, w, [[d * 0.5, 0.9 * v], [d, 0.001, 1]]);
    r.connect(rf).connect(rg).connect(pn);
    const o = osc(ctx, 'sawtooth', 230, w, d); o.frequency.linearRampToValueAtTime(260, w + d * 0.45); o.frequency.linearRampToValueAtTime(150, w + d);
    const of = filt(ctx, 'lowpass', 900); const og = env(ctx, w, [[d * 0.5, 0.07 * v], [d, 0.001, 1]]);
    o.connect(of).connect(og).connect(pn);
  },
  airliner(ctx, out, w, p) { SYN.jet(ctx, out, w, { ...p, vol: (p.vol ?? 1) * 0.6 }); },
  drone(ctx, out, w, p) {
    const d = Math.max(0.5, p.dur || 3), v = p.vol ?? 1;
    const o1 = osc(ctx, 'sawtooth', 118, w, d), o2 = osc(ctx, 'sawtooth', 237, w, d);
    const f = filt(ctx, 'lowpass', 900);
    const trem = ctx.createGain(); trem.gain.value = 0.6;
    const lfo = osc(ctx, 'sine', 17, w, d); const lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg).connect(trem.gain);
    const g = env(ctx, w, [[0.6, 0.11 * v], [Math.max(0.7, d - 0.6), 0.11 * v], [d, 0.001, 1]]);
    o1.connect(f); o2.connect(f); f.connect(trem).connect(g).connect(out);
  },
  heli(ctx, out, w, p) {
    const d = Math.max(0.5, p.dur || 3), v = p.vol ?? 1;
    const n = src(ctx, 'brown', w, d); const f = filt(ctx, 'lowpass', 600);
    const chop = ctx.createGain(); chop.gain.value = 0.2;
    const lfo = osc(ctx, 'square', 11, w, d); const lg = ctx.createGain(); lg.gain.value = 0.8; lfo.connect(lg).connect(chop.gain);
    const g = env(ctx, w, [[0.8, 1.1 * v], [Math.max(0.9, d - 0.8), 1.1 * v], [d, 0.001, 1]]);
    n.connect(f).connect(chop).connect(g).connect(out);
  },
  engine(ctx, out, w, p) {
    const d = Math.max(0.5, p.dur || 3), v = p.vol ?? 1;
    const o = osc(ctx, 'sawtooth', 42, w, d); const f = filt(ctx, 'lowpass', 260);
    const n = src(ctx, 'brown', w, d);
    const g = env(ctx, w, [[0.5, 0.5 * v], [Math.max(0.6, d - 0.5), 0.5 * v], [d, 0.001, 1]]);
    o.connect(f); n.connect(f); f.connect(g).connect(out);
  },
  missile(ctx, out, w, p) {
    const v = p.vol ?? 1, d = Math.max(1, p.dur || 2);
    const n = src(ctx, 'white', w, d); const f = filt(ctx, 'bandpass', 400, 0.8);
    f.frequency.setValueAtTime(300, w); f.frequency.exponentialRampToValueAtTime(3200, w + 0.6); f.frequency.exponentialRampToValueAtTime(1200, w + d);
    const g = env(ctx, w, [[0.05, 0.9 * v], [0.5, 0.6 * v], [d, 0.001, 1]]);
    n.connect(f).connect(g).connect(out); f.connect(reverb(ctx, out));
    const t = osc(ctx, 'sine', 90, w, 0.5); t.frequency.exponentialRampToValueAtTime(40, w + 0.4);
    const tg = env(ctx, w, [[0.01, 0.9 * v], [0.45, 0.001, 1]]); t.connect(tg).connect(out);
  },
  rocket(ctx, out, w, p) {
    const d = Math.max(3, p.dur || 6), v = p.vol ?? 1;
    const r = src(ctx, 'brown', w, d); const rf = filt(ctx, 'lowpass', 380);
    const rg = env(ctx, w, [[1.2, 1.3 * v], [d * 0.7, 1.1 * v], [d, 0.001, 1]]);
    r.connect(rf).connect(rg).connect(out); rf.connect(reverb(ctx, out));
    const c = src(ctx, 'white', w + 0.8, d); const cf = filt(ctx, 'bandpass', 900, 0.6);
    const cg = env(ctx, w + 0.8, [[0.6, 0.35 * v], [d * 0.6, 0.25 * v], [d - 0.8, 0.001, 1]]);
    c.connect(cf).connect(cg).connect(out);
  },
  whoosh(ctx, out, w, p) {
    const d = clamp(p.dur || 1.2, 0.3, 8), v = p.vol ?? 1;
    const n = src(ctx, 'pink', w, d); const f = filt(ctx, 'bandpass', 300, 1.2);
    const up = p.dir !== 'down';
    f.frequency.setValueAtTime(up ? 250 : 2600, w); f.frequency.exponentialRampToValueAtTime(up ? 2800 : 220, w + d * 0.8);
    const g = env(ctx, w, [[d * 0.6, 0.9 * v], [d, 0.001, 1]]);
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pn.pan) { pn.pan.setValueAtTime(-0.5, w); pn.pan.linearRampToValueAtTime(0.5, w + d); }
    n.connect(f).connect(g).connect(pn).connect(out);
  },
  wind(ctx, out, w, p) {
    const d = clamp(p.dur || 3, 0.5, 30), v = p.vol ?? 1;
    const n = src(ctx, 'pink', w, d); const f = filt(ctx, 'bandpass', 600, 1.4);
    const lfo = osc(ctx, 'sine', 0.35, w, d); const lg = ctx.createGain(); lg.gain.value = 350; lfo.connect(lg).connect(f.frequency);
    const g = env(ctx, w, [[d * 0.3, 0.7 * v], [d * 0.7, 0.8 * v], [d, 0.001, 1]]);
    n.connect(f).connect(g).connect(out);
  },
  beep(ctx, out, w, p) {
    const o = osc(ctx, 'sine', p.freq || 1400, w, 0.12);
    const g = env(ctx, w, [[0.005, 0.18 * (p.vol ?? 1)], [0.1, 0.001, 1]]);
    o.connect(g).connect(out);
  },
  ping(ctx, out, w, p) {
    const o = osc(ctx, 'sine', p.freq || 1250, w, 1.6);
    const g = env(ctx, w, [[0.005, 0.22 * (p.vol ?? 1)], [1.5, 0.001, 1]]);
    o.connect(g).connect(out); g.connect(reverb(ctx, out));
  },
  glitch(ctx, out, w, p) {
    const d = p.dur || 0.6, v = p.vol ?? 1;
    for (let t = 0; t < d; t += 0.035 + Math.random() * 0.05) {
      if (Math.random() < 0.45) continue;
      const n = src(ctx, 'white', w + t, 0.04); const f = filt(ctx, 'bandpass', 800 + Math.random() * 4000, 2);
      const g = env(ctx, w + t, [[0.002, 0.3 * v], [0.035, 0.001, 1]]);
      n.connect(f).connect(g).connect(out);
      if (Math.random() < 0.3) { const o = osc(ctx, 'square', 300 + Math.random() * 2000, w + t, 0.03); const og = env(ctx, w + t, [[0.002, 0.05 * v], [0.03, 0.001, 1]]); o.connect(og).connect(out); }
    }
  },
  hudboot(ctx, out, w, p) {
    SYN.glitch(ctx, out, w, { dur: 0.5, vol: p.vol });
    [0.45, 0.6, 0.75].forEach((t, i) => SYN.beep(ctx, out, w + t, { freq: 1100 + i * 300, vol: p.vol }));
    const h = osc(ctx, 'sine', 60, w, 1.2); const hg = env(ctx, w, [[0.3, 0.08 * (p.vol ?? 1)], [1.2, 0.001, 1]]); h.connect(hg).connect(out);
  },
  lock(ctx, out, w, p) { [0, 0.09, 0.18].forEach((t) => SYN.beep(ctx, out, w + t, { freq: 1800, vol: p.vol })); SYN.beep(ctx, out, w + 0.35, { freq: 2400, vol: p.vol }); },
  type(ctx, out, w, p) {
    const n = Math.max(1, Math.min(80, p.n || 10)), d = p.dur || 1;
    for (let i = 0; i < n; i++) {
      const t = w + (i / n) * d + Math.random() * 0.01;
      const c = src(ctx, 'white', t, 0.03); const f = filt(ctx, 'highpass', 2500);
      const g = env(ctx, t, [[0.001, 0.22 * (p.vol ?? 1)], [0.025, 0.001, 1]]);
      c.connect(f).connect(g).connect(out);
    }
  },
  braam(ctx, out, w, p) {
    const d = p.dur || 3.5, v = p.vol ?? 1;
    const f = filt(ctx, 'lowpass', 200, 2);
    f.frequency.setValueAtTime(180, w); f.frequency.exponentialRampToValueAtTime(1400, w + 0.5); f.frequency.exponentialRampToValueAtTime(240, w + d);
    for (const fr of [55, 55.6, 82.4, 110]) { const o = osc(ctx, 'sawtooth', fr, w, d); o.connect(f); }
    const g = env(ctx, w, [[0.08, 0.35 * v], [d, 0.001, 1]]);
    f.connect(g).connect(out); g.connect(reverb(ctx, out));
    const s = osc(ctx, 'sine', 45, w, 1.5); const sg = env(ctx, w, [[0.02, 0.7 * v], [1.5, 0.001, 1]]); s.connect(sg).connect(out);
  },
};

// more library sounds
Object.assign(SYN, {
  riser(ctx, out, w, p) {
    const d = clamp(p.dur || 2.5, 0.5, 10), v = p.vol ?? 1;
    const n = src(ctx, 'white', w, d); const f = filt(ctx, 'bandpass', 300, 2);
    f.frequency.setValueAtTime(200, w); f.frequency.exponentialRampToValueAtTime(6000, w + d);
    const g = env(ctx, w, [[d * 0.9, 0.5 * v], [d, 0.001, 1]]);
    n.connect(f).connect(g).connect(out); g.connect(reverb(ctx, out));
    const o = osc(ctx, 'sawtooth', 110, w, d); o.frequency.exponentialRampToValueAtTime(880, w + d);
    const of = filt(ctx, 'lowpass', 1200); const og = env(ctx, w, [[d * 0.9, 0.08 * v], [d, 0.001, 1]]);
    o.connect(of).connect(og).connect(out);
  },
  hit(ctx, out, w, p) {
    const v = p.vol ?? 1;
    const o = osc(ctx, 'sine', 90, w, 1.8); o.frequency.exponentialRampToValueAtTime(32, w + 1.5);
    const g = env(ctx, w, [[0.005, 1.3 * v], [1.8, 0.001, 1]]); o.connect(g).connect(out);
    const n = src(ctx, 'white', w, 0.6); const f = filt(ctx, 'lowpass', 3000);
    const ng = env(ctx, w, [[0.003, 0.8 * v], [0.5, 0.001, 1]]); n.connect(f).connect(ng).connect(out); ng.connect(reverb(ctx, out));
  },
  sub(ctx, out, w, p) {
    const v = p.vol ?? 1;
    const o = osc(ctx, 'sine', 48, w, 3); o.frequency.exponentialRampToValueAtTime(26, w + 2.8);
    const g = env(ctx, w, [[0.02, 1.4 * v], [3, 0.001, 1]]); o.connect(g).connect(out);
  },
  static(ctx, out, w, p) {
    const d = clamp(p.dur || 1.2, 0.2, 10), v = p.vol ?? 1;
    const n = src(ctx, 'white', w, d); const f = filt(ctx, 'bandpass', 2400, 0.6);
    const g = env(ctx, w, [[0.03, 0.35 * v], [d - 0.05, 0.3 * v], [d, 0.001, 1]]);
    n.connect(f).connect(g).connect(out);
    for (let t = 0; t < d; t += 0.08) if (Math.random() < 0.3) SYN.beep(ctx, out, w + t, { freq: 400 + Math.random() * 1600, vol: 0.15 * v });
  },
  radio(ctx, out, w, p) {
    SYN.static(ctx, out, w, { dur: 0.25, vol: p.vol });
    const o = osc(ctx, 'sine', 1000, w + 0.2, 0.18); const g = env(ctx, w + 0.2, [[0.005, 0.12 * (p.vol ?? 1)], [0.17, 0.001, 1]]); o.connect(g).connect(out);
  },
  heartbeat(ctx, out, w, p) {
    const n = clamp(Math.round((p.dur || 3) / 0.9), 1, 30), v = p.vol ?? 1;
    for (let i = 0; i < n; i++) for (const [dt, a] of [[0, 1], [0.22, 0.7]]) {
      const t = w + i * 0.9 + dt;
      const o = osc(ctx, 'sine', 62, t, 0.25); o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      const g = env(ctx, t, [[0.01, 0.9 * v * a], [0.22, 0.001, 1]]); o.connect(g).connect(out);
    }
  },
  shutter(ctx, out, w, p) {
    const v = p.vol ?? 1;
    for (const dt of [0, 0.07]) { const n = src(ctx, 'white', w + dt, 0.04); const f = filt(ctx, 'highpass', 1800); const g = env(ctx, w + dt, [[0.002, 0.5 * v], [0.04, 0.001, 1]]); n.connect(f).connect(g).connect(out); }
  },
  alarm(ctx, out, w, p) {
    const d = clamp(p.dur || 2, 0.5, 10), v = p.vol ?? 1;
    const o = osc(ctx, 'square', 700, w, d); const lfo = osc(ctx, 'sine', 2, w, d); const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg).connect(o.frequency);
    const f = filt(ctx, 'lowpass', 2500); const g = env(ctx, w, [[0.05, 0.08 * v], [d - 0.05, 0.08 * v], [d, 0.001, 1]]);
    o.connect(f).connect(g).connect(out);
  },
  click(ctx, out, w, p) { const o = osc(ctx, 'square', 2400, w, 0.02); const g = env(ctx, w, [[0.001, 0.15 * (p.vol ?? 1)], [0.018, 0.001, 1]]); o.connect(g).connect(out); },
  swoosh(ctx, out, w, p) { SYN.whoosh(ctx, out, w, { dur: 0.45, vol: p.vol ?? 1 }); },
  thunder(ctx, out, w, p) {
    const v = p.vol ?? 1;
    const n = src(ctx, 'brown', w, 5); const f = filt(ctx, 'lowpass', 900); f.frequency.exponentialRampToValueAtTime(120, w + 4.5);
    const g = env(ctx, w, [[0.05, 1.3 * v], [0.4, 0.7 * v], [1.2, 1.0 * v], [5, 0.001, 1]]);
    n.connect(f).connect(g).connect(out); g.connect(reverb(ctx, out));
    SYN.hit(ctx, out, w, { vol: v * 0.5 });
  },
  crowd(ctx, out, w, p) {
    const d = clamp(p.dur || 3, 0.5, 20), v = p.vol ?? 1;
    const n = src(ctx, 'pink', w, d); const f = filt(ctx, 'bandpass', 900, 0.8);
    const g = env(ctx, w, [[0.5, 0.35 * v], [d - 0.5, 0.35 * v], [d, 0.001, 1]]);
    n.connect(f).connect(g).connect(out);
  },
  gunshot(ctx, out, w, p) {
    const v = p.vol ?? 1;
    const n = src(ctx, 'white', w, 0.5); const f = filt(ctx, 'lowpass', 5000); f.frequency.exponentialRampToValueAtTime(400, w + 0.3);
    const g = env(ctx, w, [[0.002, 1.1 * v], [0.35, 0.001, 1]]); n.connect(f).connect(g).connect(out); g.connect(reverb(ctx, out));
  },
  sonar(ctx, out, w, p) { SYN.ping(ctx, out, w, { freq: 880, vol: p.vol }); },
});
/** The sound library: sounds you can drop on the timeline. */
export const SOUND_LIBRARY = {
  'Cinematic': { braam: 'Braam (trailer horn)', hit: 'Impact hit', riser: 'Riser (build-up)', sub: 'Sub boom', whoosh: 'Whoosh', swoosh: 'Swoosh (short)', heartbeat: 'Heartbeat' },
  'Action': { explosion: 'Explosion', whistle: 'Bomb whistle', missile: 'Missile launch', gunshot: 'Gunshot', thunder: 'Thunder' },
  'Vehicles': { jet: 'Jet fly-by', airliner: 'Airliner', heli: 'Helicopter', drone: 'Drone', engine: 'Engine rumble', rocket: 'Rocket launch' },
  'HUD & tech': { glitch: 'Glitch', static: 'Radio static', radio: 'Radio chirp', beep: 'Beep', ping: 'Ping', sonar: 'Sonar', lock: 'Target lock', hudboot: 'HUD boot', type: 'Typing', click: 'UI click', shutter: 'Camera shutter', alarm: 'Alarm' },
  'Ambience': { wind: 'Wind', crowd: 'Crowd murmur' },
};
export const SOUND_NAMES = Object.assign({}, ...Object.values(SOUND_LIBRARY));
/** Play one library sound now (preview). */
export function previewSound(ctx, out, type, p = {}) { const fn = SYN[type]; if (fn) fn(ctx, out, ctx.currentTime + 0.05, { dur: 2.5, n: 16, ...p }); }

// ---------------------------------------------------------------- music beds
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
function pad(ctx, out, w, d, notes, v, type = 'sawtooth', cutoff = 900) {
  const f = filt(ctx, 'lowpass', cutoff, 0.5);
  const g = env(ctx, w, [[Math.min(1.5, d * 0.4), v], [Math.max(d - 1.2, d * 0.6), v], [d, 0.001, 1]]);
  for (const n of notes) for (const det of [-6, 6]) { const o = osc(ctx, type, NOTE(n), w, d); o.detune.value = det; o.connect(f); }
  f.connect(g).connect(out);
}
function drum(ctx, out, w, v, low = 55) {
  const o = osc(ctx, 'sine', low * 2, w, 0.7); o.frequency.exponentialRampToValueAtTime(low * 0.6, w + 0.5);
  const g = env(ctx, w, [[0.005, v], [0.65, 0.001, 1]]); o.connect(g).connect(out);
  const n = src(ctx, 'brown', w, 0.4); const ng = env(ctx, w, [[0.005, v * 0.5], [0.35, 0.001, 1]]); n.connect(filt(ctx, 'lowpass', 400)).connect(ng).connect(out);
}
function pluck(ctx, out, w, n, v) {
  for (const [m, a] of [[1, 1], [2, 0.35], [3, 0.12]]) {
    const o = osc(ctx, 'sine', NOTE(n) * m, w, 2.2);
    const g = env(ctx, w, [[0.01, v * a], [2.1, 0.001, 1]]);
    o.connect(g).connect(out);
  }
}
/** Schedule music for project time [from, to) at context time `when` (= project time `from`). */
export function scheduleMusic(ctx, out, kind, from, to, when) {
  if (!kind || kind === 'none' || to <= from) return;
  const rv = reverb(ctx, out);
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(out); bus.connect(rv);
  const at = (t) => when + (t - from);
  if (kind === 'ambient' || kind === 'space') {
    const chords = kind === 'space' ? [[38, 45, 52, 57], [36, 43, 50, 55], [41, 48, 52, 60], [40, 47, 52, 59]] : [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]];
    const len = kind === 'space' ? 8 : 6;
    for (let t = Math.floor(from / len) * len; t < to; t += len) {
      const c = chords[Math.floor(t / len) % chords.length];
      const s = Math.max(t, from);
      pad(ctx, bus, at(s), Math.min(len + 1.5, to - s + 1), c, 0.035, kind === 'space' ? 'triangle' : 'sawtooth', kind === 'space' ? 1400 : 700);
      if (kind === 'space') for (let k = 0; k < 4; k++) { const tt = t + k * 2 + 0.5; if (tt >= from && tt < to) SYN.ping(ctx, bus, at(tt), { freq: NOTE(c[k % 4] + 24), vol: 0.25 }); }
    }
  } else if (kind === 'tension') {
    for (let t = Math.floor(from / 8) * 8; t < to; t += 8) {
      const s = Math.max(t, from);
      pad(ctx, bus, at(s), Math.min(9, to - s + 1), [33, 40], 0.06, 'sawtooth', 300);
    }
    for (let t = Math.ceil(from * 2) / 2; t < to; t += 0.5) {
      const beat = Math.round(t * 2);
      if (beat % 4 === 0) drum(ctx, bus, at(t), 0.5, 45);
      const o = osc(ctx, 'square', beat % 8 < 4 ? NOTE(57) : NOTE(56), at(t), 0.08);
      const g = env(ctx, at(t), [[0.005, 0.02], [0.08, 0.001, 1]]); o.connect(filt(ctx, 'lowpass', 1800)).connect(g).connect(bus);
    }
  } else if (kind === 'epic') {
    const chords = [[38, 45, 50, 57], [34, 41, 46, 53], [36, 43, 48, 55], [33, 40, 45, 52]];
    for (let t = Math.floor(from / 4) * 4; t < to; t += 4) {
      const s = Math.max(t, from);
      pad(ctx, bus, at(s), Math.min(4.6, to - s + 0.6), chords[Math.floor(t / 4) % 4], 0.045, 'sawtooth', 1100);
    }
    const pat = [0, 0.75, 1.5, 2, 2.5, 3, 3.25, 3.5];
    for (let bar = Math.floor(from / 4) * 4; bar < to; bar += 4) for (const o of pat) { const t = bar + o; if (t >= from && t < to) drum(ctx, bus, at(t), o === 0 || o === 2 ? 0.75 : 0.45, o === 0 ? 40 : 55); }
  } else if (kind === 'documentary') {
    const arp = [57, 60, 64, 67, 64, 60, 53, 57, 60, 65, 60, 57, 55, 59, 62, 67, 62, 59, 52, 55, 59, 64, 59, 55];
    for (let t = Math.ceil(from / 0.5) * 0.5; t < to; t += 0.5) pluck(ctx, bus, at(t), arp[Math.round(t * 2) % arp.length], 0.06);
    for (let t = Math.floor(from / 6) * 6; t < to; t += 6) { const s = Math.max(t, from); pad(ctx, bus, at(s), Math.min(6.5, to - s + 0.5), [45, 52], 0.02, 'triangle', 600); }
  }
}

// ---------------------------------------------------------------- automatic events
const AIR = { jet: 'jet', airliner: 'airliner', drone: 'drone', quad: 'drone', helicopter: 'heli', missile: 'missile', tank: 'engine' };
const MODE_SND = { plane: 'airliner', jet3d: 'jet', airliner3d: 'airliner', helicopter: 'heli', heli3d: 'heli', drone3d: 'drone', quad3d: 'drone', missile3d: 'missile', tank3d: 'engine', rocket: 'missile' };
/**
 * Build the list of sound events (project time) for all scenes.
 * models[i] = buildScene(scene i) result (with trimIn/trimOut/duration/cameraAt/runs).
 */
export function buildEvents(project, models) {
  const snd = { ...defaultSound(), ...(project.sound || {}) };
  const ev = [];
  if (!snd.auto) { for (const c of project.sfx || []) if (!c.muted && SYN[c.type]) ev.push({ t: Math.max(0, +c.t || 0), type: c.type, p: { dur: +c.dur || 2.5, n: 16, vol: +c.vol || 1 } }); return ev.sort((a, b) => a.t - b.t); }
  let off = 0;
  project.scenes.forEach((sc, si) => {
    const m = models[si];
    const P = (t) => { const o = m.outTime ? m.outTime(t) : t - m.trimIn; return o == null ? null : off + o; };
    const push = (t, type, p = {}) => { if (t >= m.trimIn - 0.01 && t <= m.trimOut) { const pt = P(Math.max(m.trimIn, t)); if (pt != null) ev.push({ t: pt, type, p }); } };
    for (const L of sc.layers || []) {
      if (L.hidden || L.style?.sound === false) continue;
      const s = L.style || {};
      const D = Math.max(0.1, +L.duration || 1);
      const t0 = +L.start || 0;
      const vol = s.soundVol ?? 1;
      if (L.kind === 'strike') {
        if (s.incoming) push(t0, 'whistle', { dur: 0.7, vol });
        push(t0 + (s.incoming ? 0.7 : 0), 'explosion', { size: +s.size || 1, vol });
      } else if (L.kind === 'bombing') {
        if (s.sprite !== 'none') push(t0, AIR[s.sprite] || 'jet', { dur: D + 0.6, vol });
        const n = clamp(Math.round(+s.count || 6), 1, 40);
        for (let i = 0; i < n; i++) { const td = t0 + ((i + 0.5) / n) * D + 0.35; push(td - 0.9, 'whistle', { dur: 0.85, vol: vol * 0.6 }); push(td, 'explosion', { size: (+s.blast || 1) * 0.8, vol: vol * 0.8, pan: (i / Math.max(1, n - 1)) * 1.2 - 0.6 }); }
      } else if (L.kind === 'trajectory') {
        const v = s.vehicle || 'missile';
        if (v === 'missile' || v === 'rocket') push(t0, 'missile', { dur: D, vol });
        else push(t0, AIR[v] || 'jet', { dur: D, vol });
        if (s.impact) push(t0 + D, 'explosion', { size: +s.size || 1, vol });
      } else if (L.kind === 'launch') {
        push(t0 + 0.2, 'rocket', { dur: D + 2, vol });
      } else if (L.kind === 'satellite' || L.kind === 'iss') {
        push(t0, 'ping', { vol: vol * 0.7 });
        if (s.imaging) for (let t = t0 + 1; t < t0 + D; t += 1.2) push(t, 'beep', { freq: 1900, vol: vol * 0.35 });
      } else if (L.kind === 'vehicle' || L.kind === 'model3d') {
        const kind = L.kind === 'vehicle' ? s.sprite : String(s.source || '').replace('builtin:', '');
        const a = AIR[kind] || (kind === 'rocket' ? 'rocket' : null);
        if (a) push(t0, a, { dur: D, vol: vol * 0.8 });
      } else if (L.kind === 'hud') {
        push(t0, 'hudboot', { vol });
        if (s.variant === 'target') push(t0 + D * 0.95, 'lock', { vol });
        if (s.variant === 'radar') for (let k = 0; k < 12; k++) push(t0 + 0.6 + k * ((Math.PI * 2) / (1.6 * (+s.speed || 1))), 'ping', { vol: vol * 0.45 });
        if (s.variant === 'mission') push(t0 + 0.2, 'type', { n: (s.text || '').length, dur: D * 0.95, vol: vol * 0.8 });
        if (s.variant === 'scanner') push(t0 + 0.1, 'whoosh', { dur: 1.2, vol: vol * 0.5 });
      } else if (L.kind === 'target') {
        const lt = Math.max(0.3, D) * 0.75;
        for (let k = 0; k < 6; k++) { const tt = t0 + (k / 6) * lt * (1 - k * 0.05); push(tt, 'beep', { freq: 1400 + k * 120, vol: vol * 0.4 }); }
        push(t0 + lt, 'lock', { vol });
      } else if (L.kind === 'hudtext') {
        if (s.look === 'alert') for (let k = 0; k < 4; k++) push(t0 + k * 0.45, 'beep', { freq: 880, vol: vol * 0.6 });
        else if (s.look === 'terminal' || s.look === 'telemetry') push(t0, 'type', { n: (s.text || '').length, dur: Math.max(0.5, D), vol: vol * 0.7 });
        else if (s.look === 'stamp') push(t0 + 0.12, 'braam', { vol: vol * 0.5 });
        else push(t0, 'glitch', { dur: 0.3, vol: vol * 0.6 });
      } else if (L.kind === 'title') {
        const lk = s.look || 'opener';
        if (lk === 'opener' || lk === 'ending') push(t0, 'braam', { vol: vol * 0.8 });
        else if (lk === 'cinematic') { push(Math.max(0, t0 - 1.6), 'riser', { dur: 1.6, vol: vol * 0.7 }); push(t0, 'hit', { vol }); }
        else if (lk === 'glitch') push(t0, 'glitch', { dur: Math.min(1.2, D), vol });
        else if (lk === 'chapter') push(t0, 'hit', { vol: vol * 0.6 });
        else if (lk === 'location') push(t0, 'type', { n: (s.text || '').length + (s.sub || '').length, dur: D, vol: vol * 0.8 });
      } else if (L.kind === 'news') {
        if (s.look === 'breaking') { push(t0, 'hit', { vol: vol * 0.7 }); push(t0 + 0.05, 'swoosh', { vol }); }
        else push(t0, 'swoosh', { vol: vol * 0.6 });
      } else if (L.kind === 'effect') {
        if (s.look === 'glitch' || s.look === 'chroma') push(t0, 'glitch', { dur: Math.min(1.5, D), vol });
        else if (s.look === 'vhs') push(t0, 'static', { dur: 0.6, vol: vol * 0.6 });
        else if (s.look === 'flash') push(t0, 'hit', { vol: vol * 0.7 });
        else if (s.look === 'shake') push(t0, 'sub', { vol });
        else if (s.look === 'rain') push(t0, 'wind', { dur: Math.max(2, D), vol: vol * 0.5 });
      } else if (L.kind === 'compare') {
        push(t0 + 0.1, 'whoosh', { dur: Math.min(2.5, D), vol: vol * 0.6 });
      } else if (L.kind === 'timeseries') {
        const per = Math.max(0.2, +s.per || 2), n = (s.frames || []).length;
        for (let k = 1; k < n; k++) push(t0 + k * per - Math.min(+s.fade || 0.8, per) * 0.5, 'whoosh', { dur: 0.7, vol: vol * 0.35 });
      } else if (L.kind === 'flicker') {
        push(t0, 'glitch', { dur: 0.35, vol });
        push(t0 + 0.1, 'type', { n: (s.text || '').length, dur: D * 0.8, vol });
      } else if (L.kind === 'capture') {
        push(t0 + D, 'braam', { vol: vol * 0.8 });
      } else if (L.kind === 'videofx' && s.boom) {
        push(t0, 'explosion', { size: +s.size || 1, vol });
      }
    }
    // route legs flown by aircraft, drones…
    for (const r of m.runs || []) {
      const t = MODE_SND[r.L.leg.mode];
      if (t) push(r.start, t, { dur: r.dur, vol: 0.7 });
    }
    // wind & whoosh while the camera zooms fast (Earth zoom, keyframes, intro/outro)
    if (snd.zoomWind) {
      let runStart = null, dirSum = 0;
      const hasHud = (sc.layers || []).some((L) => L.kind === 'hud' && !L.hidden);
      const step = 0.1;
      for (let t = m.trimIn; t <= m.trimOut + 1e-6; t += step) {
        const z1 = m.cameraAt(t).zoom, z2 = m.cameraAt(t + step).zoom;
        const fast = Math.abs(z2 - z1) / step > 0.9;
        if (fast && runStart == null) { runStart = t; dirSum = 0; }
        if (fast) dirSum += z2 - z1;
        if ((!fast || t + step > m.trimOut) && runStart != null) {
          const dur = t - runStart;
          if (dur > 0.25) {
            push(runStart, 'wind', { dur: dur + 0.6, vol: 0.8 });
            push(Math.max(runStart, t - Math.min(1.4, dur)), 'whoosh', { dur: Math.min(1.6, dur + 0.3), dir: dirSum > 0 ? 'up' : 'down', vol: 0.9 });
            if (hasHud) { push(runStart, 'glitch', { dur: 0.4, vol: 0.7 }); push(t, 'lock', { vol: 0.6 }); }
          }
          runStart = null;
        }
      }
    }
    off += m.duration;
    // transition whoosh
    if (si < project.scenes.length - 1 && (sc.transition || 'cut') !== 'cut') ev.push({ t: Math.max(0, off - 0.5), type: 'whoosh', p: { dur: 1, vol: 0.7 } });
  });
  // sounds placed from the library (project time)
  for (const c of project.sfx || []) if (!c.muted && SYN[c.type]) ev.push({ t: Math.max(0, +c.t || 0), type: c.type, p: { dur: +c.dur || 2.5, n: 16, vol: +c.vol || 1 } });
  return ev.sort((a, b) => a.t - b.t);
}

/** Schedule events and music into a context. `from` = project time at context time `when`. */
export function scheduleAll(ctx, out, project, events, from, to, when) {
  const snd = { ...defaultSound(), ...(project.sound || {}) };
  const sfx = ctx.createGain(); sfx.gain.value = clamp(+snd.sfxVolume || 0, 0, 2); sfx.connect(out);
  const mus = ctx.createGain(); mus.gain.value = clamp(+snd.musicVolume || 0, 0, 2); mus.connect(out);
  // fade the score out over the last two seconds
  if (to - from > 2.5) { mus.gain.setValueAtTime(mus.gain.value, when + (to - from) - 2); mus.gain.linearRampToValueAtTime(0.0001, when + (to - from)); }
  const nodes = [];
  for (const e of events) {
    if (e.t < from - 0.15 || e.t >= to) continue;
    const fn = SYN[e.type];
    if (fn) { try { fn(ctx, sfx, when + Math.max(0, e.t - from), e.p || {}); } catch (err) { console.warn('sfx', e.type, err); } }
  }
  scheduleMusic(ctx, mus, snd.music, from, to, when);
  return { sfx, mus, nodes };
}
export const hasSound = (project) => { const s = { ...defaultSound(), ...(project.sound || {}) }; return s.auto || (s.music && s.music !== 'none') || (project.sfx || []).length > 0; };
