// Draws a scene (route line, travel symbol, signs, compass, editing handles) on a 2D canvas over the map.
import { sampleAt } from './geo.js';
import { drawSign } from './signs.js';
import { drawLayers, layerHandles } from './layers.js';

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

function strokeLeg(ctx, proj, coords, color, style, w, outline) {
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

function drawSymbol(ctx, look, L, x, y, heading, unit) {
  const color = L.color;
  const kind = look.symbol === 'auto' || !look.symbol ? (L.mode.icon ? 'icon' : 'arrow') : look.symbol;
  const size = (+look.symbolSize || 1);
  const w = (+look.lineWidth || 5) * unit;
  if (kind === 'none') return;
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

/** On-screen captions (drawn last, above lens effects). */
export function renderCaptions(ctx, o) {
  const proj = projector(o.map, o.px, o.ox || 0, o.oy || 0);
  drawLayers(ctx, { scene: o.scene, proj, unit: o.unit, time: o.time, frame: o.frame, tokens: tokensAt(o.model, o.time) }, 'captions');
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
  const lo = { scene, proj, unit, time, frame: o.frame, tokens };
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
    strokeLeg(ctx, proj, coords, L.color, L.style, active ? w * 1.15 : w, look.outline !== false);
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
      drawSymbol(ctx, look, st.L, ...proj(st.point), st.heading - map.getBearing(), unit);
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
  if (look.compass && o.frame) drawCompass(ctx, o.frame, map.getBearing(), unit);
  return out;
}
