// Rings that cross the 180° line (Russia, Alaska, Fiji …) jump from +180 to −180; drawn as-is they make a band
// across the whole map. unwrapRing() makes a ring continuous; a ring that then sticks out past ±180 is drawn a second
// time shifted one world over, so both halves show in the right place.
const cache = new WeakMap();
export function unwrapRing(ring) {
  let u = cache.get(ring);
  if (u) return u;
  let jump = false;
  for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { jump = true; break; }
  if (!jump) u = { ring, shift: 0 };
  else {
    const out = [[ring[0][0], ring[0][1]]]; let off = 0;
    for (let i = 1; i < ring.length; i++) {
      const d = ring[i][0] - ring[i - 1][0];
      if (d > 180) off -= 360; else if (d < -180) off += 360;
      out.push([ring[i][0] + off, ring[i][1]]);
    }
    let mn = Infinity, mx = -Infinity; for (const p of out) { if (p[0] < mn) mn = p[0]; if (p[0] > mx) mx = p[0]; }
    // a ring that goes all the way round the globe (Antarctica, polar caps) does not come back to its start:
    // close it over the pole instead of across the map
    if (Math.abs(out[out.length - 1][0] - out[0][0]) > 180) {
      const pole = out.reduce((a, p) => a + p[1], 0) / out.length > 0 ? 85.06 : -85.06, a = out[out.length - 1][0], b = out[0][0];
      out.push([a, pole], [b, pole]);
    }
    u = { ring: out, shift: mx > 180 ? -360 : mn < -180 ? 360 : 0 };
  }
  cache.set(ring, u);
  return u;
}
// The map wraps every longitude to the world copy nearest the view's centre, so a country more than half a world
// away from the centre gets parts pulled to the other side. We undo that on screen: one world is worldPx() wide, and
// any step larger than half of it is a wrap, not a real edge.
const worldCache = new WeakMap();
function worldOf(proj) {
  let w = worldCache.get(proj);
  if (!w) {
    // project every 10° of longitude: most steps are W/36; the one step that crosses the wrap is not
    const xs = []; for (let lon = -180; lon < 180; lon += 10) xs.push(proj([lon, 0])[0]);
    const steps = []; for (let i = 1; i < xs.length; i++) if (isFinite(xs[i]) && isFinite(xs[i - 1])) steps.push(xs[i] - xs[i - 1]);
    steps.sort((a, b) => a - b);
    const W = steps.length ? Math.abs(steps[steps.length >> 1]) * 36 : 0;
    // the copy the map draws: every longitude lands within half a world of the view's centre
    let mn = Infinity, mx = -Infinity;
    if (W) for (const x of xs) if (isFinite(x)) { if (x < mn) mn = x; if (x > mx) mx = x; }
    w = { W, c: isFinite(mn) ? (mn + mx) / 2 : 0 };
    worldCache.set(proj, w);
  }
  return w;
}
const worldPx = (proj) => worldOf(proj).W;
function screenRing(ring, proj) {
  const W = worldPx(proj), out = []; let off = 0, prev = null, jumped = false;
  for (const ll of ring) {
    const q = proj(ll); let x = q[0] + off;
    if (prev && W > 0) { while (x - prev[0] > W / 2) { off -= W; x -= W; jumped = true; } while (prev[0] - x > W / 2) { off += W; x += W; jumped = true; } }
    prev = [x, q[1]]; out.push(prev);
  }
  return { pts: out, W, jumped };
}
/** Add one ring to the current path (ctx or Path2D), safely across the 180° line and the map's world copies. */
export function traceRing(path, ring, proj, close = true) {
  const u = unwrapRing(ring);
  const { pts, W, jumped } = screenRing(u.ring, proj);
  const one = (dx) => { pts.forEach((q, i) => (i ? path.lineTo(q[0] + dx, q[1]) : path.moveTo(q[0] + dx, q[1]))); if (close) path.closePath(); };
  if (!(W > 0)) { one(0); return; }
  // what is visible: the canvas (when drawing straight on it), else the one world around the view's centre
  let lo, hi;
  const cv = path.canvas, T = cv && path.getTransform?.();
  if (T && T.a) { lo = (0 - T.e) / T.a; hi = (cv.width - T.e) / T.a; }
  else { const { c } = worldOf(proj); lo = c - W / 2; hi = c + W / 2; }
  if (!jumped && !u.shift && hi - lo <= W * 0.98) { one(0); return; } // the usual case: one copy, nothing to fix
  let mn = Infinity, mx = -Infinity; for (const q of pts) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
  // every world copy of the ring that shows — the map repeats the world when you zoom far out
  const k0 = Math.floor((lo - mx) / W), k1 = Math.ceil((hi - mn) / W);
  let any = false;
  for (let k = Math.max(k0, -4); k <= Math.min(k1, 4); k++) if (mx + k * W > lo && mn + k * W < hi) { one(k * W); any = true; }
  if (!any) one(0);
}
/** Open lines (borders, rivers, tracks): lift the pen where they jump across the 180° line or a world copy. */
export function traceLine(path, line, proj) {
  const W = worldPx(proj); let prev = null;
  line.forEach((ll, i) => { const q = proj(ll); if (!i || (prev && (Math.abs(ll[0] - prev[0]) > 180 || (W > 0 && Math.abs(q[0] - prev[2]) > W / 2)))) path.moveTo(q[0], q[1]); else path.lineTo(q[0], q[1]); prev = [ll[0], ll[1], q[0]]; });
}
