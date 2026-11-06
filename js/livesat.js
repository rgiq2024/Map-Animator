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
  nexrad_past: { name: 'NEXRAD radar (USA) · any past date, 5-minute steps (Iowa Environmental Mesonet)', src: 'iem', minutes: 5 },
  // Sentinel (Copernicus) — by date
  s2_true: { name: 'Sentinel-2 · natural colour by date (Esri, no account)', src: 'esri_s2', rule: 'Natural Color with DRA', sentinel: 2 },
  s2_cir: { name: 'Sentinel-2 · colour infrared (vegetation red)', src: 'esri_s2', rule: 'Color Infrared with DRA', sentinel: 2 },
  s2_swir: { name: 'Sentinel-2 · short-wave infrared (burn scars, wet ground)', src: 'esri_s2', rule: 'SWIR with DRA', sentinel: 2 },
  s2_agri: { name: 'Sentinel-2 · agriculture', src: 'esri_s2', rule: 'Agriculture with DRA', sentinel: 2 },
  s2_ndvi: { name: 'Sentinel-2 · NDVI (vegetation health)', src: 'esri_s2', rule: 'NDVI Colorized', sentinel: 2 },
  s2_bathy: { name: 'Sentinel-2 · bathymetric (shallow water, slicks)', src: 'esri_s2', rule: 'Bathymetric with DRA', sentinel: 2 },
  s1_esri: { name: 'Sentinel-1 · radar VV (Esri; oil slicks show dark)', src: 'esri_s1', sentinel: 1 },
  s2_cloudless: { name: 'Sentinel-2 cloudless · one mosaic per year (EOX)', src: 'eox', sentinel: 2 },
  cdse_s1: { name: 'Copernicus Browser · Sentinel-1 (your free instance ID)', src: 'cdse', sentinel: 1, defLayer: 'IW_VV' },
  cdse_s2: { name: 'Copernicus Browser · Sentinel-2 (your free instance ID)', src: 'cdse', sentinel: 2, defLayer: 'TRUE_COLOR' },
};
/** True for the Sentinel products (picked by days, not minutes). */
export const isSentinel = (key) => !!SAT_PRODUCTS[key]?.sentinel;
const ESRI_S2 = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer';
const ESRI_S1 = 'https://sentinel1.imagery1.arcgis.com/arcgis/rest/services/Sentinel1RTC/ImageServer';
const EOX_YEARS = [2016, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
function esriUrl(base, t0, t1, rule) {
  let u = `${base}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=true&f=image&time=${t0},${t1}`;
  if (rule) u += `&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction: rule }))}`;
  return u;
}
/** Sentinel frames: one image per step of days, each the best (least cloudy / latest) scene inside its window. */
function sentinelFrames(p, opts) {
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dl = (d) => `${d.getUTCDate()} ${MON3[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (p.src === 'eox') {
    const from = +opts.yearFrom || 2018, to = +opts.yearTo || 2024;
    return EOX_YEARS.filter((y) => y >= from && y <= to).map((y) => ({ url: `https://tiles.maps.eox.at/wmts/1.0.0/${y === 2016 ? 's2cloudless' : `s2cloudless-${y}`}_3857/default/g/{z}/{y}/{x}.jpg`, date: String(y), label: String(y), maxzoom: 15 }));
  }
  const every = Math.max(1, +opts.every || (p.sentinel === 1 ? 12 : 5));
  const win = Math.max(every, +opts.window || every);
  const n = opts.mode === 'latest' ? 1 : Math.max(1, Math.min(24, +opts.count || 4));
  const end = new Date(opts.end || Date.now());
  end.setUTCHours(23, 59, 59, 0);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d1 = new Date(end.getTime() - i * every * 86400e3), d0 = new Date(d1.getTime() - win * 86400e3);
    let url;
    if (p.src === 'esri_s2') url = esriUrl(ESRI_S2, d0.getTime(), d1.getTime(), p.rule);
    else if (p.src === 'esri_s1') url = esriUrl(ESRI_S1, d0.getTime(), d1.getTime(), '');
    else {
      const id = String(opts.wmsUrl || '').trim().replace(/^.*\/wms\//, '');
      if (!id) throw new Error('Paste your Copernicus instance ID (Copernicus Browser → Dashboard → Configurations)');
      const layer = String(opts.wmsLayer || p.defLayer || '').trim();
      const base = `https://sh.dataspace.copernicus.eu/ogc/wms/${encodeURIComponent(id)}?SHOWLOGO=false${p.sentinel === 2 ? '&MAXCC=40' : ''}`;
      url = wmsUrl(base, layer, `${d0.toISOString().slice(0, 10)}/${d1.toISOString().slice(0, 10)}`, true);
    }
    out.push({ url, date: d1.toISOString().slice(0, 10), label: dl(d1), maxzoom: p.sentinel === 1 ? 14 : 15 });
  }
  return out;
}
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
  if (p.sentinel) return sentinelFrames(p, opts);
  if (p.src === 'iem') {
    // US composite base reflectivity, archived every 5 minutes (WMS with TIME)
    const step = Math.max(5, Math.round((+opts.step || 5) / 5) * 5);
    const n = opts.mode === 'latest' ? 1 : Math.max(1, Math.min(48, Math.round(((+opts.hours || 1) * 60) / step)));
    const end = new Date(opts.end || Date.now() - 10 * 60e3);
    end.setUTCSeconds(0, 0); end.setUTCMinutes(Math.floor(end.getUTCMinutes() / 5) * 5);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * step * 60e3);
      const iso = d.toISOString().slice(0, 16) + ':00Z';
      out.push({ url: wmsUrl('https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q-t.cgi', 'nexrad-n0q-wmst', iso, false), date: iso, label: `${iso.slice(11, 16)} UTC`, maxzoom: 10 });
    }
    return out;
  }
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
export const SAT_CREDITS = { gibs: 'NASA GIBS / NOAA', eumetsat: '© EUMETSAT', rainviewer: 'RainViewer', wms: '', esri_s2: 'Contains modified Copernicus Sentinel data · Esri', esri_s1: 'Contains modified Copernicus Sentinel data · Esri', eox: 'Sentinel-2 cloudless by EOX (Copernicus Sentinel data)', cdse: 'Contains modified Copernicus Sentinel data · Copernicus Data Space', iem: 'NOAA NEXRAD via Iowa Environmental Mesonet' };

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

/** Copernicus Sentinel Hub tile URL for exactly one acquisition day (from a real scene in the catalogue). */
export function cdseDayFrame(key, opts, day) {
  const p = SAT_PRODUCTS[key];
  const id = String(opts.wmsUrl || '').trim().replace(/^.*\/wms\//, '');
  if (!id) throw new Error('Paste your Copernicus instance ID first');
  const layer = String(opts.wmsLayer || p.defLayer || '').trim();
  const base = `https://sh.dataspace.copernicus.eu/ogc/wms/${encodeURIComponent(id)}?SHOWLOGO=false`;
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(`${day}T12:00:00Z`);
  return { url: wmsUrl(base, layer, `${day}/${day}`, true), date: day, label: `${d.getUTCDate()} ${MON3[d.getUTCMonth()]} ${d.getUTCFullYear()}`, maxzoom: p.sentinel === 1 ? 14 : 15 };
}
