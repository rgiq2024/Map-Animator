// Live satellite imagery and weather radar as cross-fading map layers: NASA GIBS (GOES-East/West,
// Himawari, VIIRS), EUMETSAT (Meteosat 0° and Indian Ocean), RainViewer radar, or any WMS you paste.
// Also "live weather now" for the cities visible on the map (Open-Meteo).

export const SAT_PRODUCTS = {
  meteosat_iodc_ir: { name: 'Meteosat IODC · infrared (Indian Ocean, Arabia, India)', src: 'eumetsat', layer: 'msg_iodc:ir108', step: 15, latency: 30 },
  meteosat_iodc_vis: { name: 'Meteosat IODC · natural colour (day)', src: 'eumetsat', layer: 'msg_iodc:rgb_naturalenhncd', step: 15, latency: 30 },
  meteosat_ir: { name: 'Meteosat 0° · infrared (Europe, Africa, Middle East)', src: 'eumetsat', layer: 'msg_fes:ir108', step: 15, latency: 30 },
  meteosat_vis: { name: 'Meteosat 0° · natural colour (day)', src: 'eumetsat', layer: 'msg_fes:rgb_naturalenhncd', step: 15, latency: 30 },
  goes_east_geocolor: { name: 'GOES-East · GeoColor (Americas, Atlantic)', src: 'gibs', layer: 'GOES-East_ABI_GeoColor', step: 10, latency: 40 },
  goes_east_ir: { name: 'GOES-East · infrared', src: 'gibs', layer: 'GOES-East_ABI_Band13_Clean_Infrared', step: 10, latency: 40 },
  goes_west_geocolor: { name: 'GOES-West · GeoColor (Pacific, west Americas)', src: 'gibs', layer: 'GOES-West_ABI_GeoColor', step: 10, latency: 40 },
  goes_west_ir: { name: 'GOES-West · infrared', src: 'gibs', layer: 'GOES-West_ABI_Band13_Clean_Infrared', step: 10, latency: 40 },
  himawari_ir: { name: 'Himawari · infrared (Asia, Australia, Pacific)', src: 'gibs', layer: 'Himawari_AHI_Band13_Clean_Infrared', step: 10, latency: 40 },
  himawari_vis: { name: 'Himawari · visible (day)', src: 'gibs', layer: 'Himawari_AHI_Band3_Red_Visible_1km', step: 10, latency: 40 },
  viirs: { name: 'NASA VIIRS true colour (daily, whole Earth)', src: 'gibs', layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', daily: true },
  radar: { name: 'Weather radar (RainViewer, last 2 hours)', src: 'rainviewer' },
  custom: { name: 'Your own WMS layer…', src: 'wms' },
};
/** A sensible satellite for a longitude. */
export function satForLongitude(lng) {
  if (lng < -105) return 'goes_west_geocolor';
  if (lng < -25) return 'goes_east_geocolor';
  if (lng < 40) return 'meteosat_ir';
  if (lng < 95) return 'meteosat_iodc_ir';
  return 'himawari_ir';
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d, daily) => (daily ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`);
function wmsUrl(base, layer, time, v13 = true) {
  const q = v13
    ? `SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(layer)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256`
    : `SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${encodeURIComponent(layer)}&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256`;
  return `${base}${base.includes('?') ? '&' : '?'}${q}${time ? `&TIME=${time}` : ''}`;
}
/**
 * Frames for a product: { url, label, date }. opts: { mode: 'latest' | 'loop', hours, step (min), end (Date), wmsUrl, wmsLayer }.
 */
export async function satFrames(key, opts = {}) {
  const p = SAT_PRODUCTS[key] || SAT_PRODUCTS.meteosat_ir;
  if (p.src === 'rainviewer') {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!r.ok) throw new Error('Radar list unavailable');
    const j = await r.json();
    let past = j.radar?.past || [];
    if (opts.mode === 'latest') past = past.slice(-1);
    return past.map((f) => { const d = new Date(f.time * 1000); return { url: `${j.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, date: iso(d), label: label(d), maxzoom: 7 }; });
  }
  const base = p.src === 'gibs' ? 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi' : p.src === 'eumetsat' ? 'https://view.eumetsat.int/geoserver/wms' : String(opts.wmsUrl || '').trim();
  const layer = p.src === 'wms' ? String(opts.wmsLayer || '').trim() : p.layer;
  if (!base || !layer) throw new Error('Enter the WMS address and layer name');
  const v13 = p.src !== 'gibs';
  if (p.daily) {
    const n = opts.mode === 'latest' ? 1 : Math.max(1, Math.min(30, Math.round((+opts.hours || 72) / 24)));
    const end = new Date(opts.end || Date.now() - 24 * 3600e3);
    end.setUTCHours(0, 0, 0, 0);
    const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(end.getTime() - i * 86400e3); out.push({ url: wmsUrl(base, layer, d.toISOString().slice(0, 10), v13), date: d.toISOString().slice(0, 10), label: label(d, true) }); }
    return out;
  }
  if (opts.mode === 'latest' && !opts.end) return [{ url: wmsUrl(base, layer, '', v13), date: 'latest', label: 'LIVE' }];
  const step = Math.max(5, +opts.step || p.step || 15);
  const end = new Date(opts.end || Date.now() - (p.latency || 30) * 60e3);
  end.setUTCSeconds(0, 0);
  end.setUTCMinutes(Math.floor(end.getUTCMinutes() / step) * step);
  const n = opts.mode === 'latest' ? 1 : Math.max(2, Math.min(48, Math.round(((+opts.hours || 3) * 60) / step) + 1));
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(end.getTime() - i * step * 60e3); out.push({ url: wmsUrl(base, layer, iso(d), v13), date: iso(d), label: label(d) }); }
  return out;
}
export const SAT_CREDITS = { gibs: 'NASA GIBS / NOAA', eumetsat: '© EUMETSAT', rainviewer: 'RainViewer', wms: '' };

// ---------------------------------------------------------------- live weather for the cities on the map
const WMO = (c, day) => {
  if (c === 0) return day ? 'sunny' : 'night';
  if (c <= 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 67) return c >= 61 ? 'rain' : 'showers';
  if (c >= 71 && c <= 77) return 'snow';
  if (c >= 80 && c <= 82) return 'showers';
  if (c >= 85 && c <= 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'partly';
};
/** Cities currently labelled on the map inside a screen box (from the base map's place labels). */
export function visibleCities(map, box, max = 8) {
  let feats = [];
  try { feats = map.queryRenderedFeatures([[box.x, box.y], [box.x + box.w, box.y + box.h]]); } catch { feats = []; }
  const seen = new Set();
  const out = [];
  for (const f of feats) {
    if (f.layer?.type !== 'symbol' || f.sourceLayer !== 'place' || f.geometry?.type !== 'Point') continue;
    const cls = f.properties?.class;
    if (!['city', 'town', 'capital'].includes(cls) && !f.properties?.capital) continue;
    const name = f.properties['name:en'] || f.properties['name:latin'] || f.properties.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, ll: f.geometry.coordinates, rank: (f.properties.capital ? -5 : 0) + (cls === 'city' ? 0 : 5) + (+f.properties.rank || 10) });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.slice(0, max);
}
/** Current weather for places: [{ temp, icon, wind, code }]. */
export async function liveWeather(places) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${places.map((p) => p.ll[1].toFixed(3)).join(',')}&longitude=${places.map((p) => p.ll[0].toFixed(3)).join(',')}&current=temperature_2m,weather_code,is_day,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=5&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Weather unavailable');
  let j = await r.json();
  if (!Array.isArray(j)) j = [j];
  return j.map((d) => ({
    temp: Math.round(d.current?.temperature_2m ?? 0), icon: WMO(d.current?.weather_code ?? 0, d.current?.is_day !== 0), wind: Math.round(d.current?.wind_speed_10m ?? 0), hum: Math.round(d.current?.relative_humidity_2m ?? 0),
    days: (d.daily?.time || []).map((t, i) => ({ day: new Date(`${t}T12:00:00`).toLocaleDateString('en', { weekday: 'short' }), icon: WMO(d.daily.weather_code[i], true), hi: Math.round(d.daily.temperature_2m_max[i]), lo: Math.round(d.daily.temperature_2m_min[i]) })),
  }));
}
