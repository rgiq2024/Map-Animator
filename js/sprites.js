// Vector "3D-look" vehicle sprites drawn on canvas: shaded bodies with a soft ground shadow.
// All sprites point to +x (east) at angle 0; `ang` is in radians, screen space.

export const SPRITES = {
  jet: 'Fighter jet', airliner: 'Airliner', drone: 'Drone (UAV)', quad: 'Quadcopter', helicopter: 'Helicopter',
  missile: 'Missile', rocket: 'Rocket', warship: 'Warship', cargo: 'Cargo ship', submarine: 'Submarine',
  tank: 'Tank', satellite: 'Satellite', iss: 'Space station (ISS)',
};

function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// Each body draws in a unit space roughly x∈[-1,1], y∈[-1,1]; `t` = seconds for small animations.
const BODY = {
  jet(ctx, c, t) {
    // afterburner
    const f = 0.85 + 0.15 * Math.sin(t * 40);
    ctx.fillStyle = grad(ctx, -1.25 * f, 0, -0.85, 0, [[0, 'rgba(255,90,20,0)'], [0.6, 'rgba(255,160,40,.85)'], [1, '#fff6c0']]);
    poly(ctx, [[-0.86, -0.06], [-1.3 * f, 0], [-0.86, 0.06]]); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, -0.8, 0, 0.8, [[0, '#6f7a85'], [0.5, '#b9c2cb'], [1, '#5c6670']]);
    poly(ctx, [[1, 0], [0.62, -0.09], [0.15, -0.12], [-0.35, -0.78], [-0.52, -0.78], [-0.42, -0.14], [-0.7, -0.14], [-0.92, -0.42], [-1, -0.42], [-0.9, -0.08], [-0.9, 0.08], [-1, 0.42], [-0.92, 0.42], [-0.7, 0.14], [-0.42, 0.14], [-0.52, 0.78], [-0.35, 0.78], [0.15, 0.12], [0.62, 0.09]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,24,30,.55)'; ctx.lineWidth = 0.025; ctx.stroke();
    ctx.fillStyle = 'rgba(30,40,50,.35)';
    poly(ctx, [[0.5, 0], [-0.8, -0.05], [-0.8, 0.05]]); ctx.fill();
    ctx.fillStyle = grad(ctx, 0.3, -0.06, 0.3, 0.06, [[0, '#123'], [0.5, '#5aa9e6'], [1, '#123']]);
    ctx.beginPath(); ctx.ellipse(0.42, 0, 0.2, 0.055, 0, 0, Math.PI * 2); ctx.fill();
    if (c) { ctx.fillStyle = c; ctx.fillRect(-0.5, -0.7, 0.1, 0.12); ctx.fillRect(-0.5, 0.58, 0.1, 0.12); }
  },
  airliner(ctx, c) {
    ctx.fillStyle = grad(ctx, 0, -1, 0, 1, [[0, '#cfd5db'], [0.5, '#ffffff'], [1, '#c3c9cf']]);
    poly(ctx, [[0.15, -0.08], [-0.25, -0.95], [-0.38, -0.95], [-0.2, -0.08], [-0.2, 0.08], [-0.38, 0.95], [-0.25, 0.95], [0.15, 0.08]]); ctx.fill();
    poly(ctx, [[-0.78, -0.05], [-0.95, -0.36], [-1.02, -0.36], [-0.92, -0.04], [-0.92, 0.04], [-1.02, 0.36], [-0.95, 0.36], [-0.78, 0.05]]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 1, 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.fillStyle = c || '#2d7ff9'; ctx.fillRect(-1, -0.025, 0.25, 0.05);
    ctx.fillStyle = '#7b8794'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-0.05, s * 0.42, 0.12, 0.04, 0, 0, Math.PI * 2); ctx.fill(); }
  },
  drone(ctx, c, t) {
    ctx.fillStyle = grad(ctx, 0, -1, 0, 1, [[0, '#7d858c'], [0.5, '#c6ccd2'], [1, '#6c747b']]);
    poly(ctx, [[0.05, -0.04], [-0.05, -1], [-0.16, -1], [-0.16, -0.04], [-0.16, 0.04], [-0.16, 1], [-0.05, 1], [0.05, 0.04]]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.05, 0, 0.95, 0.075, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.62, 0, 0.22, 0.1, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, [[-0.78, -0.03], [-0.98, -0.3], [-1.04, -0.28], [-0.9, 0], [-1.04, 0.28], [-0.98, 0.3], [-0.78, 0.03]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.save(); ctx.translate(-0.92, 0); ctx.rotate(t * 50); ctx.fillStyle = 'rgba(40,40,40,.45)'; ctx.fillRect(-0.02, -0.16, 0.04, 0.32); ctx.restore();
    if (c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-0.1, -0.85, 0.035, 0, 7); ctx.arc(-0.1, 0.85, 0.035, 0, 7); ctx.fill(); }
  },
  quad(ctx, c, t) {
    ctx.strokeStyle = '#3b4148'; ctx.lineWidth = 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.6, -0.6); ctx.lineTo(0.6, 0.6); ctx.moveTo(-0.6, 0.6); ctx.lineTo(0.6, -0.6); ctx.stroke();
    for (const [x, y] of [[-0.6, -0.6], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6]]) {
      ctx.fillStyle = 'rgba(200,210,220,.35)'; ctx.beginPath(); ctx.arc(x, y, 0.36, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 60 * (x * y > 0 ? 1 : -1)); ctx.fillStyle = 'rgba(30,30,30,.6)'; ctx.fillRect(-0.34, -0.03, 0.68, 0.06); ctx.restore();
    }
    ctx.fillStyle = grad(ctx, -0.3, -0.3, 0.3, 0.3, [[0, '#e9edf1'], [1, '#8d969f']]);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-0.32, -0.25, 0.64, 0.5, 0.12) : ctx.rect(-0.32, -0.25, 0.64, 0.5); ctx.fill();
    ctx.fillStyle = c || '#2fbf71'; ctx.beginPath(); ctx.arc(0.22, 0, 0.06, 0, 7); ctx.fill();
  },
  helicopter(ctx, c, t) {
    ctx.fillStyle = grad(ctx, 0, -0.3, 0, 0.3, [[0, '#4d5a46'], [0.5, '#8a9a7c'], [1, '#46523f']]);
    ctx.beginPath(); ctx.ellipse(0.2, 0, 0.5, 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-1, -0.05, 1.1, 0.1);
    poly(ctx, [[-0.92, -0.05], [-1.05, -0.25], [-1.1, -0.25], [-1, 0], [-1.1, 0.25], [-1.05, 0.25], [-0.92, 0.05]]); ctx.fill();
    ctx.fillStyle = 'rgba(90,169,230,.75)'; ctx.beginPath(); ctx.ellipse(0.5, 0, 0.16, 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(0.15, 0); ctx.rotate(t * 25);
    ctx.fillStyle = 'rgba(25,25,25,.55)'; for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.fillRect(0, -0.035, 1.05, 0.07); }
    ctx.restore();
    ctx.fillStyle = 'rgba(190,190,190,.12)'; ctx.beginPath(); ctx.arc(0.15, 0, 1.05, 0, 7); ctx.fill();
  },
  missile(ctx, c, t) {
    const f = 0.8 + 0.2 * Math.sin(t * 50);
    ctx.fillStyle = grad(ctx, -1.6 * f, 0, -0.9, 0, [[0, 'rgba(255,80,20,0)'], [0.5, 'rgba(255,170,40,.9)'], [1, '#fffbe0']]);
    poly(ctx, [[-0.9, -0.09], [-1.6 * f, 0], [-0.9, 0.09]]); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, -0.12, 0, 0.12, [[0, '#8c9399'], [0.45, '#f4f6f8'], [1, '#7c848b']]);
    poly(ctx, [[1, 0], [0.7, -0.1], [-0.9, -0.1], [-0.9, 0.1], [0.7, 0.1]]); ctx.fill();
    ctx.fillStyle = c || '#c62828'; poly(ctx, [[1, 0], [0.82, -0.08], [0.82, 0.08]]); ctx.fill();
    ctx.fillStyle = '#5b636a';
    poly(ctx, [[-0.6, -0.1], [-0.88, -0.32], [-0.9, -0.1]]); ctx.fill();
    poly(ctx, [[-0.6, 0.1], [-0.88, 0.32], [-0.9, 0.1]]); ctx.fill();
    poly(ctx, [[0.3, -0.1], [0.15, -0.2], [0.05, -0.1]]); ctx.fill();
    poly(ctx, [[0.3, 0.1], [0.15, 0.2], [0.05, 0.1]]); ctx.fill();
  },
  rocket(ctx, c, t) {
    const f = 0.8 + 0.2 * Math.sin(t * 45);
    ctx.fillStyle = grad(ctx, -1.7 * f, 0, -0.85, 0, [[0, 'rgba(255,80,20,0)'], [0.5, 'rgba(255,180,50,.95)'], [1, '#ffffff']]);
    poly(ctx, [[-0.85, -0.15], [-1.7 * f, 0], [-0.85, 0.15]]); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, -0.18, 0, 0.18, [[0, '#b9c0c6'], [0.45, '#ffffff'], [1, '#a9b0b6']]);
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(0.75, -0.18, 0.5, -0.18); ctx.lineTo(-0.85, -0.18); ctx.lineTo(-0.85, 0.18); ctx.lineTo(0.5, 0.18); ctx.quadraticCurveTo(0.75, 0.18, 1, 0); ctx.fill();
    ctx.fillStyle = c || '#1d2b3a'; ctx.fillRect(-0.2, -0.18, 0.12, 0.36);
    ctx.fillStyle = '#39424b';
    poly(ctx, [[-0.55, -0.18], [-0.88, -0.4], [-0.88, -0.18]]); ctx.fill();
    poly(ctx, [[-0.55, 0.18], [-0.88, 0.4], [-0.88, 0.18]]); ctx.fill();
  },
  warship(ctx, c, t) {
    ctx.fillStyle = grad(ctx, 0, -0.25, 0, 0.25, [[0, '#4f5a63'], [0.5, '#8d99a3'], [1, '#46515a']]);
    poly(ctx, [[1, 0], [0.55, -0.2], [-0.85, -0.2], [-1, -0.12], [-1, 0.12], [-0.85, 0.2], [0.55, 0.2]]); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.fillStyle = '#6b7780'; ctx.fillRect(-0.45, -0.12, 0.55, 0.24);
    ctx.fillStyle = '#a7b2bb'; ctx.fillRect(-0.3, -0.08, 0.28, 0.16);
    ctx.fillStyle = '#3c454c'; ctx.beginPath(); ctx.arc(0.45, 0, 0.07, 0, 7); ctx.fill(); ctx.fillRect(0.45, -0.015, 0.25, 0.03);
    ctx.beginPath(); ctx.arc(-0.65, 0, 0.06, 0, 7); ctx.fill(); ctx.fillRect(-0.95, -0.012, 0.3, 0.025);
    if (c) { ctx.fillStyle = c; ctx.fillRect(-0.2, -0.04, 0.1, 0.08); }
  },
  cargo(ctx, c) {
    ctx.fillStyle = grad(ctx, 0, -0.25, 0, 0.25, [[0, '#2b3a4a'], [0.5, '#4c6178'], [1, '#26323f']]);
    poly(ctx, [[1, 0], [0.7, -0.22], [-0.95, -0.22], [-1, -0.15], [-1, 0.15], [-0.95, 0.22], [0.7, 0.22]]); ctx.fill();
    const cols = ['#d9534f', '#f0ad4e', '#5bc0de', '#5cb85c', c || '#e2e2e2'];
    for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = cols[(i * 3 + j * 2) % cols.length]; ctx.fillRect(0.55 - i * 0.18, -0.16 + j * 0.11, 0.16, 0.1); }
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-0.95, -0.15, 0.2, 0.3);
  },
  submarine(ctx) {
    ctx.fillStyle = grad(ctx, 0, -0.16, 0, 0.16, [[0, '#1f262c'], [0.5, '#4a5560'], [1, '#1b2126']]);
    ctx.beginPath(); ctx.ellipse(0, 0, 1, 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d353c'; ctx.beginPath(); ctx.ellipse(0.25, 0, 0.16, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, [[-0.85, 0], [-1.05, -0.22], [-1.05, 0.22]]); ctx.fill();
  },
  tank(ctx, c, t) {
    ctx.fillStyle = '#2f3527'; ctx.fillRect(-0.75, -0.5, 1.5, 0.22); ctx.fillRect(-0.75, 0.28, 1.5, 0.22);
    ctx.fillStyle = grad(ctx, 0, -0.4, 0, 0.4, [[0, '#4e5a3c'], [0.5, '#7c8a5e'], [1, '#495437']]);
    ctx.fillRect(-0.7, -0.32, 1.4, 0.64);
    ctx.beginPath(); ctx.ellipse(-0.05, 0, 0.32, 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.fillStyle = '#3d4630'; ctx.fillRect(0.2, -0.045, 0.95, 0.09);
  },
  satellite(ctx, c, t) {
    for (const s of [-1, 1]) {
      ctx.fillStyle = grad(ctx, 0, s * 0.2, 0, s * 1.05, [[0, '#1d3c78'], [1, '#3f6fc4']]);
      ctx.fillRect(-0.28, s > 0 ? 0.24 : -1.05, 0.56, 0.81);
      ctx.strokeStyle = 'rgba(200,220,255,.5)'; ctx.lineWidth = 0.015;
      for (let k = 1; k < 4; k++) { const y = s > 0 ? 0.24 + k * 0.2 : -1.05 + k * 0.2; ctx.beginPath(); ctx.moveTo(-0.28, y); ctx.lineTo(0.28, y); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, s > 0 ? 0.24 : -1.05); ctx.lineTo(0, s > 0 ? 1.05 : -0.24); ctx.stroke();
      ctx.fillStyle = '#9aa3ab'; ctx.fillRect(-0.03, s > 0 ? 0.16 : -0.24, 0.06, 0.08);
    }
    ctx.fillStyle = grad(ctx, -0.25, -0.2, 0.25, 0.2, [[0, '#f6d77a'], [0.5, '#c9962b'], [1, '#f1cf6b']]);
    ctx.fillRect(-0.25, -0.17, 0.5, 0.34);
    ctx.strokeStyle = 'rgba(80,50,0,.5)'; ctx.lineWidth = 0.02; ctx.strokeRect(-0.25, -0.17, 0.5, 0.34);
    ctx.fillStyle = '#e8eaec'; ctx.beginPath(); ctx.ellipse(0.32, 0, 0.08, 0.14, 0, 0, Math.PI * 2); ctx.fill();
    if (c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 0.05 + 0.02 * Math.sin(t * 6), 0, 7); ctx.fill(); }
  },
  iss(ctx, c, t) {
    ctx.fillStyle = '#c9ccd0'; ctx.fillRect(-0.06, -1.05, 0.12, 2.1);
    for (const y of [-0.98, -0.66, 0.38, 0.7]) {
      for (const s of [-1, 1]) {
        ctx.fillStyle = grad(ctx, s * 0.08, 0, s * 0.8, 0, [[0, '#8a6a2a'], [1, '#d3a64a']]);
        ctx.fillRect(s > 0 ? 0.08 : -0.8, y, 0.72, 0.24);
        ctx.strokeStyle = 'rgba(60,40,0,.5)'; ctx.lineWidth = 0.012;
        for (let k = 1; k < 6; k++) { const x = (s > 0 ? 0.08 : -0.8) + k * 0.12; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 0.24); ctx.stroke(); }
      }
    }
    ctx.fillStyle = grad(ctx, 0, -0.1, 0, 0.1, [[0, '#d6d9dc'], [0.5, '#ffffff'], [1, '#c4c8cc']]);
    ctx.fillRect(-0.55, -0.08, 1.1, 0.16);
    ctx.fillRect(-0.12, -0.3, 0.24, 0.6);
    ctx.fillStyle = '#e9ecef'; ctx.fillRect(0.4, -0.22, 0.14, 0.44);
    ctx.fillStyle = '#f2f2f2'; for (const s of [-1, 1]) ctx.fillRect(-0.32, s > 0 ? 0.1 : -0.36, 0.1, 0.26);
  },
};

/**
 * Draw a sprite.
 * @param x,y screen position; ang heading (radians, screen); size half-length in px
 * @param o.color accent colour, o.t seconds (propellers/flames), o.shadow (0..1), o.alt shadow offset px
 */
export function drawSprite(ctx, kind, x, y, ang, size, o = {}) {
  const body = BODY[kind] || BODY.jet;
  const t = o.t || 0;
  ctx.save();
  if (o.shadow !== 0) {
    const off = o.alt ?? size * 0.35;
    ctx.save();
    ctx.translate(x + off * 0.6, y + off);
    ctx.rotate(ang);
    ctx.scale(size, size);
    ctx.globalAlpha *= 0.28 * (o.shadow ?? 1);
    ctx.filter = `blur(${Math.max(1, size * 0.06)}px) brightness(0)`;
    body(ctx, null, t);
    ctx.restore();
  }
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(size, size);
  body(ctx, o.color, t);
  ctx.restore();
}

/** Side view of a rocket standing / lifting off (for launch sites). Base at x,y, height h px. */
export function drawRocketSide(ctx, x, y, h, t, flame) {
  const w = h * 0.12;
  ctx.save();
  if (flame > 0) {
    const f = (0.85 + 0.15 * Math.sin(t * 45)) * flame;
    const g = ctx.createLinearGradient(x, y, x, y + h * 0.9 * f);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, 'rgba(255,200,60,.95)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - w * 0.42, y); ctx.quadraticCurveTo(x, y + h * 1.1 * f, x + w * 0.42, y); ctx.fill();
  }
  ctx.fillStyle = grad(ctx, x - w / 2, 0, x + w / 2, 0, [[0, '#aeb5bb'], [0.4, '#ffffff'], [1, '#9aa2a9']]);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h * 0.78);
  ctx.quadraticCurveTo(x - w / 2, y - h * 0.93, x, y - h);
  ctx.quadraticCurveTo(x + w / 2, y - h * 0.93, x + w / 2, y - h * 0.78);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d2b3a'; ctx.fillRect(x - w / 2, y - h * 0.62, w, h * 0.05);
  ctx.fillStyle = '#39424b';
  poly(ctx, [[x - w / 2, y - h * 0.18], [x - w * 1.05, y], [x - w / 2, y]]); ctx.fill();
  poly(ctx, [[x + w / 2, y - h * 0.18], [x + w * 1.05, y], [x + w / 2, y]]); ctx.fill();
  ctx.restore();
}
