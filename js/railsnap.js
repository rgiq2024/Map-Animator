// Railway snapping: find railway lines near a point (OpenStreetMap / Overpass) and lay a track along them.
export async function fetchRailways([lng, lat], radius = 2500) {
  const q = `[out:json][timeout:20];way(around:${radius},${lat},${lng})[railway~"^(rail|light_rail|narrow_gauge|subway)$"];out geom;`;
  const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('railway lookup failed');
  const j = await r.json();
  return (j.elements || []).filter((e) => e.geometry?.length > 1).map((e) => e.geometry.map((g) => [g.lon, g.lat]));
}
/**
 * Lay a track of total length 2·half (metres) along the railway nearest to `mid`.
 * Returns { path, meetAt, dist } or null.
 */
export function trackAlongRail(lines, mid, half) {
  const kx = 111320 * Math.cos(mid[1] * Math.PI / 180), ky = 110540;
  const M = (p) => [(p[0] - mid[0]) * kx, (p[1] - mid[1]) * ky];
  let best = null;
  for (const ln of lines) for (let i = 1; i < ln.length; i++) {
    const a = M(ln[i - 1]), b = M(ln[i]);
    const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, -(a[0] * ex + a[1] * ey) / l2));
    const px = a[0] + ex * t, py = a[1] + ey * t, d = Math.hypot(px, py);
    if (!best || d < best.d) best = { d, ln, i, p: [px, py] };
  }
  if (!best) return null;
  const pts = best.ln.map(M);
  const walk = (dir) => {
    const out = []; let left = half, cur = best.p, j = dir > 0 ? best.i : best.i - 1;
    while (left > 0 && j >= 0 && j < pts.length) {
      const nx = pts[j], seg = Math.hypot(nx[0] - cur[0], nx[1] - cur[1]);
      if (seg >= left) { const f = left / (seg || 1); out.push([cur[0] + (nx[0] - cur[0]) * f, cur[1] + (nx[1] - cur[1]) * f]); break; }
      out.push(nx); left -= seg; cur = nx; j += dir;
    }
    return out;
  };
  const fwd = walk(1), back = walk(-1).reverse();
  const xy = [...back, best.p, ...fwd];
  if (xy.length < 2) return null;
  let tot = 0, at = 0;
  for (let i = 1; i < xy.length; i++) { tot += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); if (i === back.length) at = tot; }
  const path = xy.map(([x, y]) => [+(mid[0] + x / kx).toFixed(7), +(mid[1] + y / ky).toFixed(7)]);
  return { path, meetAt: +Math.min(0.95, Math.max(0.05, at / (tot || 1))).toFixed(3), dist: best.d, centre: path[back.length] };
}
