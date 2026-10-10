// On-video map furniture: animated north arrows (four styles) and a scale bar.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
const UI = '"Inter","Segoe UI",system-ui,sans-serif';

export const NORTH_STYLES = { none: 'None', compass: 'Compass', arrow: 'Classic arrow', rose: 'Compass rose', needle: 'Needle' };
export const NORTH_MODES = { north: 'Points north (turns with the map)', heading: 'Points where the route goes' };
export const CORNERS = { 'top-right': 'Top right', 'top-left': 'Top left', 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left' };

export function defaultNorth() {
  return { style: 'none', mode: 'north', position: 'top-right', size: 1, spinIn: true, smooth: true };
}
export function defaultScaleBar() {
  return { on: false, units: 'metric', position: 'top-left' };
}

function corner(frame, pos, w, h, m) {
  const x = pos.includes('right') ? frame.x + frame.w - m - w : frame.x + m;
  const y = pos.includes('bottom') ? frame.y + frame.h - m - h : frame.y + m;
  return [x, y];
}

/** Screen rotation (degrees) for the arrow at time t, smoothed so it swings like a real compass. */
export function arrowRotation(n, model, time, mapBearing, trimIn = 0) {
  const target = (t) => {
    const cam = model.cameraAt(t);
    const b = cam.bearing || 0;
    if (n.mode === 'heading' && model.drawable.length) {
      const st = model.stateAt(t);
      return st.point ? st.heading - b + 90 : -b;
    }
    return -b;
  };
  if (time == null) return n.mode === 'heading' ? 0 : -mapBearing;
  let rot;
  if (n.smooth !== false) {
    let sx = 0, sy = 0;
    for (let k = 0; k < 8; k++) {
      const w = 1 - k / 8;
      const a = (target(Math.max(0, time - k * 0.07)) * Math.PI) / 180;
      sx += Math.cos(a) * w; sy += Math.sin(a) * w;
    }
    rot = (Math.atan2(sy, sx) * 180) / Math.PI;
  } else rot = target(time);
  if (n.spinIn) rot += 360 * (1 - easeOut((time - trimIn) / 1.4));
  return rot;
}

export function drawNorthArrow(ctx, frame, unit, n, rotDeg, appear = 1) {
  if (!n || n.style === 'none' || appear <= 0) return;
  const r = 24 * unit * (+n.size || 1);
  const m = 20 * unit;
  const [x0, y0] = corner(frame, n.position || 'top-right', r * 2, r * 2 + (n.style === 'arrow' ? r * 0.5 : 0), m);
  const cx = x0 + r, cy = y0 + r + (n.style === 'arrow' ? r * 0.5 : 0);
  const rot = (rotDeg * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha *= clamp(appear, 0, 1);
  ctx.translate(cx, cy);
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8 * unit;
  ctx.shadowOffsetY = 2 * unit;
  if (n.style === 'compass') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1.5 * unit; ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.stroke();
    ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(r * 0.24, 0); ctx.lineTo(-r * 0.24, 0); ctx.closePath(); ctx.fillStyle = '#e53935'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.8); ctx.lineTo(r * 0.24, 0); ctx.lineTo(-r * 0.24, 0); ctx.closePath(); ctx.fillStyle = '#37474f'; ctx.fill();
    ctx.font = `800 ${r * 0.34}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e53935';
    ctx.fillText('N', 0, -r * 1.25 + r * 0.42);
  } else if (n.style === 'arrow') {
    ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.55, r * 0.85); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.55, r * 0.85); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.55, r * 0.85); ctx.closePath();
    ctx.fillStyle = '#16181d'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.55, r * 0.85); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.55, r * 0.85); ctx.closePath();
    ctx.lineWidth = 1.6 * unit; ctx.strokeStyle = '#16181d'; ctx.stroke();
    ctx.font = `900 ${r * 0.6}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3 * unit; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText('N', 0, -r * 1.12);
    ctx.fillStyle = '#16181d'; ctx.fillText('N', 0, -r * 1.12);
  } else if (n.style === 'rose') {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.rotate(rot);
    ctx.lineWidth = 1 * unit; ctx.strokeStyle = 'rgba(30,30,30,0.5)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
    const point = (ang, len, wid, dark) => {
      ctx.save(); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(wid, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = dark ? '#2b2b2b' : '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(-wid, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = dark ? '#ffffff' : '#2b2b2b'; ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    for (let k = 0; k < 4; k++) point(Math.PI / 4 + (k * Math.PI) / 2, r * 0.55, r * 0.12, k % 2);
    for (let k = 0; k < 4; k++) point((k * Math.PI) / 2, r * 0.9, r * 0.17, k % 2);
    ctx.font = `900 ${r * 0.3}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c62828'; ctx.fillText('N', 0, -r * 1.12);
  } else if (n.style === 'needle') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,18,22,0.6)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2 * unit; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6 + rot;
      ctx.beginPath(); ctx.moveTo(Math.sin(a) * r * 0.82, -Math.cos(a) * r * 0.82); ctx.lineTo(Math.sin(a) * r * 0.92, -Math.cos(a) * r * 0.92);
      ctx.lineWidth = (k % 3 ? 1 : 2) * unit; ctx.stroke();
    }
    ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.72); ctx.lineTo(r * 0.11, 0); ctx.lineTo(-r * 0.11, 0); ctx.closePath(); ctx.fillStyle = '#ff3b30'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.72); ctx.lineTo(r * 0.11, 0); ctx.lineTo(-r * 0.11, 0); ctx.closePath(); ctx.fillStyle = '#f2f2f2'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2); ctx.fillStyle = '#16181d'; ctx.fill();
  }
  ctx.restore();
}

/** Scale bar for the current map view. mPerPx = metres per canvas pixel at the frame centre. */
export function drawScaleBar(ctx, frame, unit, sb, mPerPx) {
  if (!sb?.on || !(mPerPx > 0) || !Number.isFinite(mPerPx)) return;
  const imperial = sb.units === 'imperial';
  const maxPx = 150 * unit;
  const per = imperial ? mPerPx / 0.3048 : mPerPx; // feet or metres per px
  let maxUnits = maxPx * per;
  let bigUnit = imperial ? 5280 : 1000;
  let label = imperial ? 'mi' : 'km', small = imperial ? 'ft' : 'm';
  const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
  let val, txt;
  if (maxUnits >= bigUnit) { val = nice(maxUnits / bigUnit) * bigUnit; txt = `${val / bigUnit} ${label}`; }
  else { val = nice(maxUnits); txt = `${val} ${small}`; }
  const len = val / per;
  const h = 6 * unit, pad = 8 * unit;
  ctx.save();
  ctx.font = `600 ${11 * unit}px ${UI}`;
  const tw = ctx.measureText(txt).width;
  const W = Math.max(len, tw) + pad * 2, H = h + 24 * unit;
  const [x, y] = corner(frame, sb.position || 'bottom-left', W, H, 20 * unit);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, W, H, 6 * unit); else ctx.rect(x, y, W, H);
  ctx.fill();
  const bx = x + pad, by = y + H - pad - h;
  ctx.fillStyle = '#16181d';
  ctx.fillRect(bx, by, len / 2, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + len / 2, by, len / 2, h);
  ctx.strokeStyle = '#16181d'; ctx.lineWidth = 1.2 * unit;
  ctx.strokeRect(bx, by, len, h);
  ctx.fillStyle = '#16181d';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(txt, bx, by - 4 * unit);
  ctx.restore();
}

/** Metres per CSS pixel at a latitude and zoom (512-px tiles). */
export function metresPerPixel(lat, zoom) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}
