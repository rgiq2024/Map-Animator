// Draws a scene (route line, travel symbol, signs, compass, editing handles) on a 2D canvas over the map.
import { sampleAt } from './geo.js';
import { drawSign } from './signs.js';
import { drawLayers, layerHandles } from './layers.js';
import { gizmoFor, drawGizmo } from './gizmo.js';
import { drawSprite } from './sprites.js';
import { drawClouds } from './effects.js';
import { zoomRefFor } from './scene.js';
import { drawNorthArrow, drawScaleBar, arrowRotation, metresPerPixel, defaultNorth } from './hud.js';

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function projector(map, px, ox = 0, oy = 0) {
  const c = map.getCenter().lng;
  const worldPx = 512 * 2 ** map.getZoom() * px;
  const fn = ([lng, lat]) => {
    const l = lng + 360 * Math.round((c - lng) / 360);
    const p = map.project([l, lat]);
    return [p.x * px + ox, p.y * px + oy];
  };
  fn.worldPx = worldPx;
  return fn;
}

function trace(ctx, proj, coords) {
  let prev = null;
  ctx.beginPath();
  for (const c of coords) {
    const p = proj(c);
    if (!prev || Math.abs(p[0] - prev[0]) > proj.worldPx / 2) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
    prev = p;
  }
}

/** Screen points of a line, split where it wraps around the world. */
function screenRuns(proj, coords) {
  const runs = [];
  let cur = [], prev = null;
  for (const c of coords) {
    const p = proj(c);
    if (prev && Math.abs(p[0] - prev[0]) > proj.worldPx / 2) { if (cur.length > 1) runs.push(cur); cur = []; }
    cur.push(p); prev = p;
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
/** A polyline shifted sideways by d pixels (mitred, clamped). */
function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    let n1x = -(b[1] - a[1]), n1y = b[0] - a[0], n2x = -(c[1] - b[1]), n2y = c[0] - b[0];
    const l1 = Math.hypot(n1x, n1y) || 1, l2 = Math.hypot(n2x, n2y) || 1;
    n1x /= l1; n1y /= l1; n2x /= l2; n2y /= l2;
    if (i === 0) { n1x = n2x; n1y = n2y; }
    if (i === pts.length - 1) { n2x = n1x; n2y = n1y; }
    let nx = n1x + n2x, ny = n1y + n2y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const k = Math.min(2.5, 1 / Math.max(0.2, nx * n1x + ny * n1y));
    out.push([b[0] + nx * d * k, b[1] + ny * d * k]);
  }
  return out;
}
const pathOf = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
/** 3D-looking tracks: railway (ballast, sleepers, two steel rails), road and bus lane, with a drop shadow. */
function strokeTrack(ctx, proj, coords, color, style, w) {
  const runs = screenRuns(proj, coords);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const pts of runs) {
    // shadow
    ctx.save();
    ctx.translate(w * 0.35, w * 0.55);
    ctx.filter = `blur(${Math.max(1, w * 0.45)}px)`;
    pathOf(ctx, pts); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = w * 3.6; ctx.stroke();
    ctx.restore();
    if (style === 'rail3d') {
      pathOf(ctx, pts); ctx.strokeStyle = '#7d756b'; ctx.lineWidth = w * 3.4; ctx.stroke();           // ballast
      pathOf(ctx, pts); ctx.strokeStyle = '#968e83'; ctx.lineWidth = w * 2.8; ctx.stroke();
      ctx.save(); ctx.lineCap = 'butt'; ctx.setLineDash([w * 0.5, w * 0.62]);
      pathOf(ctx, pts); ctx.strokeStyle = '#4e3b2a'; ctx.lineWidth = w * 2.5; ctx.stroke();         // sleepers
      ctx.restore();
      for (const sgn of [-1, 1]) {
        const r = offsetLine(pts, sgn * w * 0.72);
        pathOf(ctx, r); ctx.strokeStyle = '#3b3f45'; ctx.lineWidth = w * 0.42; ctx.stroke();
        pathOf(ctx, r); ctx.strokeStyle = '#d9dee4'; ctx.lineWidth = w * 0.2; ctx.stroke();
      }
      // coloured line marker in the middle so the route colour still reads
      ctx.save(); ctx.globalAlpha = 0.85; pathOf(ctx, pts); ctx.strokeStyle = color; ctx.lineWidth = w * 0.22; ctx.stroke(); ctx.restore();
    } else {
      const bus = style === 'bus3d';
      pathOf(ctx, pts); ctx.strokeStyle = bus ? '#7a1f1a' : '#24272b'; ctx.lineWidth = w * 3.4; ctx.stroke();  // kerb
      pathOf(ctx, pts); ctx.strokeStyle = bus ? '#b5352c' : '#3b3f45'; ctx.lineWidth = w * 3.0; ctx.stroke();  // surface
      pathOf(ctx, pts); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = w * 1.4; ctx.stroke();      // sheen
      for (const sgn of [-1, 1]) { const r = offsetLine(pts, sgn * w * 1.25); pathOf(ctx, r); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, w * 0.14); ctx.stroke(); }
      ctx.save(); ctx.lineCap = 'butt'; ctx.setLineDash([w * 1.1, w * 1.0]);
      pathOf(ctx, pts); ctx.strokeStyle = bus ? '#ffffff' : '#ffd23f'; ctx.lineWidth = Math.max(1, w * 0.18); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.9; ctx.setLineDash([0.001, w * 6]); pathOf(ctx, pts); ctx.strokeStyle = color; ctx.lineWidth = w * 0.7; ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}
/** Height (px) of a lifted 3D flight arc for a leg. */
export function flightLift(proj, L, unit) {
  let len = 0, prev = null;
  for (let i = 0; i < L.coords.length; i += Math.max(1, Math.floor(L.coords.length / 60))) { const p = proj(L.coords[i]); if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  return Math.max(24 * unit, Math.min(240 * unit, len * 0.2));
}
/** Flight arc lifted off the map with a ground shadow and hanging lines. */
function strokeFlight(ctx, proj, L, coords, color, w, unit) {
  const H = flightLift(proj, L, unit);
  const total = L.coords.length - 1 || 1;
  const n = coords.length;
  const ground = coords.map(proj);
  const lift = (i) => Math.sin(Math.PI * Math.min(1, i / total)) * H;
  const air = ground.map((p, i) => [p[0], p[1] - lift(Math.min(i, total))]);
  if (n > 1) {
    const last = coords.at(-1);
    air[n - 1] = [ground[n - 1][0], ground[n - 1][1] - liftAt(L, last) * H];
  }
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // ground shadow
  ctx.setLineDash([w * 1.2, w * 1.4]);
  pathOf(ctx, ground); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w * 0.8; ctx.stroke();
  ctx.setLineDash([]);
  // curtain
  const step = Math.max(1, Math.floor(n / 24));
  ctx.strokeStyle = hexA(color, 0.22); ctx.lineWidth = Math.max(1, w * 0.18);
  for (let i = 0; i < n; i += step) { ctx.beginPath(); ctx.moveTo(ground[i][0], ground[i][1]); ctx.lineTo(air[i][0], air[i][1]); ctx.stroke(); }
  // glowing arc
  ctx.shadowColor = hexA(color, 0.8); ctx.shadowBlur = w * 2.2;
  pathOf(ctx, air); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = w * 1.5; ctx.stroke();
  ctx.shadowBlur = 0;
  pathOf(ctx, air); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  ctx.restore();
}
/** 0…1 lift factor at a point of a leg (by nearest vertex). */
function liftAt(L, pt) {
  let best = 0, bd = Infinity;
  const step = Math.max(1, Math.floor(L.coords.length / 400));
  for (let i = 0; i < L.coords.length; i += step) { const c = L.coords[i]; const d = (c[0] - pt[0]) ** 2 + (c[1] - pt[1]) ** 2; if (d < bd) { bd = d; best = i; } }
  return Math.sin(Math.PI * (best / Math.max(1, L.coords.length - 1)));
}
function hexA(hex, a) {
  const h = String(hex || '#ff4a2b').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function strokeLeg(ctx, proj, coords, color, style, w, outline) {
  if (style === 'rail3d' || style === 'road3d' || style === 'bus3d') { strokeTrack(ctx, proj, coords, color, style, w); return; }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  trace(ctx, proj, coords);
  if (style === 'dotted') {
    if (outline) {
      ctx.setLineDash([0.001, w * 2.4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = w * 1.5 + 2;
      ctx.stroke();
    }
    ctx.setLineDash([0.001, w * 2.4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = w * 1.5;
    ctx.stroke();
  } else {
    if (outline) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = w + Math.max(3, w * 0.7);
      ctx.stroke();
    }
    if (style === 'dashed') ctx.setLineDash([w * 2.6, w * 1.8]);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
    if (style === 'rail') {
      ctx.setLineDash([w * 1.6, w * 1.6]);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = w * 0.42;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawArrow(ctx, x, y, heading, color, size, shadow) {
  const a = (heading * Math.PI) / 180;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = size * 0.35; ctx.shadowOffsetY = size * 0.18; }
  ctx.beginPath();
  ctx.moveTo(size * 0.9, 0);
  ctx.lineTo(-size * 0.75, -size * 0.72);
  ctx.lineTo(-size * 0.35, 0);
  ctx.lineTo(-size * 0.75, size * 0.72);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.restore();
}

function drawBadge(ctx, x, y, mode, heading, color, r, shadow) {
  ctx.save();
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.8, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = r * 0.6; ctx.shadowOffsetY = r * 0.2;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = r * 0.17;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.translate(x, y);
  if (mode.rot != null) ctx.rotate(((heading - mode.rot) * Math.PI) / 180);
  ctx.font = `${r * 1.12}px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mode.icon, 0, r * 0.08);
  ctx.restore();
}

function drawSymbol(ctx, look, L, x, y, heading, unit, t = 0) {
  const color = L.color;
  const kind = look.symbol === 'auto' || !look.symbol ? (L.mode.sprite ? 'sprite' : L.mode.icon ? 'icon' : 'arrow') : look.symbol;
  const size = (+look.symbolSize || 1);
  const w = (+look.lineWidth || 5) * unit;
  if (kind === 'none') return;
  if (L.mode.sprite && (kind === 'sprite' || kind === 'icon')) {
    const sz = 24 * unit * size;
    drawSprite(ctx, L.mode.sprite, x, y, (heading * Math.PI) / 180, sz, { color, t, alt: L.mode.air ? sz * 0.75 : sz * 0.15, shadow: look.symbol3d === false ? 0 : 1 });
    return;
  }
  if (kind === 'arrow' || (kind === 'icon' && !L.mode.icon)) drawArrow(ctx, x, y, heading, color, (w * 1.7 + 9 * unit) * size, look.symbol3d);
  else if (kind === 'icon') drawBadge(ctx, x, y, L.mode, heading, color, 18 * unit * size, look.symbol3d);
  else if (kind === 'dot') {
    ctx.save();
    if (look.symbol3d) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6 * unit; ctx.shadowOffsetY = 2 * unit; }
    ctx.beginPath(); ctx.arc(x, y, (w * 0.9 + 4 * unit) * size, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 3 * unit; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
}

function drawCompass(ctx, frame, bearing, unit) {
  const r = 22 * unit;
  const x = frame.x + frame.w - r - 18 * unit, y = frame.y + r + 18 * unit;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 8 * unit; ctx.shadowOffsetY = 2 * unit;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.rotate((-bearing * Math.PI) / 180);
  ctx.beginPath(); ctx.moveTo(0, -r * 0.78); ctx.lineTo(r * 0.24, 0); ctx.lineTo(-r * 0.24, 0); ctx.closePath(); ctx.fillStyle = '#e53935'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, r * 0.78); ctx.lineTo(r * 0.24, 0); ctx.lineTo(-r * 0.24, 0); ctx.closePath(); ctx.fillStyle = '#37474f'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

/** Values for {km} / {mi} in texts: distance travelled so far. */
export function tokensAt(model, time) {
  const st = time == null ? null : model.stateAt(time);
  const m = st ? st.drawn : model.routeLen;
  return { km: (m / 1000).toFixed(m < 100000 ? 1 : 0), mi: (m / 1609.344).toFixed(m < 160934 ? 1 : 0) };
}

/** How fast the camera zooms at time t (zoom levels per second, signed). */
export function zoomSpeedAt(model, t) {
  if (t == null || !model?.cameraAt) return 0;
  const h = 0.06;
  try { return (model.cameraAt(t + h).zoom - model.cameraAt(Math.max(0, t - h)).zoom) / (2 * h); } catch { return 0; }
}

/** On-screen captions (drawn last, above lens effects). */
export function renderCaptions(ctx, o) {
  const proj = projector(o.map, o.px, o.ox || 0, o.oy || 0);
  const c = o.map.getCenter();
  const fhCss = o.frame ? o.frame.h / o.px : 600;
  const altM = metresPerPixel(c.lat, o.map.getZoom()) * fhCss * 1.4;
  const view = { center: [c.lng, c.lat], zoom: o.map.getZoom(), bearing: o.map.getBearing(), pitch: o.map.getPitch(), altM, zoomSpeed: zoomSpeedAt(o.model, o.time) };
  drawLayers(ctx, { scene: o.scene, proj, unit: o.unit, time: o.time, frame: o.frame, view, tokens: tokensAt(o.model, o.time), boxes: o.boxes, exact: o.exact, map: o.map }, 'captions');
}

/**
 * @param o.map MapLibre map, already positioned
 * @param o.model buildScene() result
 * @param o.scene scene data
 * @param o.time seconds, or null to draw the whole route (editing)
 * @param o.px canvas px per map CSS px
 * @param o.ox/o.oy canvas offset of the map's origin
 * @param o.unit canvas px per "video unit" (1 unit = 1px of a 720-px-high frame)
 * @param o.frame {x,y,w,h} in canvas px (for the compass)
 * @param o.edit editing state or null
 */
export function renderScene(ctx, o) {
  const { map, model, scene, time, px, unit } = o;
  const look = scene.look;
  const proj = projector(map, px, o.ox || 0, o.oy || 0);
  const w = (+look.lineWidth || 5) * unit;
  const st = time == null ? null : model.stateAt(time);
  const out = { signBoxes: [], legBadges: [], handles: [], layerHandles: [], proj };
  const edit = o.edit;
  const tokens = o.tokens || tokensAt(model, time);
  const lo = { scene, proj, unit, time, frame: o.frame, tokens, exact: o.exact, pitch: map.getPitch(), map };
  drawLayers(ctx, lo, 'below');

  // ---- route lines ----
  for (const L of model.drawable) {
    let coords = L.coords;
    if (st) {
      const legEnd = L.offset + L.m.length;
      if (!st.started && !(st.L === L && st.dist > 0)) continue;
      if (st.L === L) {
        if (st.dist <= 0) continue;
        coords = L.coords.slice(0, st.index + 1);
        coords.push(st.point);
      } else if (legEnd > st.drawn + 1e-6) continue;
    }
    const active = edit && edit.step === 'route' && edit.activeLeg === L.li;
    if (L.style === 'flight3d') strokeFlight(ctx, proj, L, coords, L.color, active ? w * 1.15 : w, unit);
    else strokeLeg(ctx, proj, coords, L.color, L.style, active ? w * 1.15 : w, look.outline !== false);
  }

  // ---- editing: leg badges + handles ----
  if (edit && edit.step === 'route') {
    const dpr = edit.dpr || 1;
    model.legs.forEach((L) => {
      if (L.coords.length > 1) {
        const mid = sampleAt(L.m, 0.5).point;
        const [x, y] = proj(mid);
        const r = 12 * dpr;
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = edit.activeLeg === L.li ? '#ff6b35' : '#1d1f24'; ctx.fill();
        ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        if (L.mode.icon) {
          ctx.font = `${13 * dpr}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(L.mode.icon, x, y + 1 * dpr);
        } else {
          ctx.fillStyle = '#ff4a2b';
          ctx.beginPath(); ctx.moveTo(x + 6 * dpr, y); ctx.lineTo(x - 4 * dpr, y - 5 * dpr); ctx.lineTo(x - 4 * dpr, y + 5 * dpr); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        out.legBadges.push({ li: L.li, x, y, r });
      }
    });
    scene.legs.forEach((leg, li) => {
      const ptsIdx = leg.track ? [0, leg.points.length - 1] : leg.points.map((_, i) => i);
      ptsIdx.forEach((i) => {
        const p = leg.points[i];
        if (!p) return;
        if (li > 0 && i === 0 && !leg.track) return; // shared with previous leg's end
        const [x, y] = proj([p.lng, p.lat]);
        const sel = edit.selPoint && edit.selPoint.li === li && edit.selPoint.i === i;
        const hov = edit.hoverPoint && edit.hoverPoint.li === li && edit.hoverPoint.i === i;
        const r = (sel || hov ? 7 : 6) * dpr;
        ctx.save();
        ctx.beginPath();
        if (p.sharp) ctx.rect(x - r, y - r, r * 2, r * 2); else ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = sel ? '#2d7ff9' : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2.5 * dpr;
        ctx.strokeStyle = '#2d7ff9';
        ctx.stroke();
        if (p.pause > 0) {
          ctx.fillStyle = '#1d1f24';
          ctx.beginPath(); ctx.arc(x + 10 * dpr, y - 10 * dpr, 7 * dpr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 7 * dpr, y - 13 * dpr, 2 * dpr, 6 * dpr);
          ctx.fillRect(x + 11 * dpr, y - 13 * dpr, 2 * dpr, 6 * dpr);
        }
        ctx.restore();
        out.handles.push({ li, i, x, y });
      });
    });
  }

  drawLayers(ctx, lo, 'above');

  // ---- editing: handles of the selected layer ----
  if (edit && edit.step === 'layers' && edit.selLayer) {
    const L = (scene.layers || []).find((x) => x.id === edit.selLayer);
    const dpr = edit.dpr || 1;
    for (const h of layerHandles(L, proj)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(h.p[0] - 5 * dpr, h.p[1] - 5 * dpr, 10 * dpr, 10 * dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#2d7ff9';
      ctx.stroke();
      ctx.restore();
      out.layerHandles.push({ id: L.id, ring: h.ring, i: h.i, x: h.p[0], y: h.p[1] });
    }
    out.gizmo = gizmoFor(L, proj, unit);
    if (out.gizmo) drawGizmo(ctx, out.gizmo, dpr);
  }
  // drawing in progress
  if (edit && edit.drawing && edit.drawing.coords.length) {
    const dpr = edit.dpr || 1;
    const pts = edit.drawing.coords.map(proj);
    if (edit.drawing.hover) pts.push(proj(edit.drawing.hover));
    ctx.save();
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.strokeStyle = '#2d7ff9';
    ctx.lineWidth = 2.5 * dpr;
    ctx.fillStyle = 'rgba(45,127,249,0.12)';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (edit.drawing.polygon && pts.length > 2) { ctx.closePath(); ctx.fill(); }
    ctx.stroke();
    ctx.setLineDash([]);
    edit.drawing.coords.forEach((c, i) => {
      const p = proj(c);
      ctx.beginPath(); ctx.arc(p[0], p[1], (i === 0 ? 6 : 4.5) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#2d7ff9' : '#fff'; ctx.fill();
      ctx.strokeStyle = '#2d7ff9'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    });
    ctx.restore();
  }

  // ---- signs ----
  const signScale = unit * (+scene.signSize || 1);
  const order = (scene.signs || []).map((sg, i) => ({ sg, i, p: proj([sg.lng, sg.lat]) })).sort((a, b) => a.p[1] - b.p[1]);
  for (const { sg, i, p } of order) {
    let k = 1;
    if (time != null) k = clamp((time - (model.signTimes[i] ?? 0)) / 0.55, 0, 1);
    if (k <= 0) continue;
    const bbox = drawSign(ctx, sg, p[0], p[1], signScale, k);
    if (bbox) out.signBoxes.push({ i, bbox });
    if (edit && edit.selSign === i && bbox) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#2d7ff9';
      ctx.lineWidth = 2 * (edit.dpr || 1);
      ctx.strokeRect(bbox[0] - 4, bbox[1] - 4, bbox[2] - bbox[0] + 8, bbox[3] - bbox[1] + 8);
      ctx.restore();
    }
  }

  // ---- travel symbol ----
  if (model.drawable.length) {
    if (st && st.point) {
      const sp = proj(st.point);
      if (st.L.style === 'flight3d') sp[1] -= flightLift(proj, st.L, unit) * Math.sin(Math.PI * clamp(st.dist / Math.max(1e-9, st.L.m.length), 0, 1));
      drawSymbol(ctx, look, st.L, sp[0], sp[1], st.heading - map.getBearing(), unit, time);
    } else if (!st) {
      const L = model.drawable.at(-1);
      const end = L.coords.at(-1);
      const prev = sampleAt(L.m, Math.max(0, 1 - 0.01)).point;
      const a = proj(prev), b = proj(end);
      const hd = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      drawSymbol(ctx, look, L, b[0], b[1], hd, unit);
    }
  }

  // ---- compass ----
  // clouds / fog while zooming through the sky
  if (look.clouds && o.frame) {
    const fwCss = o.frame.w / px;
    const zr = zoomRefFor(map.getZoom(), fwCss);
    let k = 1;
    if (look.cloudMode !== 'always') {
      if (time == null) k = 0;
      else {
        const z1 = model.cameraAt(Math.max(0, time - 0.06)).zoom, z2 = model.cameraAt(time + 0.06).zoom;
        k = Math.min(1, Math.abs(z2 - z1) / 0.12 / 1.2);
      }
    }
    if (k > 0.01) drawClouds(ctx, o.frame, zr, map.getBearing(), (+look.cloudAmount || 0.8) * k, unit);
  }

  if (o.frame) {
    const n = look.north || (look.compass ? { ...defaultNorth(), style: 'compass' } : null);
    if (n && n.style !== 'none') drawNorthArrow(ctx, o.frame, unit, n, arrowRotation(n, model, time, map.getBearing(), model.trimIn || 0));
    if (look.scaleBar?.on) { const c = map.getCenter(); drawScaleBar(ctx, o.frame, unit, look.scaleBar, metresPerPixel(c.lat, map.getZoom()) / px); }
  }
  return out;
}
