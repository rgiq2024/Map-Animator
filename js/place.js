// Free placement of on-screen elements (captions, charts, flicker / HUD text, labels of image layers).
// When style.position === 'custom', style.pos = {x, y} is the element's centre as a fraction of the frame.
// Every placeable element reports its box so the editor can let you drag it anywhere.
let sink = null;
export const setBoxSink = (arr) => { sink = arr; };

/**
 * Move the default box (x, y, w, h) to the custom position if set. Translates ctx (caller saves/restores).
 * Returns [dx, dy].
 */
export function placeAt(ctx, L, frame, x, y, w, h, opts = {}) {
  const s = L.style || {};
  let dx = 0, dy = 0;
  if (s.position === 'custom' && s.pos && frame) {
    if (!opts.lockX) dx = frame.x + s.pos.x * frame.w - (x + w / 2);
    if (!opts.lockY) dy = frame.y + s.pos.y * frame.h - (y + h / 2);
    ctx.translate(dx, dy);
  }
  if (sink) sink.push({ id: L.id, x: x + dx, y: y + dy, w, h, lockX: !!opts.lockX, lockY: !!opts.lockY });
  return [dx, dy];
}
export const CUSTOM_POS = { custom: 'Anywhere (drag it on the video)' };
