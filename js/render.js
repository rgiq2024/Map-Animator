// Draws the route, stops, traveller, signs and title on a 2D canvas over the map.
import { easeInOut } from './timeline.js';

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const UI_FONT = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (u) => { u = clamp(u, 0, 1); const c = 1.70158; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Creates a projector that maps [lng,lat] to canvas pixels, handling world wrap. */
function projector(map, scale) {
  const c = map.getCenter().lng;
  const worldPx = 512 * 2 ** map.getZoom() * scale;
  const fn = ([lng, lat]) => {
    const l = lng + 360 * Math.round((c - lng) / 360);
    const p = map.project([l, lat]);
    return [p.x * scale, p.y * scale];
  };
  fn.worldPx = worldPx;
  return fn;
}

function tracePath(ctx, proj, coords) {
  let prev = null;
  ctx.beginPath();
  for (const c of coords) {
    const p = proj(c);
    if (!prev || Math.abs(p[0] - prev[0]) > proj.worldPx / 2) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
    prev = p;
  }
}

function strokeRoute(ctx, proj, coords, color, width, scale) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  tracePath(ctx, proj, coords);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = (width + 3.5) * scale;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * scale;
  ctx.stroke();
}

function signColors(style, accent) {
  if (style === 'dark') return { bg: 'rgba(24,26,31,0.94)', fg: '#ffffff', sub: 'rgba(255,255,255,0.7)' };
  if (style === 'color') return { bg: accent, fg: '#ffffff', sub: 'rgba(255,255,255,0.85)' };
  return { bg: 'rgba(255,255,255,0.97)', fg: '#16181d', sub: '#5b616e' };
}

function drawSign(ctx, x, y, text, alpha, pop, scale, colors, offset) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${17 * scale}px ${UI_FONT}`;
  const tw = ctx.measureText(text).width;
  const padX = 13 * scale, h = 36 * scale, tip = 8 * scale;
  const w = tw + padX * 2;
  const by = y - offset - tip - h;
  ctx.translate(x, y - offset);
  ctx.scale(pop, pop);
  ctx.translate(-x, -(y - offset));
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 12 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.fillStyle = colors.bg;
  roundRect(ctx, x - w / 2, by, w, h, 10 * scale);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - tip, by + h - 1);
  ctx.lineTo(x, by + h + tip);
  ctx.lineTo(x + tip, by + h - 1);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colors.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, by + h / 2 + 1 * scale);
  ctx.restore();
}

function drawStopDot(ctx, x, y, color, visited, scale, width) {
  const r = (Math.max(5, width * 0.9) + 1.5) * scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = visited ? color : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = visited ? '#ffffff' : color;
  ctx.stroke();
  return r;
}

function drawTraveller(ctx, x, y, icon, color, scale) {
  const r = 19 * scale;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10 * scale;
  ctx.shadowOffsetY = 2 * scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3.5 * scale;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = `${20 * scale}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y + 1.5 * scale);
  ctx.restore();
}

function drawTitle(ctx, project, alpha, scale, colors) {
  if (!project.title || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const m = 28 * scale;
  ctx.font = `800 ${32 * scale}px ${UI_FONT}`;
  const tw = ctx.measureText(project.title).width;
  ctx.font = `500 ${17 * scale}px ${UI_FONT}`;
  const sw = project.subtitle ? ctx.measureText(project.subtitle).width : 0;
  const padX = 20 * scale, padY = 15 * scale;
  const w = Math.max(tw, sw) + padX * 2;
  const h = padY * 2 + 36 * scale + (project.subtitle ? 24 * scale : 0);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 16 * scale;
  ctx.shadowOffsetY = 4 * scale;
  ctx.fillStyle = colors.bg;
  roundRect(ctx, m, m, w, h, 14 * scale);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = colors.fg;
  ctx.font = `800 ${32 * scale}px ${UI_FONT}`;
  ctx.fillText(project.title, m + padX, m + padY);
  if (project.subtitle) {
    ctx.fillStyle = colors.sub;
    ctx.font = `500 ${17 * scale}px ${UI_FONT}`;
    ctx.fillText(project.subtitle, m + padX, m + padY + 40 * scale);
  }
  ctx.restore();
}

export function drawAttribution(ctx, text, scale, w, h) {
  if (!text) return;
  ctx.save();
  ctx.font = `500 ${10 * scale}px ${UI_FONT}`;
  const tw = ctx.measureText(text).width;
  const pad = 5 * scale;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  roundRect(ctx, w - tw - pad * 2 - 6 * scale, h - 20 * scale - 6 * scale, tw + pad * 2, 20 * scale, 5 * scale);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w - tw - pad - 6 * scale, h - 16 * scale);
  ctx.restore();
}

/**
 * Draw one frame of overlay.
 * @param ctx 2D context (already cleared / containing the map image)
 * @param map MapLibre map (camera already positioned)
 * @param project project
 * @param tl timeline
 * @param time seconds, or null for edit mode (whole route, no traveller)
 * @param scale canvas pixels per CSS pixel
 */
export function drawOverlay(ctx, map, project, tl, time, scale) {
  const s = project.settings;
  const color = s.lineColor || '#e8553f';
  const width = +s.lineWidth || 5;
  const proj = projector(map, scale);
  const colors = signColors(s.signStyle, color);
  const edit = time == null;
  const st = edit ? null : tl.stateAt(time);

  // Upcoming (dashed) route
  if (s.showUpcoming || edit) {
    ctx.save();
    ctx.setLineDash([width * 1.6 * scale, width * 1.6 * scale]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = hexToRgba(color, edit ? 0.55 : 0.4);
    ctx.lineWidth = Math.max(2, width * 0.65) * scale;
    for (const L of tl.legs) {
      if (L.hidden) continue;
      if (!edit && L.i < st.legIndex) continue;
      tracePath(ctx, proj, L.coords);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Travelled route
  if (!edit) {
    for (const L of tl.legs) {
      if (L.hidden || L.i > st.legIndex) continue;
      if (L.i < st.legIndex) strokeRoute(ctx, proj, L.coords, color, width, scale);
      else if (st.f > 0) {
        const part = L.coords.slice(0, st.index + 1);
        part.push(st.point);
        strokeRoute(ctx, proj, part, color, width, scale);
      }
    }
  }

  // Stops
  const stopRadius = [];
  tl.stopsLL.forEach((ll, j) => {
    const [x, y] = proj(ll);
    stopRadius[j] = drawStopDot(ctx, x, y, color, edit || j <= st.reached, scale, width);
  });

  // Signs
  const signMode = s.signs || 'current';
  if (signMode !== 'none') {
    tl.stopsLL.forEach((ll, j) => {
      const stop = project.stops[j];
      if (!stop || stop.hideSign) return;
      const text = stop.label || stop.name;
      const [x, y] = proj(ll);
      const off = (edit ? stopRadius[j] : Math.max(stopRadius[j], 19 * scale)) + 4 * scale;
      if (edit) { drawSign(ctx, x, y, text, 0.95, 0.82, scale, colors, off); return; }
      if (j > st.reached) return;
      const appear = tl.stopTimes[j] ?? 0;
      const a = clamp((time - appear) / 0.35, 0, 1);
      let alpha = a, pop = j === 0 && appear === 0 ? 1 : easeOutBack((time - appear) / 0.45);
      if (signMode === 'current' && j < st.reached) {
        const nextAppear = tl.stopTimes[st.reached] ?? 0;
        alpha = 1 - clamp((time - nextAppear) / 0.4, 0, 1);
        pop = 1;
      }
      drawSign(ctx, x, y, text, alpha, Math.max(0.01, pop), scale, colors, off);
    });
  }

  // Traveller
  if (!edit && s.showIcon !== false && tl.legs.length) {
    const L = tl.legs[st.legIndex];
    const [x, y] = proj(st.point);
    let alpha = 1;
    if (st.seg.type === 'outro') alpha = 1 - easeInOut((time - st.seg.start) / Math.max(0.3, st.seg.dur * 0.5));
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawTraveller(ctx, x, y, L.icon, color, scale);
      ctx.restore();
    }
  }

  // Title card
  if (s.showTitle) drawTitle(ctx, project, edit ? 1 : st.titleAlpha, scale, colors);
}
