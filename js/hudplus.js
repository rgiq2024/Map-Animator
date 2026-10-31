// More HUD looks (tactical, radar scope, thermal, mission briefing, terrain scanner), placeable HUD text
// boxes (telemetry, alert, terminal, live coordinates, stamp, ticker) and animated target markers.
import { placeAt } from './place.js';
import { milFilter, drawMorseText } from './milhud.js';

const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const UI = '"Inter","Segoe UI",system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const fam = (f, fb) => (f ? `"${f}", ${fb}` : fb);
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function hexA(hex, a) {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const fmtLat = (v) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? 'E' : 'W'}`;
const tcode = (t) => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const brackets = (ctx, x, y, w, h, b) => {
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy + sy * b); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * b, cy); ctx.stroke();
  }
};
/** Points of other layers (blips / detections), projected. */
function scenePoints(o, self) {
  const out = [];
  for (const L of o.scene?.layers || []) {
    if (L === self || L.hidden || !L.geom) continue;
    if (L.geom.type === 'Point') out.push({ id: L.id, ll: L.geom.coordinates, name: L.style?.label || L.name || '' });
  }
  return out;
}

// ================================================================= extra HUD variants
export const HUD_PLUS = {
  tactical: 'Tactical (compass, pitch ladder, data)', radar: 'Radar scope', thermal: 'Thermal camera (FLIR)',
  mission: 'Mission briefing (typed)', scanner: 'Terrain scanner',
};
/** CSS filter for the map while a thermal HUD is on. */
export function thermalFilter(scene, t, layerTiming) {
  for (const L of scene.layers || []) {
    if (L.kind !== 'hud' || L.hidden || !['thermal', 'geoint'].includes(L.style?.variant)) continue;
    const tm = layerTiming(L, t);
    if (!tm.visible) continue;
    if (L.style.variant === 'geoint') { const f = milFilter(L); if (f) return f; continue; }
    const base = 'grayscale(1) contrast(1.45) brightness(1.06)';
    return L.style.polarity === 'black' ? `${base} invert(1)` : base;
  }
  return '';
}
export function drawHUDPlus(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  const col = s.color || '#7CFF7C';
  const t = o.time ?? 0;
  const u = L.anim === 'none' || tm.edit ? 1 : clamp(tm.tau / Math.max(0.1, L.duration), 0, 1);
  const boot = L.anim === 'boot' ? u : 1;
  const alpha = tm.alpha * (L.anim === 'fade' && !tm.edit ? ease(u) : clamp(u * 3, 0, 1));
  const { x, y, w, h } = frame;
  const cx = x + w / 2, cy = y + h / 2;
  const view = o.view || {};
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 1.6 * unit;
  ctx.font = `600 ${12 * unit}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = hexA(col, 0.6); ctx.shadowBlur = 4 * unit;
  const v = s.variant;
  if (v === 'tactical') {
    ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = hexA(col, 0.12); ctx.lineWidth = 1;
    const gs = 60 * unit;
    for (let gx = cx % gs; gx < x + w; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
    for (let gy = cy % gs; gy < y + h; gy += gs) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
    ctx.restore();
    brackets(ctx, x + 20 * unit, y + 20 * unit, w - 40 * unit, h - 40 * unit, 40 * unit);
    // compass tape
    const bearing = view.bearing || 0, tw = Math.min(420 * unit, w * 0.5), ty0 = y + 46 * unit;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - tw / 2, ty0 - 18 * unit, tw, 36 * unit); ctx.clip();
    ctx.textAlign = 'center';
    for (let d = -90; d <= 90; d += 5) {
      const hdg = Math.round((bearing + d) / 5) * 5, xx = cx + (hdg - bearing) * (tw / 180);
      const big = ((hdg % 15) + 15) % 15 === 0;
      ctx.beginPath(); ctx.moveTo(xx, ty0 + 6 * unit); ctx.lineTo(xx, ty0 + (big ? 16 : 10) * unit); ctx.stroke();
      if (big) { const vv = ((hdg % 360) + 360) % 360; ctx.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[vv] || String(vv).padStart(3, '0'), xx, ty0 - 4 * unit); }
    }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(cx, ty0 + 18 * unit); ctx.lineTo(cx - 6 * unit, ty0 + 27 * unit); ctx.lineTo(cx + 6 * unit, ty0 + 27 * unit); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillText(`HDG ${String(Math.round(((bearing % 360) + 360) % 360)).padStart(3, '0')}`, cx, ty0 + 40 * unit);
    // pitch ladder
    const pitch = view.pitch || 0;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - 160 * unit, cy - 120 * unit, 320 * unit, 240 * unit); ctx.clip();
    for (let p = -30; p <= 90; p += 10) {
      const yy = cy + (pitch - p) * 4 * unit;
      const lw = (p === 0 ? 120 : 60) * unit;
      ctx.setLineDash(p < 0 ? [6 * unit, 5 * unit] : []);
      ctx.beginPath(); ctx.moveTo(cx - lw - 40 * unit, yy); ctx.lineTo(cx - 40 * unit, yy); ctx.moveTo(cx + 40 * unit, yy); ctx.lineTo(cx + 40 * unit + lw, yy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right'; ctx.fillText(String(p), cx - lw - 46 * unit, yy);
    }
    ctx.restore();
    // centre reticle with range rings
    ctx.beginPath(); ctx.moveTo(cx - 28 * unit, cy); ctx.lineTo(cx - 8 * unit, cy); ctx.moveTo(cx + 8 * unit, cy); ctx.lineTo(cx + 28 * unit, cy); ctx.moveTo(cx, cy - 8 * unit); ctx.lineTo(cx, cy - 28 * unit); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3 * unit, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.globalAlpha *= 0.5; ctx.setLineDash([3 * unit, 6 * unit]);
    for (const r of [70, 130]) { ctx.beginPath(); ctx.arc(cx, cy, r * unit, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // side data
    const alt = view.altM || 0;
    const left = [`ALT ${alt >= 10000 ? `${(alt / 1000).toFixed(1)} KM` : `${Math.round(alt)} M`}`, `PITCH ${Math.round(pitch)}°`, `ZOOM ${(view.zoom || 0).toFixed(1)}`];
    const right = [s.label || 'TACTICAL', `TC ${tcode(t)}`, `${Math.sin(t * 4) > 0 ? '■' : '□'} LINK OK`];
    ctx.textAlign = 'left';
    left.forEach((l, i) => ctx.fillText(l.slice(0, Math.ceil(l.length * clamp(boot * 1.4 - i * 0.1, 0, 1))), x + 44 * unit, cy - 20 * unit + i * 20 * unit));
    ctx.textAlign = 'right';
    right.forEach((l, i) => ctx.fillText(l, x + w - 44 * unit, cy - 20 * unit + i * 20 * unit));
    if (s.coords !== false && view.center) {
      ctx.textAlign = 'center';
      ctx.fillText(`${fmtLat(view.center[1])}   ${fmtLon(view.center[0])}`, cx, y + h - 46 * unit);
    }
    if (s.classified !== false) {
      ctx.save(); ctx.fillStyle = hexA('#ff3b30', 0.9); ctx.shadowColor = 'rgba(255,59,48,.6)'; ctx.font = `800 ${12 * unit}px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText('// CLASSIFIED', x + 44 * unit, y + 44 * unit); ctx.restore();
    }
  } else if (v === 'radar') {
    const R = 120 * unit * (+s.size || 1);
    const m = 34 * unit;
    let px = x + w - m - R, py = y + h - m - R;
    const pos = s.position || 'bottom-right';
    if (pos.includes('left')) px = x + m + R;
    if (pos.includes('top')) py = y + m + R;
    if (pos === 'center') { px = cx; py = cy; }
    placeAt(ctx, L, frame, px - R, py - R, R * 2, R * 2);
    ctx.save(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(2,12,6,0.72)'; ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.2 * unit;
    for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(px, py, R * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(px - R, py); ctx.lineTo(px + R, py); ctx.moveTo(px, py - R); ctx.lineTo(px, py + R); ctx.stroke();
    const a = (t * (+s.speed || 1) * 1.6) % (Math.PI * 2) - Math.PI / 2;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, R, a - 0.9, a); ctx.closePath();
    const g = ctx.createRadialGradient(px, py, 0, px, py, R);
    g.addColorStop(0, hexA(col, 0.05)); g.addColorStop(1, hexA(col, 0.35));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * R, py + Math.sin(a) * R); ctx.lineWidth = 2 * unit; ctx.stroke();
    ctx.restore();
    // blips: other point layers relative to the frame centre, else a few random contacts
    const pts = scenePoints(o, L).map((q) => { const [qx, qy] = o.proj(q.ll); return [(qx - cx) / (Math.min(w, h) / 2), (qy - cy) / (Math.min(w, h) / 2)]; });
    const r = rng(hashStr(L.id));
    if (!pts.length) for (let i = 0; i < 5; i++) pts.push([(r() - 0.5) * 1.6, (r() - 0.5) * 1.6]);
    for (const [bx, by] of pts) {
      const d = Math.hypot(bx, by);
      if (d > 0.98) continue;
      const ba = Math.atan2(by, bx);
      let since = (a - ba) % (Math.PI * 2); if (since < 0) since += Math.PI * 2;
      const glow = Math.max(0, 1 - since / (Math.PI * 1.6));
      ctx.save(); ctx.globalAlpha *= 0.25 + 0.75 * glow; ctx.shadowBlur = 10 * unit * glow;
      ctx.beginPath(); ctx.arc(px + bx * R, py + by * R, (3 + 2 * glow) * unit, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.font = `700 ${11 * unit}px ${MONO}`;
    ctx.fillText(s.label || 'RADAR', px, py - R - 12 * unit);
    ctx.fillText(`RNG ${s.range || '50 KM'}`, px, py + R + 14 * unit);
  } else if (v === 'thermal') {
    // grain + vignette + reticle (the map itself is turned grey by thermalFilter)
    ctx.save(); ctx.shadowBlur = 0;
    const r = rng(hashStr(L.id) + Math.floor(t * 24));
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 260; i++) ctx.fillRect(x + r() * w, y + r() * h, 1.5 * unit, 1.5 * unit);
    const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    const c2 = s.polarity === 'black' ? '#111' : '#fff';
    ctx.strokeStyle = c2; ctx.fillStyle = c2; ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 2 * unit;
    const gap = 14 * unit, len = 60 * unit;
    ctx.beginPath(); ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy); ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len); ctx.stroke();
    ctx.strokeRect(cx - 90 * unit, cy - 60 * unit, 180 * unit, 120 * unit);
    brackets(ctx, x + 30 * unit, y + 30 * unit, w - 60 * unit, h - 60 * unit, 36 * unit);
    ctx.font = `700 ${13 * unit}px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(s.polarity === 'black' ? 'BHOT' : 'WHOT', x + 50 * unit, y + 54 * unit);
    ctx.fillText(`IR  ${(+s.zoomLevel || 12).toFixed(1)}x`, x + 50 * unit, y + 74 * unit);
    ctx.textAlign = 'right';
    ctx.fillText(s.label || 'FLIR-1', x + w - 50 * unit, y + 54 * unit);
    ctx.fillText(tcode(t), x + w - 50 * unit, y + 74 * unit);
    if (view.center && s.coords !== false) { ctx.textAlign = 'center'; ctx.fillText(`${fmtLat(view.center[1])}  ${fmtLon(view.center[0])}`, cx, y + h - 50 * unit); }
  } else if (v === 'mission') {
    const lines = String(s.text || 'MISSION: RECON ALPHA\nOBJECTIVE: SURVEY THE AREA\nSTATUS: IN PROGRESS').split('\n');
    const total = lines.reduce((a, l) => a + l.length + 4, 0);
    const shown = tm.edit ? total : Math.floor(total * clamp(tm.tau / Math.max(0.3, L.duration), 0, 1));
    ctx.font = `600 ${15 * unit * (+s.size || 1)}px ${fam(s.font, MONO)}`;
    const lh = 24 * unit * (+s.size || 1);
    const bw = Math.max(...lines.map((l) => ctx.measureText(`> ${l}`).width)) + 40 * unit, bh = lines.length * lh + 50 * unit;
    const m = 34 * unit;
    let bx = x + m, by = y + m;
    const pos = s.position || 'top-left';
    if (pos.includes('right')) bx = x + w - m - bw;
    if (pos.includes('bottom')) by = y + h - m - bh;
    if (pos === 'center') { bx = cx - bw / 2; by = cy - bh / 2; }
    placeAt(ctx, L, frame, bx, by, bw, bh);
    ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(3,8,5,0.8)'; ctx.fillRect(bx, by, bw, bh); ctx.restore();
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillRect(bx, by, bw, 22 * unit);
    ctx.save(); ctx.fillStyle = '#04110a'; ctx.shadowBlur = 0; ctx.font = `800 ${11 * unit}px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(s.label || 'MISSION BRIEFING', bx + 10 * unit, by + 11 * unit); ctx.textAlign = 'right'; ctx.fillText(tcode(t), bx + bw - 10 * unit, by + 11 * unit); ctx.restore();
    let left = shown;
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      if (left <= 0) return;
      const txt = `> ${l}`.slice(0, left);
      left -= l.length + 4;
      ctx.fillText(txt, bx + 16 * unit, by + 42 * unit + i * lh);
      if (left <= 0 && Math.sin(t * 9) > 0) { const cw = ctx.measureText(txt).width; ctx.fillRect(bx + 18 * unit + cw, by + 34 * unit + i * lh, 9 * unit, 16 * unit); }
    });
  } else if (v === 'scanner') {
    const period = +s.period || 3;
    const sy = y + ((t / period) % 1) * h;
    ctx.save(); ctx.shadowBlur = 0;
    ctx.strokeStyle = hexA(col, 0.14); ctx.lineWidth = 1;
    const gs = 40 * unit;
    for (let gx = x; gx < x + w; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, sy); ctx.stroke(); }
    for (let gy = y; gy < sy; gy += gs) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, sy - 80 * unit, 0, sy);
    g.addColorStop(0, hexA(col, 0)); g.addColorStop(1, hexA(col, 0.28));
    ctx.fillStyle = g; ctx.fillRect(x, sy - 80 * unit, w, 80 * unit);
    ctx.restore();
    ctx.lineWidth = 2.5 * unit; ctx.shadowBlur = 14 * unit;
    ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); ctx.stroke();
    ctx.shadowBlur = 4 * unit; ctx.lineWidth = 1.6 * unit;
    // detections at the other point layers once the scan passed them
    for (const q of scenePoints(o, L)) {
      const [qx, qy] = o.proj(q.ll);
      if (qx < x || qx > x + w || qy < y || qy > y + h || qy > sy + 1) continue;
      const bs = 22 * unit;
      ctx.strokeRect(qx - bs, qy - bs, bs * 2, bs * 2);
      ctx.font = `700 ${10 * unit}px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText((q.name || 'OBJ').toUpperCase().slice(0, 18), qx + bs + 4 * unit, qy - bs + 6 * unit);
    }
    const pct = tm.edit ? 64 : Math.min(100, Math.floor(clamp(tm.tau / Math.max(0.5, L.duration), 0, 1) * 100));
    ctx.font = `800 ${16 * unit}px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(`${s.label || 'ANALYZING TERRAIN'} ${pct}%`, x + 36 * unit, y + 40 * unit);
    ctx.strokeRect(x + 36 * unit, y + 54 * unit, 220 * unit, 8 * unit);
    ctx.fillRect(x + 36 * unit, y + 54 * unit, 220 * unit * (pct / 100), 8 * unit);
    brackets(ctx, x + 18 * unit, y + 18 * unit, w - 36 * unit, h - 36 * unit, 30 * unit);
  }
  ctx.restore();
}

// ================================================================= HUD text boxes (placeable)
export const HUDTEXT_STYLES = {
  telemetry: 'Telemetry (label: value lines)', alert: 'Alert / warning banner', terminal: 'Terminal (typed lines)',
  coords: 'Live coordinates', stamp: 'Stamp (CLASSIFIED…)', ticker: 'Ticker (scrolling)', morse: 'Morse code (dots, dashes and sound)',
};
export function drawHudText(ctx, L, tm, o) {
  const { frame, unit } = o;
  const s = L.style;
  const st = s.look || 'telemetry';
  if (st === 'morse') { drawMorseText(ctx, L, tm, o); return; }
  const col = s.color || (st === 'alert' || st === 'stamp' ? '#ff3b30' : '#7CFF7C');
  const k = +s.size || 1;
  const t = o.time ?? 0;
  const tau = tm.edit ? 99 : tm.tau;
  const u = tm.edit ? 1 : clamp(tau / Math.max(0.1, L.duration), 0, 1);
  const seed = hashStr(L.id);
  let alpha = tm.alpha;
  if (L.anim === 'flicker' && u < 1) alpha *= rng(seed + Math.floor(tau * 30))() < 0.3 + u * 0.6 ? 1 : 0.1;
  if (L.anim === 'fade') alpha *= ease(u);
  if (alpha <= 0.01) return;
  const F = fam(s.font, MONO);
  const lines = String(s.text || '').split('\n').filter((l, i, a) => l.length || a.length === 1);
  const view = o.view || {};
  let rows = lines;
  if (st === 'coords') rows = [`LAT ${fmtLat(view.center?.[1] || 0)}`, `LON ${fmtLon(view.center?.[0] || 0)}`, `ALT ${Math.round(view.altM || 0).toLocaleString('en')} M`, `HDG ${String(Math.round((((view.bearing || 0) % 360) + 360) % 360)).padStart(3, '0')}°`];
  ctx.save();
  ctx.globalAlpha *= alpha;
  const fs = (st === 'stamp' ? 30 : st === 'alert' ? 20 : 14) * unit * k;
  ctx.font = `${st === 'stamp' || st === 'alert' ? 900 : 600} ${fs}px ${F}`;
  const lh = fs * 1.5;
  const pad = 14 * unit * k;
  const tw = Math.max(80 * unit, ...rows.map((l) => ctx.measureText(l).width));
  let W = tw + pad * 2 + (st === 'alert' ? 40 * unit * k : 0), H = rows.length * lh + pad * 2;
  if (st === 'ticker') { W = frame.w; H = lh + pad; }
  const tickH = st === 'ticker' && s.tickerStyle === 'twoline' && s.headline ? H * 2.35 : H;
  const m = 30 * unit;
  const pos = s.position || 'top-left';
  let x = frame.x + m, y = frame.y + m;
  if (pos.includes('right')) x = frame.x + frame.w - m - W;
  if (pos === 'top' || pos === 'bottom' || pos === 'center') x = frame.x + (frame.w - W) / 2;
  if (pos.includes('bottom')) y = frame.y + frame.h - m - H;
  if (pos === 'center') y = frame.y + (frame.h - H) / 2;
  if (st === 'ticker') { x = frame.x; if (!pos.includes('top')) y = frame.y + frame.h - tickH - 10 * unit; }
  placeAt(ctx, L, frame, x, y, W, st === 'ticker' ? tickH : H, { lockX: st === 'ticker' });
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  if (st === 'telemetry' || st === 'coords' || st === 'terminal') {
    ctx.fillStyle = 'rgba(4,8,6,0.72)'; ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 1.4 * unit; brackets(ctx, x, y, W, H, 10 * unit);
    ctx.fillStyle = col; ctx.shadowColor = hexA(col, 0.7); ctx.shadowBlur = 6 * unit;
    const total = rows.reduce((a, l) => a + l.length + 2, 0);
    let left = st === 'terminal' ? Math.floor(total * u) : Infinity;
    rows.forEach((l, i) => {
      let txt = l;
      if (st === 'telemetry' && !tm.edit) {
        // numbers tick over while the line is "live"
        txt = l.replace(/-?\d+(\.\d+)?/g, (n) => { const dp = (n.split('.')[1] || '').length; const v = +n; const j = (rng(seed + i * 7 + Math.floor(tau * 6))() - 0.5) * Math.max(0.0001, Math.abs(v) * 0.002) * (s.live !== false ? 1 : 0); return (v + j).toFixed(dp); });
        txt = txt.slice(0, Math.ceil(txt.length * clamp(u * 1.6 - i * 0.12, 0, 1)));
      }
      if (st === 'terminal') { txt = (left > 0 ? l.slice(0, left) : ''); left -= l.length + 2; }
      if (!txt) return;
      const parts = txt.split(':');
      const yy = y + pad + lh * (i + 0.5);
      if (parts.length > 1 && st !== 'terminal') {
        ctx.globalAlpha *= 0.7; ctx.fillText(`${parts[0]}:`, x + pad, yy); ctx.globalAlpha /= 0.7;
        const lw = ctx.measureText(`${parts[0]}: `).width;
        ctx.fillText(parts.slice(1).join(':').trim(), x + pad + lw, yy);
      } else ctx.fillText(st === 'terminal' ? `$ ${txt}` : txt, x + pad, yy);
      if (st === 'terminal' && left <= 0 && left > -l.length - 3 && Math.sin(t * 9) > 0) ctx.fillRect(x + pad + ctx.measureText(`$ ${txt}`).width + 3 * unit, yy - fs * 0.55, fs * 0.6, fs * 1.1);
    });
  } else if (st === 'alert') {
    const on = tm.edit || Math.sin(tau * 7) > -0.4;
    ctx.fillStyle = 'rgba(30,0,0,0.78)'; ctx.fillRect(x, y, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, 7 * unit); ctx.rect(x, y + H - 7 * unit, W, 7 * unit); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = '#111';
    for (let i = -2; i < W / (14 * unit) + 2; i++) { const sx = x + i * 14 * unit + ((tau * 30) % 14) * unit; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 7 * unit, y); ctx.lineTo(sx - 1 * unit, y + H); ctx.lineTo(sx - 8 * unit, y + H); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 2 * unit; ctx.strokeRect(x, y, W, H);
    if (on) {
      ctx.fillStyle = col; ctx.shadowColor = hexA(col, 0.9); ctx.shadowBlur = 14 * unit;
      ctx.beginPath(); const ix = x + pad + 10 * unit, iy = y + H / 2; ctx.moveTo(ix, iy - 11 * unit * k); ctx.lineTo(ix + 12 * unit * k, iy + 10 * unit * k); ctx.lineTo(ix - 12 * unit * k, iy + 10 * unit * k); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `900 ${13 * unit * k}px ${UI}`; ctx.textAlign = 'center'; ctx.fillText('!', ix, iy + 3 * unit * k); ctx.textAlign = 'left';
      ctx.fillStyle = col; ctx.font = `900 ${fs}px ${F}`;
      rows.forEach((l, i) => ctx.fillText(l, x + pad + 34 * unit * k, y + pad + lh * (i + 0.5)));
    }
  } else if (st === 'stamp') {
    ctx.translate(x + W / 2, y + H / 2);
    ctx.rotate((+s.angle || -8) * Math.PI / 180);
    const sc = tm.edit ? 1 : 1 + 1.4 * (1 - easeOut(u * 2.2));
    ctx.scale(sc, sc);
    ctx.globalAlpha *= tm.edit ? 1 : clamp(u * 4, 0, 1);
    ctx.strokeStyle = col; ctx.lineWidth = 4 * unit * k;
    ctx.strokeRect(-W / 2, -H / 2, W, H);
    ctx.lineWidth = 1.5 * unit * k;
    ctx.strokeRect(-W / 2 + 6 * unit * k, -H / 2 + 6 * unit * k, W - 12 * unit * k, H - 12 * unit * k);
    ctx.fillStyle = col; ctx.textAlign = 'center';
    rows.forEach((l, i) => ctx.fillText(l, 0, -H / 2 + pad + lh * (i + 0.5)));
  } else if (st === 'ticker') {
    const TS = {
      classic: { bg: 'rgba(6,8,12,0.88)', tag: col, tagText: '#fff', text: '#fff', line: col },
      red: { bg: '#c8102e', tag: '#ffffff', tagText: '#c8102e', text: '#ffffff', line: '#7a0a1c' },
      navy: { bg: '#0b1f3a', tag: '#f2b705', tagText: '#0b1f3a', text: '#ffffff', line: '#f2b705' },
      white: { bg: '#f7f7f7', tag: '#d71920', tagText: '#ffffff', text: '#111418', line: '#d71920' },
      twoline: { bg: '#101318', tag: col, tagText: '#fff', text: '#ffffff', line: col },
      flip: { bg: 'rgba(6,8,12,0.9)', tag: col, tagText: '#fff', text: '#fff', line: col },
      finance: { bg: '#05070a', tag: '#1e88e5', tagText: '#fff', text: '#e8edf2', line: '#1e88e5' },
      sports: { bg: '#0d3b1e', tag: '#f2f2f2', tagText: '#0d3b1e', text: '#ffffff', line: '#36c46b' },
      flash: { bg: '#111', tag: '#e10600', tagText: '#fff', text: '#ffffff', line: '#e10600' },
    };
    const sty = TS[s.tickerStyle] ? s.tickerStyle : 'classic';
    const P = TS[sty];
    const bg = s.bg || P.bg, tagBg = s.tagBg || P.tag, txtCol = s.textColor || P.text;
    const two = sty === 'twoline' && s.headline;
    const hH = two ? H * 1.35 : 0;
    const yb = y + hH; // crawl band top
    if (two) {
      // headline bar above the crawl
      ctx.fillStyle = s.headBg || '#ffffff'; ctx.fillRect(x, y, W, hH);
      ctx.fillStyle = tagBg; ctx.fillRect(x, y, 8 * unit, hH);
      ctx.font = `800 ${fs * 1.35}px ${UI}`; ctx.fillStyle = s.headColor || '#111418';
      ctx.fillText(s.upper ? s.headline.toUpperCase() : s.headline, x + 22 * unit, y + hH / 2 + 1, W - 44 * unit);
    }
    ctx.fillStyle = bg; ctx.fillRect(x, yb, W, H);
    ctx.fillStyle = s.lineColor || P.line; ctx.fillRect(x, yb, W, 3 * unit);
    const label = s.label ?? 'BREAKING';
    ctx.font = `900 ${fs}px ${UI}`;
    const lw = label ? ctx.measureText(label).width + 26 * unit : 0;
    const clk = s.clock ? (() => { const m = String(s.clock).match(/(\d{1,2}):(\d{2})/); let sec = (m ? +m[1] * 3600 + +m[2] * 60 : 0) + Math.floor(t); sec %= 86400; return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`; })() : '';
    const cw = clk ? ctx.measureText('00:00').width + 22 * unit : 0;
    const items = rows.map((r) => (s.upper ? r.toUpperCase() : r));
    ctx.save(); ctx.beginPath(); ctx.rect(x + lw, yb, W - lw - cw, H); ctx.clip();
    ctx.fillStyle = txtCol;
    if (sty === 'flip') {
      // one headline at a time, rolling up
      const per = Math.max(1.5, 4 / (+s.speed || 1));
      const n = Math.max(1, items.length);
      const k0 = Math.floor(t / per) % n, ph = (t % per) / per;
      const roll = ph > 0.88 ? (ph - 0.88) / 0.12 : 0;
      ctx.font = `${s.bold ? 800 : 600} ${fs}px ${F}`;
      ctx.fillText(items[k0] || '', x + lw + 16 * unit, yb + H / 2 + 1 - roll * H);
      ctx.fillText(items[(k0 + 1) % n] || '', x + lw + 16 * unit, yb + H / 2 + 1 + (1 - roll) * H);
    } else {
      const sep = `   ${s.sep || '•'}   `;
      ctx.font = `${s.bold ? 800 : 600} ${fs}px ${F}`;
      // finance / sports items get coloured parts
      const pieces = (txt) => {
        if (sty === 'finance') {
          const m = txt.match(/^(\S+)\s+([\d.,]+)\s*([+-][\d.,]+%?)?/);
          if (m) { const up = !String(m[3] || '').startsWith('-'); return [[`${m[1]} `, '#ffffff', 800], [`${m[2]} `, txtCol, 600], ...(m[3] ? [[`${up ? '▲' : '▼'} ${m[3].replace(/^[+-]/, '')}`, up ? '#2ecc71' : '#ff4d4f', 700]] : [])]; }
        }
        if (sty === 'sports') {
          const m = txt.match(/^(.+?)\s+(\d+\s*[-:]\s*\d+)\s+(.+)$/);
          if (m) return [[`${m[1]} `, txtCol, 700], [` ${m[2].replace(/\s/g, '')} `, '#f2c200', 900], [` ${m[3]}`, txtCol, 700]];
        }
        return [[txt, txtCol, s.bold ? 800 : 600]];
      };
      const seq = [];
      items.forEach((it) => { seq.push(...pieces(it)); seq.push([sep, sty === 'finance' ? '#4b5563' : txtCol, 600]); });
      const widthOf = (p) => { ctx.font = `${p[2]} ${fs}px ${F}`; return ctx.measureText(p[0]).width; };
      const ws = seq.map(widthOf);
      const twd = Math.max(1, ws.reduce((a2, b2) => a2 + b2, 0));
      let off = (t * 90 * unit * (+s.speed || 1)) % twd;
      if (s.dir === 'right') off = twd - off;
      for (let xx = x + lw - off; xx < x + W; xx += twd) {
        let cx = xx + 10 * unit;
        seq.forEach((p, i) => { if (cx + ws[i] > x + lw - 5 && cx < x + W) { ctx.font = `${p[2]} ${fs}px ${F}`; ctx.fillStyle = p[1]; ctx.fillText(p[0], cx, yb + H / 2 + 1); } cx += ws[i]; });
      }
    }
    ctx.restore();
    if (label) {
      const blink = sty === 'flash' && Math.floor(t * 2.5) % 2 === 1;
      ctx.fillStyle = blink ? '#ffffff' : tagBg; ctx.fillRect(x, yb, lw, H);
      ctx.beginPath(); ctx.moveTo(x + lw, yb); ctx.lineTo(x + lw + 10 * unit, yb + H / 2); ctx.lineTo(x + lw, yb + H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = blink ? tagBg : s.tagText || P.tagText; ctx.font = `900 ${fs}px ${UI}`; ctx.fillText(label, x + 13 * unit, yb + H / 2 + 1);
    }
    if (clk) {
      ctx.fillStyle = s.clockBg || '#111318'; ctx.fillRect(x + W - cw, yb, cw, H);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${fs}px ${F}`; ctx.fillText(clk, x + W - cw + 11 * unit, yb + H / 2 + 1);
    }
  }
  ctx.restore();
}

// ================================================================= target markers (on the map)
export const TARGET_STYLES = {
  lock: 'Lock-on brackets', crosshair: 'Rotating crosshair', reticle: 'Acquisition reticle', diamond: 'Tracking diamond',
  ping: 'Radar ping', box: 'Box with callout',
};
/** Seconds into the layer when the target locks (for sounds). */
export const lockTime = (L) => Math.max(0.3, +L.duration || 2) * 0.75;
export function drawTarget(ctx, L, tm, proj, unit) {
  if (!L.geom) return;
  const s = L.style;
  const [x, y] = proj(L.geom.coordinates);
  const k = +s.size || 1;
  const t = tm.edit ? 1.2 : tm.tau;
  const lt = lockTime(L);
  const lockU = tm.edit ? 1 : clamp(t / lt, 0, 1);
  const locked = lockU >= 1;
  const col0 = s.color || '#ffd23f', colL = s.lockColor || '#ff3b30';
  const col = locked ? colL : col0;
  const R = 34 * unit * k;
  const v = s.look || 'lock';
  let alpha = tm.alpha * (tm.edit ? 1 : clamp(t / 0.25, 0, 1));
  if (!locked && !tm.edit && v !== 'ping') alpha *= rng(hashStr(L.id) + Math.floor(t * 20))() < 0.15 ? 0.35 : 1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 2.2 * unit * Math.sqrt(k);
  ctx.shadowColor = hexA(col, 0.75); ctx.shadowBlur = 8 * unit;
  const e = easeOut(lockU);
  if (v === 'lock') {
    const bs = R * (2.6 - 1.6 * e);
    ctx.save(); ctx.translate(x, y); ctx.rotate((1 - e) * Math.PI / 4);
    const b = R * 0.45;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.beginPath(); ctx.moveTo(-sx * bs, -sy * bs + sy * b); ctx.lineTo(-sx * bs, -sy * bs); ctx.lineTo(-sx * bs + sx * b, -sy * bs); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, 3.5 * unit, 0, Math.PI * 2); ctx.fill();
    if (locked) { const p = (t - lt) % 1; ctx.save(); ctx.globalAlpha *= 1 - p; ctx.beginPath(); ctx.arc(x, y, R * (1 + p * 1.2), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  } else if (v === 'crosshair') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * (locked ? 0.4 : 2));
    ctx.setLineDash([8 * unit, 6 * unit]); ctx.beginPath(); ctx.arc(0, 0, R * (1.6 - 0.4 * e), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    const g = R * 0.35, l = R * (1.9 - 0.5 * e);
    ctx.beginPath(); ctx.moveTo(x - l, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + l, y); ctx.moveTo(x, y - l); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + l); ctx.stroke();
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + g + i * R * 0.3, y - 4 * unit); ctx.lineTo(x + g + i * R * 0.3, y + 4 * unit); ctx.stroke(); }
  } else if (v === 'reticle') {
    for (let i = 0; i < 3; i++) {
      const rr = R * (0.6 + i * 0.45) * (1 + (1 - e) * (1.5 - i * 0.3));
      ctx.save(); ctx.translate(x, y); ctx.rotate((i % 2 ? -1 : 1) * t * 0.9 + i);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr, Math.PI + 0.2, Math.PI * 2 - 0.2); ctx.stroke();
      ctx.restore();
    }
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const rr = R * (1.9 + (1 - e) * 1.2);
      ctx.save(); ctx.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.rotate(a + Math.PI);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10 * unit, -7 * unit); ctx.lineTo(-10 * unit, 7 * unit); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  } else if (v === 'diamond') {
    const d = R * (1.1 + 0.15 * Math.sin(t * 6));
    ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); ctx.stroke();
    ctx.save(); ctx.globalAlpha *= 0.18; ctx.fill(); ctx.restore();
    const bx = R * 1.8;
    ctx.save(); ctx.globalAlpha *= 0.8; ctx.setLineDash([4 * unit, 4 * unit]); ctx.strokeRect(x - bx, y - bx, bx * 2, bx * 2); ctx.restore();
  } else if (v === 'ping') {
    for (let i = 0; i < 3; i++) {
      const p = ((t * 0.8 + i / 3) % 1);
      ctx.save(); ctx.globalAlpha *= (1 - p) * 0.9; ctx.lineWidth = 2.5 * unit * (1 - p) + 0.5;
      ctx.beginPath(); ctx.arc(x, y, R * 0.3 + p * R * 2.4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x, y, 6 * unit * k, 0, Math.PI * 2); ctx.fill();
  } else if (v === 'box') {
    const bs = R * (1.6 - 0.5 * e);
    ctx.strokeRect(x - bs, y - bs, bs * 2, bs * 2);
    ctx.lineWidth = 3.5 * unit;
    brackets(ctx, x - bs - 5 * unit, y - bs - 5 * unit, bs * 2 + 10 * unit, bs * 2 + 10 * unit, 10 * unit);
  }
  // label & readout with a leader line
  const label = s.label ?? 'TGT-01';
  const lines = [];
  if (label) lines.push(locked && s.lockText !== '' ? `${label}  ${s.lockText || 'LOCKED'}` : label);
  if (s.showCoords !== false) { const [lng, lat] = L.geom.coordinates; lines.push(`${fmtLat(lat)} ${fmtLon(lng)}`); }
  if (s.sub) lines.push(s.sub);
  if (lines.length) {
    const lx = x + R * 1.9, ly = y - R * 1.9;
    ctx.lineWidth = 1.4 * unit;
    ctx.beginPath(); ctx.moveTo(x + R * 0.8, y - R * 0.8); ctx.lineTo(lx, ly); ctx.lineTo(lx + 18 * unit, ly); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `700 ${12 * unit * Math.sqrt(k)}px ${MONO}`;
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const lh = 17 * unit * Math.sqrt(k);
    ctx.fillStyle = 'rgba(6,8,10,0.72)';
    ctx.fillRect(lx + 22 * unit, ly - lh * 0.8, tw + 16 * unit, lh * lines.length + 6 * unit);
    ctx.fillStyle = col; ctx.textBaseline = 'middle';
    const typed = tm.edit ? 1 : clamp((t - 0.2) / 0.6, 0, 1);
    lines.forEach((l, i) => ctx.fillText(l.slice(0, Math.ceil(l.length * typed)), lx + 30 * unit, ly - lh * 0.3 + i * lh + 3 * unit));
  }
  ctx.restore();
}

// ================================================================= more glitch text animations
/** Extra flicker-text animations, applied around the normal text drawing. Returns true if drawn. */
export const FLICKER_PLUS = { slice: 'Slice glitch', scan: 'Scan reveal', redact: 'Redacted bars', neon: 'Neon sign' };
