// Map themes: recolourings of the OpenFreeMap "Liberty" vector style, plus satellite.
// Every theme is generated from one base style so all of them share the same data and labels.

const LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const SAT_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];

// Palette keys: land water waterLine wood grass park urban sand ice building motorway roadMajor roadMid roadMinor
// casing rail border stateBorder label halo waterLabel line (suggested route colour) shade (hillshade) dark (UI hint)
const P = (o) => o;
export const THEMES = {
  classic: { name: 'Classic', desc: 'Colourful, with terrain shading', base: true, shade: { shadow: '#5c5a4f', highlight: '#ffffff', accent: '#8a8a7a', strength: 0.35 }, line: '#ff4a2b', swatch: ['#f6f1e7', '#a9d3ee', '#ff4a2b'] },
  offroad: {
    name: 'Offroad', desc: 'Tracks and trails stand out, strong relief', line: '#ff4a2b', trails: true,
    pal: P({ land: '#efe8d8', water: '#9cc8e4', waterLine: '#7db3d6', wood: '#c6d8a8', grass: '#dfe6c0', park: '#cfe0b0', urban: '#e6ddd0', sand: '#efe2bd', ice: '#f7fbff', building: '#d8cdbd', motorway: '#e9a35a', roadMajor: '#f1c27a', roadMid: '#fbe2a6', roadMinor: '#ffffff', casing: '#b8a68a', rail: '#9a8f80', border: '#8f6b8f', stateBorder: '#b49ab4', label: '#3d3427', halo: '#f7f2e6', waterLabel: '#3f6f94' }),
    shade: { shadow: '#4d4636', highlight: '#fffaf0', accent: '#7a6e55', strength: 0.55 }, swatch: ['#efe8d8', '#c6d8a8', '#e9a35a'],
  },
  light: {
    name: 'Light', desc: 'Quiet greys that let your line shine', line: '#ff4a2b',
    pal: P({ land: '#f7f7f5', water: '#d3dde3', waterLine: '#c4d1d9', wood: '#ecefe8', grass: '#f0f2ec', park: '#e9eee4', urban: '#f0efed', sand: '#f3f1ea', ice: '#fbfcfd', building: '#e4e3e0', motorway: '#ffffff', roadMajor: '#ffffff', roadMid: '#ffffff', roadMinor: '#ffffff', casing: '#dcdcd8', rail: '#d6d6d2', border: '#b9b9b5', stateBorder: '#d0d0cc', label: '#6b6e73', halo: '#ffffff', waterLabel: '#8ea0ab' }),
    swatch: ['#f7f7f5', '#d3dde3', '#ff4a2b'],
  },
  dark: {
    name: 'Dark', desc: 'Night mode, bright line', line: '#ff6a3d', dark: true,
    pal: P({ land: '#1d2024', water: '#0f1215', waterLine: '#13171b', wood: '#20252a', grass: '#20242a', park: '#1f2428', urban: '#23272c', sand: '#25262a', ice: '#2a2e33', building: '#2a2e33', motorway: '#4a4f57', roadMajor: '#3b4047', roadMid: '#33373d', roadMinor: '#2c3035', casing: '#1a1c20', rail: '#3a3d42', border: '#5c6067', stateBorder: '#41454b', label: '#a7adb5', halo: '#14161a', waterLabel: '#5d6873' }),
    swatch: ['#1d2024', '#0f1215', '#ff6a3d'],
  },
  fiord: {
    name: 'Fiord', desc: 'Deep blue water, cool slate land', line: '#ffb347', dark: true,
    pal: P({ land: '#3b4d63', water: '#1f2d40', waterLine: '#26364b', wood: '#3a5064', grass: '#3d5268', park: '#3b5167', urban: '#44566c', sand: '#4a5a6e', ice: '#5a6c80', building: '#4b5d73', motorway: '#8fa6c0', roadMajor: '#7088a3', roadMid: '#5f7690', roadMinor: '#53697f', casing: '#2f3e51', rail: '#5c7088', border: '#9db1c8', stateBorder: '#6e849c', label: '#e3ecf5', halo: '#2b3a4d', waterLabel: '#8ca4be' }),
    shade: { shadow: '#18222f', highlight: '#7d93ad', accent: '#2a394c', strength: 0.4 }, swatch: ['#3b4d63', '#1f2d40', '#ffb347'],
  },
  nightroads: {
    name: 'Night roads', desc: 'Dark relief with glowing amber roads — great for data stories', line: '#ffb547', dark: true,
    pal: P({ land: '#131416', water: '#050607', waterLine: '#0a0b0d', wood: '#151719', grass: '#151618', park: '#16181a', urban: '#1a1b1d', sand: '#18191b', ice: '#1d1e20', building: '#202124', motorway: '#ffbf5a', roadMajor: '#f0a040', roadMid: '#c47f2c', roadMinor: '#7a5222', casing: '#131416', rail: '#4a3a24', border: '#6b6b6b', stateBorder: '#3d3d3d', label: '#8d8f93', halo: '#0e0f10', waterLabel: '#4a5258' }),
    shade: { shadow: '#000000', highlight: '#3a3c40', accent: '#0d0e10', strength: 0.6 }, swatch: ['#131416', '#050607', '#ffb547'],
  },
  satellite: { name: 'Satellite', desc: 'Esri World Imagery with optional names and roads', satellite: true, line: '#ffd23f', dark: true, swatch: ['#3f5a3a', '#1f3b5c', '#ffd23f'] },
  treasure: {
    name: 'Treasure', desc: 'Parchment and ink, like an old treasure map', line: '#b3261e',
    pal: P({ land: '#ead9b0', water: '#c9d6c2', waterLine: '#9fb39a', wood: '#d9c993', grass: '#e2d3a3', park: '#dccc96', urban: '#dfcca0', sand: '#efdfb5', ice: '#f3ead2', building: '#cfb98a', motorway: '#8a5a32', roadMajor: '#9c6d43', roadMid: '#b08458', roadMinor: '#c6a274', casing: '#ead9b0', rail: '#8a6a45', border: '#7a4a2a', stateBorder: '#a6805c', label: '#4a2e17', halo: '#efe2bf', waterLabel: '#55714f' }),
    shade: { shadow: '#6e5530', highlight: '#fff5dc', accent: '#9c7f4c', strength: 0.4 }, swatch: ['#ead9b0', '#c9d6c2', '#b3261e'],
  },
  // ---- "More" themes ----
  oldatlas: { more: true, name: 'Old Atlas', desc: 'Engraved coasts and red roads, like a 19th-century atlas', line: '#b8322a',
    pal: P({ land: '#f1e6c8', water: '#cfe0df', waterLine: '#8fb1b4', wood: '#e6dcb8', grass: '#ece2c0', park: '#e4dab4', urban: '#eadbb8', sand: '#f3e8cb', ice: '#f8f2e2', building: '#ddcca5', motorway: '#c0392b', roadMajor: '#cc5a46', roadMid: '#d98a74', roadMinor: '#e3b49e', casing: '#f1e6c8', rail: '#6d5a44', border: '#7d5f8a', stateBorder: '#b29abd', label: '#3b2e22', halo: '#f4ead0', waterLabel: '#3f6b72' }), swatch: ['#f1e6c8', '#cfe0df', '#c0392b'] },
  seachart: { more: true, name: 'Sea Chart', desc: 'Buff land, sea in depth bands and navy coastlines', line: '#d9432b', waterOutline: '#1f3a5f',
    pal: P({ land: '#efe2b8', water: '#cfe6f2', waterLine: '#1f3a5f', wood: '#e6d9ab', grass: '#ebdfb3', park: '#e6d9ab', urban: '#e8d8a8', sand: '#f2e6c0', ice: '#f8f3e2', building: '#dccb98', motorway: '#a08350', roadMajor: '#b39566', roadMid: '#c4a87c', roadMinor: '#d3bb91', casing: '#efe2b8', rail: '#8a7a5a', border: '#1f3a5f', stateBorder: '#6f86a3', label: '#1f3a5f', halo: '#f4ead0', waterLabel: '#1f3a5f' }), swatch: ['#efe2b8', '#cfe6f2', '#1f3a5f'] },
  blueprint: { more: true, name: 'Blueprint', desc: 'White lines on drafting blue, like a technical drawing', line: '#ffffff', dark: true,
    pal: P({ land: '#1d4f91', water: '#163f75', waterLine: '#a9c4e8', wood: '#1d4f91', grass: '#1d4f91', park: '#1f5296', urban: '#20559a', sand: '#1d4f91', ice: '#245aa0', building: '#2a63a8', motorway: '#e8f0fb', roadMajor: '#c9daf2', roadMid: '#9fbbe3', roadMinor: '#6f96cc', casing: '#1d4f91', rail: '#9fbbe3', border: '#ffffff', stateBorder: '#9fbbe3', label: '#eaf2fd', halo: '#1d4f91', waterLabel: '#a9c4e8' }), swatch: ['#1d4f91', '#163f75', '#ffffff'] },
  inkwash: { more: true, name: 'Ink Wash', desc: 'Brush-black ink on paper, with a red seal for countries', line: '#c0392b',
    pal: P({ land: '#f4f0e6', water: '#dcdad4', waterLine: '#2b2b2b', wood: '#e9e5da', grass: '#ede9df', park: '#e6e2d6', urban: '#ebe7dc', sand: '#f2eee4', ice: '#f8f6f0', building: '#d9d4c7', motorway: '#1e1e1e', roadMajor: '#3a3a3a', roadMid: '#6a6a6a', roadMinor: '#9a9a9a', casing: '#f4f0e6', rail: '#4a4a4a', border: '#c0392b', stateBorder: '#d98b80', label: '#1e1e1e', halo: '#f4f0e6', waterLabel: '#4a4a4a' }), swatch: ['#f4f0e6', '#2b2b2b', '#c0392b'] },
  neon: { more: true, name: 'Neon Night', desc: 'Glowing cyan and pink roads on black', line: '#ff2bd6', dark: true, glow: true,
    pal: P({ land: '#07080d', water: '#0b1020', waterLine: '#123', wood: '#0a0c12', grass: '#0a0c12', park: '#0b0e15', urban: '#0d0f16', sand: '#0b0c12', ice: '#10131b', building: '#141826', motorway: '#ff3fd8', roadMajor: '#18e0ff', roadMid: '#0fa8c4', roadMinor: '#0b5f70', casing: '#07080d', rail: '#5a2a7a', border: '#ff3fd8', stateBorder: '#6b2a63', label: '#bff6ff', halo: '#07080d', waterLabel: '#3a8ca0' }), swatch: ['#07080d', '#18e0ff', '#ff3fd8'] },
  synthwave: { more: true, name: 'Synthwave', desc: 'Purple dusk with hot pink roads and a gold motorway', line: '#ffcc33', dark: true,
    pal: P({ land: '#2a1745', water: '#170c2e', waterLine: '#3a1f63', wood: '#2d1a4a', grass: '#2d1a4a', park: '#311c50', urban: '#33204f', sand: '#2f1b4b', ice: '#3a2659', building: '#3d2860', motorway: '#ffcc33', roadMajor: '#ff4fa3', roadMid: '#d23f8e', roadMinor: '#8a3a86', casing: '#2a1745', rail: '#6a3f8f', border: '#ff7bc0', stateBorder: '#7a4a9a', label: '#ffd6f0', halo: '#2a1745', waterLabel: '#a77fd6' }), swatch: ['#2a1745', '#ff4fa3', '#ffcc33'] },
  pastel: { more: true, name: 'Pastel', desc: 'Soft pink land, mint water and lilac roads', line: '#ff6b6b',
    pal: P({ land: '#fbeef0', water: '#c9efe4', waterLine: '#a6e0d0', wood: '#f3e3ea', grass: '#f6e8ec', park: '#efe0e8', urban: '#f7e7ea', sand: '#fbf0e6', ice: '#fdf8fa', building: '#ecd9df', motorway: '#c3a6e6', roadMajor: '#d3bdee', roadMid: '#e0d0f3', roadMinor: '#ece2f7', casing: '#fbeef0', rail: '#d8c4d8', border: '#b892d8', stateBorder: '#d9c4ea', label: '#6a5a78', halo: '#fdf5f7', waterLabel: '#5aa894' }), swatch: ['#fbeef0', '#c9efe4', '#c3a6e6'] },
  desert: { more: true, name: 'Desert', desc: 'Sand and terracotta with turquoise water', line: '#2a6f97',
    pal: P({ land: '#ecd2a4', water: '#3fb5c4', waterLine: '#2e9fae', wood: '#d9c08e', grass: '#e2c995', park: '#dcc28f', urban: '#e4c79a', sand: '#f2dcb0', ice: '#f7ecd6', building: '#d4b07c', motorway: '#a5482a', roadMajor: '#bf6a43', roadMid: '#cf8a62', roadMinor: '#dcab85', casing: '#ecd2a4', rail: '#8a5a3a', border: '#8a3b22', stateBorder: '#b9805f', label: '#5a2e17', halo: '#f2dcb0', waterLabel: '#0f5f69' }),
    shade: { shadow: '#7a5530', highlight: '#fff3dc', accent: '#a97c4f', strength: 0.35 }, swatch: ['#ecd2a4', '#3fb5c4', '#a5482a'] },
  arctic: { more: true, name: 'Arctic', desc: 'Ice white and steel blue, crisp and cold', line: '#e8553f',
    pal: P({ land: '#f3f6f9', water: '#bccfdf', waterLine: '#9fb7cc', wood: '#e8eef3', grass: '#edf2f6', park: '#e6edf2', urban: '#eef2f6', sand: '#f2f4f6', ice: '#ffffff', building: '#dde5ec', motorway: '#5b7a99', roadMajor: '#7b96b0', roadMid: '#a3b7ca', roadMinor: '#c7d4e0', casing: '#f3f6f9', rail: '#8ea4ba', border: '#5b7a99', stateBorder: '#a3b7ca', label: '#3d5670', halo: '#ffffff', waterLabel: '#4f6e8c' }),
    shade: { shadow: '#6d8aa6', highlight: '#ffffff', accent: '#9fb3c6', strength: 0.3 }, swatch: ['#f3f6f9', '#bccfdf', '#5b7a99'] },
  ranger: { more: true, name: 'Ranger', desc: 'Deep forest green with cream roads, like a park map', line: '#ff7a2f', dark: true,
    pal: P({ land: '#2f4a33', water: '#1d3441', waterLine: '#284653', wood: '#2a4430', grass: '#33503a', park: '#34533a', urban: '#3a553e', sand: '#4a5a3e', ice: '#5c6e5c', building: '#405c44', motorway: '#f3e7c4', roadMajor: '#e6d8b0', roadMid: '#c9bc94', roadMinor: '#9fa07c', casing: '#2f4a33', rail: '#8a8a6a', border: '#f3e7c4', stateBorder: '#8fa07c', label: '#f3e7c4', halo: '#2a4430', waterLabel: '#8fb7c4' }),
    shade: { shadow: '#14231a', highlight: '#6f8f6f', accent: '#22382a', strength: 0.45 }, swatch: ['#2f4a33', '#1d3441', '#f3e7c4'] },
  autumn: { more: true, name: 'Autumn', desc: 'Ochre fields, rust woods and burgundy roads', line: '#1f5f8b',
    pal: P({ land: '#f1dfc0', water: '#a9c2c2', waterLine: '#8aa8a8', wood: '#d9a46a', grass: '#e8cc95', park: '#dfb47a', urban: '#ead2b0', sand: '#f2e2c2', ice: '#f7eedf', building: '#d9bb94', motorway: '#7a1f2b', roadMajor: '#933a3f', roadMid: '#b06a5f', roadMinor: '#c99a83', casing: '#f1dfc0', rail: '#6d4a3a', border: '#7a1f2b', stateBorder: '#b88a7a', label: '#4a2a1a', halo: '#f4e6cc', waterLabel: '#3f6363' }), swatch: ['#f1dfc0', '#d9a46a', '#7a1f2b'] },
  swisstopo: { more: true, name: 'Swiss Topo', desc: 'Classic topographic map: blue water, green woods, strong relief', line: '#e2231a',
    pal: P({ land: '#fbfaf3', water: '#9fd2f0', waterLine: '#3c9ad6', wood: '#bfe0a4', grass: '#e5f0cf', park: '#d4ebbd', urban: '#efe9df', sand: '#f6eed2', ice: '#ffffff', building: '#c9c1b6', motorway: '#f3a33b', roadMajor: '#fbd56b', roadMid: '#fff2b0', roadMinor: '#ffffff', casing: '#8a7f73', rail: '#3d3d3d', border: '#a64ca6', stateBorder: '#c48fc4', label: '#222222', halo: '#ffffff', waterLabel: '#1f6fa8' }),
    shade: { shadow: '#3b3f4a', highlight: '#ffffff', accent: '#6b6f7a', strength: 0.65 }, swatch: ['#fbfaf3', '#bfe0a4', '#9fd2f0'] },
  roadatlas: { more: true, name: 'Road Atlas', desc: 'Bold red and yellow roads on pale yellow, like a glovebox atlas', line: '#1d6fd6',
    pal: P({ land: '#fbf3d5', water: '#9fcbe8', waterLine: '#6fa9d6', wood: '#e4ecc0', grass: '#eef2cf', park: '#dfeab5', urban: '#f6e6c2', sand: '#fbf0cc', ice: '#fffbea', building: '#ead8b2', motorway: '#d6261f', roadMajor: '#ef7d22', roadMid: '#f7c843', roadMinor: '#ffffff', casing: '#7a6a4a', rail: '#555555', border: '#8a3fa0', stateBorder: '#c49ad4', label: '#2a2a2a', halo: '#fffbea', waterLabel: '#2a6aa8' }), swatch: ['#fbf3d5', '#9fcbe8', '#d6261f'] },
  fieldmap: { more: true, name: 'Field Map', desc: 'Khaki and olive with dark brown roads', line: '#e8553f',
    pal: P({ land: '#d8d2b0', water: '#9fb8b0', waterLine: '#7f9a92', wood: '#b9b98a', grass: '#cbc69e', park: '#c1bf94', urban: '#d2c9a6', sand: '#e0d8b6', ice: '#ece8d4', building: '#bfb48e', motorway: '#4a3a24', roadMajor: '#5c4a30', roadMid: '#7a6644', roadMinor: '#9a8862', casing: '#d8d2b0', rail: '#4a4030', border: '#3a3020', stateBorder: '#7a6a4a', label: '#2e2618', halo: '#e0d8b6', waterLabel: '#3f5a52' }),
    shade: { shadow: '#4a4430', highlight: '#f2edd6', accent: '#6f6a50', strength: 0.4 }, swatch: ['#d8d2b0', '#b9b98a', '#4a3a24'] },
  redplanet: { more: true, name: 'Red Planet', desc: 'Rust land and dark seas, like a map of Mars', line: '#ffe08a', dark: true,
    pal: P({ land: '#8a3b22', water: '#3a1a12', waterLine: '#4a2216', wood: '#7a321c', grass: '#83371f', park: '#7f351e', urban: '#934328', sand: '#a14d2c', ice: '#c27a5a', building: '#9c4a2c', motorway: '#ffcf9a', roadMajor: '#e8a070', roadMid: '#c87a50', roadMinor: '#a85a38', casing: '#8a3b22', rail: '#c08060', border: '#ffd2a8', stateBorder: '#c07a58', label: '#ffe2c8', halo: '#5a2414', waterLabel: '#d08a6a' }),
    shade: { shadow: '#2a0e06', highlight: '#e08a60', accent: '#5a2414', strength: 0.5 }, swatch: ['#8a3b22', '#3a1a12', '#ffcf9a'] },
  deepocean: { more: true, name: 'Deep Ocean', desc: 'Teal land and abyssal water with pale lines', line: '#ffd166', dark: true,
    pal: P({ land: '#2f6466', water: '#123c4a', waterLine: '#1a4b5a', wood: '#2b5d5f', grass: '#326a6b', park: '#2f6566', urban: '#356c6d', sand: '#3e7473', ice: '#5c8f8e', building: '#3b7273', motorway: '#d8f3ef', roadMajor: '#a6dcd6', roadMid: '#7fc2bb', roadMinor: '#5aa29b', casing: '#2f6466', rail: '#7fb0aa', border: '#d8f3ef', stateBorder: '#7fb0aa', label: '#e6fbf8', halo: '#24504f', waterLabel: '#7fb7c4' }),
    shade: { shadow: '#0f2c2d', highlight: '#7fb7b4', accent: '#1d4546', strength: 0.4 }, swatch: ['#2f6466', '#123c4a', '#d8f3ef'] },
};
// ---- Free raster base maps (imagery and classic map tiles) ----
const ESRI = (svc) => [`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`];
const R = (o) => ({ more: true, raster: true, satellite: true, ...o });
Object.assign(THEMES, {
  sentinel: R({ group: 'imagery', name: 'Sentinel-2 cloudless', desc: 'Cloud-free Sentinel-2 mosaic by EOX (non-commercial use)', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'], maxzoom: 15, attribution: 'Sentinel-2 cloudless – s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2021)', line: '#ffd23f', swatch: ['#5d7046', '#24435c', '#ffd23f'] }),
  bluemarble: R({ group: 'imagery', name: 'Blue Marble', desc: 'NASA Blue Marble with shaded relief and ocean floor — great for world views', tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'], maxzoom: 8, attribution: 'NASA Blue Marble · NASA EOSDIS GIBS', line: '#ffd23f', swatch: ['#3d6b3a', '#0d2a55', '#ffd23f'] }),
  citylights: R({ group: 'imagery', name: 'Earth at night', desc: 'NASA city lights from space', tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg'], maxzoom: 8, attribution: 'NASA Earth Observatory / NOAA NGDC · NASA EOSDIS GIBS', line: '#36d1ff', swatch: ['#05070d', '#e0b04a', '#36d1ff'] }),
  usgs: R({ group: 'imagery', name: 'USGS imagery (USA)', desc: 'High-resolution aerial photos of the United States', tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'], maxzoom: 16, attribution: 'USGS The National Map', line: '#ffd23f', swatch: ['#56684a', '#2b4256', '#ffd23f'] }),
  esritopo: R({ group: 'base', name: 'Esri Topographic', desc: 'Detailed topographic map', tiles: ESRI('World_Topo_Map'), maxzoom: 19, labels: true, attribution: 'Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors', line: '#e8553f', satellite: false, swatch: ['#f1efe4', '#a6cbe3', '#e8553f'] }),
  esristreet: R({ group: 'base', name: 'Esri Streets', desc: 'Classic street map', tiles: ESRI('World_Street_Map'), maxzoom: 19, labels: true, attribution: 'Tiles © Esri — Esri, HERE, Garmin, USGS, © OpenStreetMap contributors', line: '#2d7ff9', satellite: false, swatch: ['#f5f2ea', '#a9cbe6', '#2d7ff9'] }),
  natgeo: R({ group: 'base', name: 'National Geographic', desc: 'National Geographic style world map', tiles: ESRI('NatGeo_World_Map'), maxzoom: 16, labels: true, attribution: 'Tiles © Esri — National Geographic, Esri, Garmin, HERE, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC', line: '#c0392b', satellite: false, swatch: ['#e9e3cd', '#9fc4d8', '#c0392b'] }),
  ocean: R({ group: 'base', name: 'Ocean', desc: 'Sea floor depths and coastlines', tiles: ESRI('Ocean/World_Ocean_Base'), maxzoom: 13, attribution: 'Tiles © Esri — GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, Esri', line: '#ff7a1a', satellite: false, swatch: ['#d9d6cc', '#6f9fc8', '#ff7a1a'] }),
  relief: R({ group: 'base', name: 'Shaded relief', desc: 'Mountains and valleys, no labels', tiles: ESRI('World_Shaded_Relief'), maxzoom: 13, attribution: 'Tiles © Esri — Source: Esri', line: '#e8553f', satellite: false, swatch: ['#cfcfcf', '#bdbdbd', '#e8553f'] }),
  terrainbase: R({ group: 'base', name: 'Terrain', desc: 'Natural terrain colours, no labels', tiles: ESRI('World_Terrain_Base'), maxzoom: 13, attribution: 'Tiles © Esri — Source: USGS, Esri, TANA, DeLorme, NPS', line: '#e8553f', satellite: false, swatch: ['#d8d4b8', '#a9c3cf', '#e8553f'] }),
  lightgray: R({ group: 'base', name: 'Light gray canvas', desc: 'Quiet light gray base', tiles: ESRI('Canvas/World_Light_Gray_Base'), maxzoom: 16, attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', line: '#ff4a2b', satellite: false, swatch: ['#ececec', '#cfd5d9', '#ff4a2b'] }),
  darkgray: R({ group: 'base', name: 'Dark gray canvas', desc: 'Quiet dark base', tiles: ESRI('Canvas/World_Dark_Gray_Base'), maxzoom: 16, attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', line: '#ff6a3d', dark: true, satellite: false, swatch: ['#2b2b2b', '#1a1a1a', '#ff6a3d'] }),
  opentopo: R({ group: 'base', name: 'OpenTopoMap', desc: 'Topographic map with contour lines', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'], maxzoom: 17, labels: true, attribution: 'Map © OpenTopoMap (CC-BY-SA) · Data © OpenStreetMap contributors, SRTM', line: '#e8553f', satellite: false, swatch: ['#eef0d8', '#9cc6e6', '#e8553f'] }),
  osm: R({ group: 'base', name: 'OpenStreetMap', desc: 'The standard OpenStreetMap', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], maxzoom: 19, labels: true, attribution: '© OpenStreetMap contributors', line: '#2d7ff9', satellite: false, swatch: ['#f2efe9', '#aad3df', '#2d7ff9'] }),
  cartolight: R({ group: 'base', name: 'CARTO Positron', desc: 'Light, minimal', tiles: ['https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png', 'https://b.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png'], maxzoom: 19, labels: true, attribution: '© CARTO © OpenStreetMap contributors', line: '#ff4a2b', satellite: false, swatch: ['#fafaf8', '#d4dadc', '#ff4a2b'] }),
  cartodark: R({ group: 'base', name: 'CARTO Dark Matter', desc: 'Dark, minimal', tiles: ['https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png', 'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png'], maxzoom: 19, labels: true, attribution: '© CARTO © OpenStreetMap contributors', line: '#ff6a3d', dark: true, satellite: false, swatch: ['#262626', '#121212', '#ff6a3d'] }),
  cartovoyager: R({ group: 'base', name: 'CARTO Voyager', desc: 'Colourful and clear', tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png', 'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'], maxzoom: 19, labels: true, attribution: '© CARTO © OpenStreetMap contributors', line: '#e8553f', satellite: false, swatch: ['#f5f3ef', '#a8d1e7', '#e8553f'] }),
});
// ---- Blank base maps (plain colour, optionally with coastlines and borders) ----
const B = (o) => ({ more: true, raster: true, group: 'base', satellite: false, attribution: '', ...o });
Object.assign(THEMES, {
  blank: B({ name: 'Blank (white)', desc: 'Plain white — nothing but your layers', blank: { bg: '#ffffff' }, line: '#ff4a2b', swatch: ['#ffffff', '#ffffff', '#ff4a2b'] }),
  blankgray: B({ name: 'Blank (gray)', desc: 'Plain neutral gray', blank: { bg: '#d9dadc' }, line: '#ff4a2b', swatch: ['#d9dadc', '#d9dadc', '#ff4a2b'] }),
  blankdark: B({ name: 'Blank (black)', desc: 'Plain black, great for HUD and glowing layers', blank: { bg: '#07080a' }, dark: true, line: '#ffb020', swatch: ['#07080a', '#07080a', '#ffb020'] }),
  blankoutline: B({ name: 'Blank with outlines', desc: 'White land, pale sea and thin country borders', blank: { bg: '#ffffff', water: '#e6edf2', coast: '#9fb2c0', border: '#9aa3ad' }, line: '#ff4a2b', swatch: ['#ffffff', '#e6edf2', '#ff4a2b'] }),
  greenscreen: B({ name: 'Green screen', desc: 'Pure chroma green (#00B140) — key it out in your video editor to put the animation over other footage', blank: { bg: '#00b140' }, line: '#ff4a2b', swatch: ['#00b140', '#00b140', '#ff4a2b'] }),
  bluescreen: B({ name: 'Blue screen', desc: 'Pure chroma blue (#0047BB) — for green objects or green maps', blank: { bg: '#0047bb' }, dark: true, line: '#ffb020', swatch: ['#0047bb', '#0047bb', '#ffb020'] }),
  blankdarkoutline: B({ name: 'Dark with outlines', desc: 'Dark land and sea with glowing borders', blank: { bg: '#121519', water: '#0a0c10', coast: '#2d6f8f', border: '#3d8fb3' }, dark: true, line: '#ffb020', swatch: ['#121519', '#0a0c10', '#3d8fb3'] }),
});
THEMES.satellite.tiles = SAT_TILES;
THEMES.satellite.maxzoom = 19;
THEMES.satellite.attribution = 'Imagery © Esri, Maxar, Earthstar Geographics';

export const MAIN_THEMES = Object.keys(THEMES).filter((k) => !THEMES[k].more);
export const MORE_THEMES = Object.keys(THEMES).filter((k) => THEMES[k].more && !THEMES[k].raster);
export const IMAGERY_THEMES = Object.keys(THEMES).filter((k) => THEMES[k].raster && THEMES[k].group === 'imagery');
export const BASE_THEMES = Object.keys(THEMES).filter((k) => THEMES[k].raster && THEMES[k].group === 'base');
const isRaster = (t) => !!t.tiles;

export const ATTRIBUTION = {
  base: '© OpenFreeMap © OpenMapTiles · Data © OpenStreetMap contributors',
  satellite: 'Imagery © Esri, Maxar, Earthstar Geographics · © OpenStreetMap',
  terrain: 'Terrain: AWS Terrain Tiles',
};

let basePromise = null;
export function loadBaseStyle() {
  if (!basePromise) {
    basePromise = fetch(LIBERTY).then((r) => {
      if (!r.ok) throw new Error('Could not load the map style');
      return r.json();
    }).catch((e) => { basePromise = null; throw e; });
  }
  return basePromise;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function colorFor(layer, pal) {
  const id = layer.id;
  if (id === 'background') return pal.land;
  if (id.startsWith('park')) return pal.park;
  if (id === 'landuse_residential') return pal.urban;
  if (id === 'landcover_wood') return pal.wood;
  if (id === 'landcover_grass' || id === 'landcover_wetland') return pal.grass;
  if (id === 'landcover_ice') return pal.ice;
  if (id === 'landcover_sand') return pal.sand;
  if (id.startsWith('landuse_')) return pal.urban;
  if (id === 'water') return pal.water;
  if (id.startsWith('waterway')) return pal.waterLine;
  if (id === 'aeroway_fill') return pal.urban;
  if (id.startsWith('aeroway')) return pal.roadMinor;
  if (id.startsWith('building')) return pal.building;
  if (id === 'boundary_3') return pal.stateBorder;
  if (id.startsWith('boundary')) return pal.border;
  if (id.includes('rail')) return pal.rail;
  if (id.endsWith('_casing')) return pal.casing;
  if (id.includes('motorway')) return pal.motorway;
  if (id.includes('trunk_primary')) return pal.roadMajor;
  if (id.includes('secondary_tertiary')) return pal.roadMid;
  return pal.roadMinor;
}

const PLACE_LAYERS = /^(label_|water_name|waterway_line_label|airport)/;
const HIDE_IN_THEMES = /^(poi_|highway-shield|road_shield|road_one_way|highway-name-path|highway-name-minor|road_area_pattern|natural_earth|building-3d|tunnel_.*hatching|road_.*hatching|bridge_.*hatching)/;

function nameField(lang) {
  if (lang === 'en') return ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
  if (lang === 'local') return ['get', 'name'];
  return null; // keep style default (Latin + local)
}

/**
 * Build a MapLibre style object for a scene's look.
 * look: { theme, placeNames, lang, states, terrain, terrainExaggeration }
 */
export async function buildStyle(look) {
  const theme = THEMES[look.theme] || THEMES.classic;
  const base = await loadBaseStyle();
  const st = clone(base);
  // never let a style move the camera
  delete st.center; delete st.zoom; delete st.bearing; delete st.pitch;
  st.sources.dem = { type: 'raster-dem', tiles: DEM_TILES, tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: ATTRIBUTION.terrain };
  const shade = theme.shade;
  const layers = [];
  const field = nameField(look.lang);

  if (theme.blank) {
    const bl = theme.blank;
    layers.push({ id: 'background', type: 'background', paint: { 'background-color': bl.bg } });
    if (bl.water) {
      for (const l of base.layers) {
        if (l.id === 'water' && l.type === 'fill') { const c = clone(l); c.paint = { 'fill-color': bl.water, 'fill-outline-color': bl.coast || bl.water }; layers.push(c); }
      }
      for (const l of base.layers) {
        if (l.type === 'line' && (l.id.startsWith('boundary_2') || (l.id === 'boundary_3' && look.states))) {
          const c = clone(l);
          c.paint = { ...(c.paint || {}), 'line-color': bl.border };
          delete c.paint['line-dasharray'];
          layers.push(c);
        }
      }
      if (look.placeNames) for (const l of base.layers) if (l.type === 'symbol' && PLACE_LAYERS.test(l.id)) {
        const c = clone(l);
        c.paint = { ...(c.paint || {}), 'text-color': theme.dark ? '#cfd8e0' : '#4a5560', 'text-halo-color': bl.bg, 'text-halo-width': 1.2 };
        if (field) c.layout = { ...(c.layout || {}), 'text-field': field };
        layers.push(c);
      }
    }
  } else if (isRaster(theme)) {
    st.sources.sat = { type: 'raster', tiles: theme.tiles, tileSize: 256, maxzoom: theme.maxzoom || 19, attribution: theme.attribution };
    layers.push({ id: 'background', type: 'background', paint: { 'background-color': theme.dark || theme.satellite ? '#1b2124' : '#e9e7e1' } });
    layers.push({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } });
    const wantLabels = look.rasterLabels !== false && !theme.labels;
    if (look.rasterRoads && theme.satellite) {
      for (const l of base.layers) {
        if (l.type === 'line' && /^road_(motorway|trunk_primary|secondary_tertiary)$/.test(l.id)) {
          const c = clone(l);
          c.paint = { ...(c.paint || {}), 'line-color': 'rgba(255,236,170,0.75)' };
          layers.push(c);
        }
      }
    }
    for (const l of base.layers) {
      if (!wantLabels) break;
      if (l.type === 'symbol' && PLACE_LAYERS.test(l.id)) {
        const c = clone(l);
        c.paint = { ...(c.paint || {}), 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.4 };
        layers.push(c);
      } else if (l.id.startsWith('boundary_2') || l.id === 'boundary_3') {
        const c = clone(l);
        c.paint = { ...(c.paint || {}), 'line-color': l.id === 'boundary_3' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.8)' };
        layers.push(c);
      }
    }
  } else {
    for (const l of base.layers) {
      const c = clone(l);
      if (!theme.base) {
        if (HIDE_IN_THEMES.test(c.id)) continue;
        const pal = theme.pal;
        c.paint = c.paint || {};
        const col = colorFor(c, pal);
        if (c.type === 'background') c.paint['background-color'] = col;
        if (c.type === 'fill') {
          delete c.paint['fill-pattern'];
          c.paint['fill-color'] = col;
          if (c.paint['fill-outline-color']) c.paint['fill-outline-color'] = col;
          if (c.id === 'water' && theme.waterOutline) c.paint['fill-outline-color'] = theme.waterOutline;
        }
        if (c.type === 'fill-extrusion') c.paint['fill-extrusion-color'] = col;
        if (c.type === 'line') {
          delete c.paint['line-pattern'];
          c.paint['line-color'] = col;
        }
        if (c.type === 'symbol') {
          const isWater = /water/.test(c.id);
          c.paint['text-color'] = isWater ? pal.waterLabel : pal.label;
          c.paint['text-halo-color'] = pal.halo;
          if (c.layout?.['icon-image'] && !PLACE_LAYERS.test(c.id)) continue;
        }
        if (theme.trails && /path_pedestrian|service_track/.test(c.id) && c.type === 'line') {
          c.minzoom = Math.min(c.minzoom ?? 0, 10);
          if (!c.id.endsWith('_casing')) {
            c.paint['line-color'] = '#9a5a2a';
            c.paint['line-dasharray'] = [2, 1];
          }
        }
        if (theme.glow && c.type === 'line' && /motorway|trunk|secondary/.test(c.id) && !c.id.endsWith('_casing')) {
          c.paint['line-blur'] = 1.2;
        }
      }
      // Toggles shared by all vector themes
      if (c.type === 'symbol' && PLACE_LAYERS.test(c.id) && field) {
        c.layout = { ...(c.layout || {}), 'text-field': field };
      }
      if (c.type === 'symbol' && !look.placeNames) {
        c.layout = { ...(c.layout || {}), visibility: 'none' };
      }
      if ((c.id === 'boundary_3' || c.id === 'label_state') && !look.states) {
        c.layout = { ...(c.layout || {}), visibility: 'none' };
      }
      layers.push(c);
    }
  }
  if (isRaster(theme)) {
    for (const c of layers) {
      if (c.type === 'symbol' && !look.placeNames) c.layout = { ...(c.layout || {}), visibility: 'none' };
      if (c.type === 'symbol' && field) c.layout = { ...(c.layout || {}), 'text-field': field };
      if ((c.id === 'boundary_3' || c.id === 'label_state') && !look.states) c.layout = { ...(c.layout || {}), visibility: 'none' };
    }
  }

  // Hillshade (terrain shading), inserted just above the water layer
  if (shade && look.shading !== false) {
    const idx = Math.max(1, layers.findIndex((l) => l.id === 'water') + 1);
    layers.splice(idx, 0, {
      id: 'hillshade', type: 'hillshade', source: 'dem',
      paint: {
        'hillshade-shadow-color': shade.shadow,
        'hillshade-highlight-color': shade.highlight,
        'hillshade-accent-color': shade.accent,
        'hillshade-exaggeration': shade.strength,
      },
    });
  }
  // 3D buildings (our own extrusion so every theme gets matching colours and the "grow up" animation)
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].id === 'building-3d') layers.splice(i, 1);
  if (look.buildings3d) {
    const col = isRaster(theme) ? '#d9d4cc' : theme.pal ? theme.pal.building : '#dcd3c6';
    const firstSym = layers.findIndex((l) => l.type === 'symbol');
    layers.splice(firstSym < 0 ? layers.length : firstSym, 0, {
      id: 'ma-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': col,
        'fill-extrusion-height': ['*', ['coalesce', ['get', 'render_height'], 8], 1],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    });
  }
  st.layers = layers;
  // globe (3D Earth) and atmosphere / fog
  if (look.globe) {
    st.projection = { type: 'globe' };
    st.sky = {
      'sky-color': '#0b2a5a', 'horizon-color': '#9fc8ff', 'fog-color': '#cfe3ff',
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.6,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    };
  } else {
    delete st.projection;
    if (look.atmosphere) st.sky = { 'sky-color': '#7fb5ea', 'horizon-color': '#e8f1fb', 'fog-color': '#e8f1fb', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.25 };
    else delete st.sky;
  }
  if (look.terrain) {
    st.sources.terrain = { type: 'raster-dem', tiles: DEM_TILES, tileSize: 256, maxzoom: 14, encoding: 'terrarium' };
    st.terrain = { source: 'terrain', exaggeration: +look.terrainExaggeration || 1.4 };
  } else {
    delete st.terrain;
  }
  return st;
}

export function themeAttribution(look) {
  const t = THEMES[look.theme] || THEMES.classic;
  if (t.blank && !t.blank.water) return look.terrain ? ATTRIBUTION.terrain : '';
  let a = t.tiles ? `${t.attribution}${look.rasterLabels !== false && !t.labels ? ' · © OpenStreetMap' : ''}` : ATTRIBUTION.base;
  if (t.shade || look.terrain) a += ` · ${ATTRIBUTION.terrain}`;
  return a;
}

/** Small SVG preview (land / water / line) for theme pickers. */
export function themeSwatchSVG(key) {
  const t = THEMES[key];
  const [land, water, road] = t.swatch;
  const line = t.line;
  return `<svg viewBox="0 0 120 64" preserveAspectRatio="none"><rect width="120" height="64" fill="${land}"/>` +
    `<path d="M80 0h40v26c-12 2-26-8-40-26z" fill="${water}" opacity=".9"/><path d="M0 64v-18c10 0 20 8 28 18z" fill="${water}" opacity=".9"/>` +
    `<path d="M-4 40C30 6 60 52 124 14" fill="none" stroke="${road}" stroke-width="7" opacity=".55"/>` +
    `<path d="M10 54C40 20 70 30 112 12" fill="none" stroke="${line}" stroke-width="5" stroke-linecap="round"/></svg>`;
}
