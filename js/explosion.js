// Photo-real-ish explosion built from procedurally textured particles: fractal-noise smoke billows lit
// from above, additive fire with a cooling colour ramp, a ground dust ring, ballistic debris trailing
// smoke, glowing embers, a heat flash and a scorch mark. Deterministic for a given seed and time.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- textures
function valueNoise(seed, size) {
  const r = rng(seed);
  const G = 16;
  const grid = Array.from({ length: (G + 1) * (G + 1) }, r);
  const at = (x, y) => grid[(y % G) * (G + 1) + (x % G)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y, f) => {
    const fx = x * f, fy = y * f;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = sm(fx - ix), ty = sm(fy - iy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
function makeSprite(seed, kind, S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const n = valueNoise(seed, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = i / S, v = j / S;
      const dx = u - 0.5, dy = v - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      let f = 0, amp = 0.55, fr = 3;
      for (let o = 0; o < 5; o++) { f += n(u + 7.1 * o, v + 3.3 * o, fr) * amp; amp *= 0.5; fr *= 2; }
      // billowy, cauliflower-like edges
      let a = clamp((f * 1.25 + (1 - d) * 1.05 - 1.05) * 2.4, 0, 1) * clamp((1 - d) * 3, 0, 1);
      const k = (j * S + i) * 4;
      if (kind === 'smoke') {
        const light = clamp(0.55 + (0.5 - v) * 0.9 + (f - 0.5) * 0.9, 0.15, 1.25);
        img.data[k] = 92 * light; img.data[k + 1] = 88 * light; img.data[k + 2] = 84 * light;
        img.data[k + 3] = a * 255;
      } else if (kind === 'dust') {
        const light = clamp(0.7 + (0.5 - v) * 0.6 + (f - 0.5) * 0.6, 0.3, 1.2);
        img.data[k] = 168 * light; img.data[k + 1] = 146 * light; img.data[k + 2] = 118 * light;
        img.data[k + 3] = a * 210;
      } else if (kind === 'scorch') {
        a = clamp((f * 1.1 + (1 - d) * 0.9 - 0.75) * 2, 0, 1) * clamp((1 - d) * 2, 0, 1);
        img.data[k] = 24; img.data[k + 1] = 18; img.data[k + 2] = 14;
        img.data[k + 3] = a * 200;
      } else {
        // fire: intensity texture coloured by temperature stage
        const heat = clamp(f * 1.3 + (1 - d) * 0.8 - 0.55, 0, 1);
        const ramp = {
          hot: [[255, 255, 240], [255, 236, 160], [255, 190, 80]],
          mid: [[255, 214, 120], [255, 140, 40], [210, 70, 20]],
          cool: [[240, 120, 40], [170, 50, 15], [80, 20, 8]],
        }[kind];
        const t = 1 - heat;
        const c0 = t < 0.5 ? ramp[0] : ramp[1], c1 = t < 0.5 ? ramp[1] : ramp[2], q = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        img.data[k] = c0[0] + (c1[0] - c0[0]) * q; img.data[k + 1] = c0[1] + (c1[1] - c0[1]) * q; img.data[k + 2] = c0[2] + (c1[2] - c0[2]) * q;
        img.data[k + 3] = a * 255 * clamp(heat * 1.6, 0, 1);
      }
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
let TEX = null;
function tex() {
  if (TEX) return TEX;
  TEX = { smoke: [], dust: [], hot: [], mid: [], cool: [], scorch: makeSprite(991, 'scorch', 160) };
  for (let i = 0; i < 4; i++) {
    TEX.smoke.push(makeSprite(11 + i * 17, 'smoke'));
    TEX.dust.push(makeSprite(201 + i * 13, 'dust'));
    TEX.hot.push(makeSprite(401 + i * 7, 'hot'));
    TEX.mid.push(makeSprite(501 + i * 7, 'mid'));
    TEX.cool.push(makeSprite(601 + i * 7, 'cool'));
  }
  return TEX;
}
function sprite(ctx, img, x, y, r, rot, alpha) {
  if (alpha <= 0.003 || r < 0.5) return;
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(img, -r, -r, r * 2, r * 2);
  ctx.restore();
}

/**
 * Draw an explosion at (x, y). tau = seconds since detonation. R = base radius in px.
 * o.scorch (default true), o.flash (default true), o.ground (default true: dust ring), o.smokeLife seconds
 */
export function drawExplosion(ctx, x, y, R, tau, seed = 1, o = {}) {
  if (tau < 0) return;
  const T = tex();
  const r = rng(seed);
  const life = o.smokeLife || 7;
  ctx.save();
  // ---- scorch mark on the ground
  if (o.scorch !== false && tau > 0.25) {
    sprite(ctx, T.scorch, x, y + R * 0.05, R * 1.25, (seed % 628) / 100, Math.min(0.85, (tau - 0.25) * 1.5));
  }
  // ---- ground dust ring rolling outwards
  if (o.ground !== false) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4;
      const sp = 0.8 + r() * 0.5;
      const tt = tau - 0.05;
      if (tt < 0) { r(); r(); continue; }
      const dist = R * 2.3 * easeOut(tt / 1.6) * sp;
      const q = clamp(tt / (life * 0.8), 0, 1);
      sprite(ctx, T.dust[i % 4], x + Math.cos(a) * dist, y + Math.sin(a) * dist * 0.42 - tt * R * 0.06, R * (0.45 + q * 1.1) * (0.8 + r() * 0.4), r() * 6, 0.75 * (1 - q) * clamp(tt * 4, 0, 1));
    }
  }
  // ---- rising smoke column / billows (drawn under the fire)
  const ns = 26;
  for (let i = 0; i < ns; i++) {
    const st = 0.12 + r() * 0.6;
    const tt = tau - st;
    const ang = r() * Math.PI * 2, spread = r();
    const rise = R * (0.55 + r() * 0.9), r0 = R * (0.35 + r() * 0.35), rot0 = r() * 6, spin = (r() - 0.5) * 0.4, v = i % 4;
    if (tt < 0) continue;
    const q = clamp(tt / life, 0, 1);
    const up = rise * Math.min(tt, 4) * (1 - 0.08 * Math.min(tt, 4)) + R * 0.4 * Math.max(0, tt - 4);
    const px = x + Math.cos(ang) * R * 0.6 * spread * (1 + q * 1.5) + (o.wind || 0) * tt * R * 0.15;
    const py = y - up + Math.sin(ang) * R * 0.25 * spread;
    const rad = r0 * (1 + easeOut(tt / 2.5) * 1.6 + q * 1.8);
    // early smoke is fire-lit (warm, dark), later neutral
    const a = 0.92 * (1 - q) ** 1.3 * clamp(tt * 3, 0, 1);
    sprite(ctx, T.smoke[v], px, py, rad, rot0 + spin * tt, a);
  }
  // ---- debris chunks with smoke trails
  if (tau < 2.6) {
    const nd = 9;
    for (let i = 0; i < nd; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.4, sp = R * (3.5 + r() * 4), g = R * 9;
      const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
      const t1 = Math.min(tau, 2.4);
      for (let k = 6; k >= 0; k--) {
        const tt = t1 - k * 0.06;
        if (tt < 0) continue;
        const dx = vx * tt, dy = vy * tt + 0.5 * g * tt * tt;
        if (dy > R * 0.3) continue;
        if (k === 0) {
          ctx.globalAlpha = 1 - tau / 2.6;
          ctx.fillStyle = tau < 0.6 ? '#ffcc66' : '#2a2420';
          ctx.fillRect(x + dx - R * 0.03, y + dy - R * 0.03, R * 0.06, R * 0.06);
        } else sprite(ctx, T.smoke[k % 4], x + dx, y + dy, R * 0.08 * (1 + k * 0.4), k, 0.35 * (1 - k / 7) * (1 - tau / 2.6));
      }
    }
  }
  // ---- fireball (additive), cooling hot → mid → cool
  if (tau < 2.4) {
    ctx.globalCompositeOperation = 'lighter';
    const nf = 18;
    for (let i = 0; i < nf; i++) {
      const ang = r() * Math.PI * 2, d = r() * R * 0.75, rr = R * (0.35 + r() * 0.45), rot = r() * 6, v = i % 4, lag = r() * 0.12;
      const tt = tau - lag;
      if (tt < 0) continue;
      const grow = easeOut(tt / 0.3);
      const px = x + Math.cos(ang) * d * grow, py = y + Math.sin(ang) * d * grow * 0.7 - tt * R * 0.55 - d * 0.2;
      const rad = rr * grow * (1 + tt * 0.5);
      const stage = tt < 0.35 ? T.hot : tt < 0.9 ? T.mid : T.cool;
      const a = tt < 0.9 ? 1 : 1 - (tt - 0.9) / 1.5;
      sprite(ctx, stage[v], px, py, rad, rot + tt * 0.3, clamp(a, 0, 1));
    }
    // embers
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, sp = R * (1 + r() * 2.5), fl = r() * 6;
      const tt = tau;
      if (tt > 2.2) continue;
      const px = x + Math.cos(a) * sp * tt, py = y + Math.sin(a) * sp * tt * 0.6 - R * 1.2 * tt + R * 1.5 * tt * tt * 0.5;
      ctx.globalAlpha = clamp((1 - tt / 2.2) * (0.6 + 0.4 * Math.sin(tt * 30 + fl)), 0, 1);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(px, py, Math.max(0.6, R * 0.025), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // ---- shockwave (faint refraction-like ring) and flash
  if (tau < 0.6) {
    const q = tau / 0.6;
    ctx.globalAlpha = 0.45 * (1 - q);
    ctx.strokeStyle = 'rgba(255,250,240,1)';
    ctx.lineWidth = Math.max(1, R * 0.08 * (1 - q));
    ctx.beginPath(); ctx.ellipse(x, y, R * 3.6 * easeOut(q), R * 1.7 * easeOut(q), 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (o.flash !== false && tau < 0.3) {
    const a = 1 - tau / 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 3);
    g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.25, 'rgba(255,230,170,0.7)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Billowing exhaust smoke for rocket launches (short-lived puffs, not a line). */
export function drawPuff(ctx, x, y, r, rot, alpha, kind = 'smoke') {
  const T = tex();
  const set = kind === 'dust' ? T.dust : kind === 'fire' ? T.mid : T.smoke;
  sprite(ctx, set[Math.abs(Math.round(rot * 10)) % 4], x, y, r, rot, alpha);
  ctx.globalAlpha = 1;
}
