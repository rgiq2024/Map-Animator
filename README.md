# GIS One Map Animator

Turn your map into an animated map video, right in the browser. Draw your route or drop in a GPX file, choose how you travelled each leg, add signs and a camera move, and download an MP4 — up to 4K. Free, no account, nothing uploaded.

Map creator by – **Rahul Gawai** · GIS One Mapping Lab

**Live app:** https://rgiq2024.github.io/Map-Animator/

## How it works

**Home** — name a project and press *Create project*, open or drop a saved project file, or drop a route file to start from it. Your projects are listed with a route thumbnail and are saved in this browser (IndexedDB). A live demo plays on the right; *Try it in the editor* opens it.

**Editor** — a project has one or more **scenes** (tabs at the top, joined into one video). Each scene is made in six steps:

1. **Route** — *Draw it*: click to place points and the line curves smoothly through them; click the line to insert a point; double-click a point for a sharp corner; drag points; click a point to pause there, split the leg or delete it. *Use a route file*: GPX, KML, KMZ (Google My Maps / Earth), IGC flight logs or GeoJSON. Toolbar: Draw, Move map, Select area, Show route, Undo. The **Legs** panel sets how each leg travels — plain line, walk, run, hike, horse, car, caravan, motorhome, bus, truck, tuk-tuk, motorcycle, 4WD, ATV, snowmobile, bicycle, trains, tram, boat, sailboat, cruise ship, ferry, kayak, plane (great-circle arc), helicopter, balloon, paraglider, rocket — each with its own symbol, line colour and style (solid, dashed, dotted, railway), smooth curves, and optional *Follow roads* snapping.
2. **Layers** — animated map layers, each with its own start time, animation length and how long it stays:
   - **Boundary / Area** — draw a polygon, *Find a boundary* by name (countries, regions, cities, parks, lakes from OpenStreetMap), or import GeoJSON / KML / KMZ / GPX. Animations: trace the outline, fade, grow from the centre, wipe across, glowing pulse; outline colour/width/dash, fill, glow, and *darken outside* to spotlight a region.
   - **Flood** — water that *spreads from a point* you choose (with a wobbly water front and moving waves), *rises and fills*, *flows in from a side*, or **rises on real terrain**: elevation tiles are downloaded for the area and the low ground floods first as the water level climbs between two heights you set.
   - **Line** — draw along, fade, or flowing dashes, with an arrow head and glow.
   - **Point & animated symbols** — dot, pin, ring, target or any emoji with effects: pulse rings, water ripple, radar sweep, bounce, float, spin, shake, blink, heartbeat, flicker; a gallery of 16 presets (fire, warning, storm, flood, earthquake, hospital, airport…).
   - **Freehand** lines and areas drawn directly on the map, and **points from CSV** (lat/lon columns, labels, appearing one after another, optionally joined by a line).
   - **Text on map** — labels that fade, type out, slide up or pop.
   - **Captions** — on-screen titles: lower third, big title, card, band or plain text, with slide / fade / typewriter / pop / wipe; `{km}` and `{mi}` show the distance travelled so far.
3. **Look** — **base maps**: Esri satellite, Sentinel-2 cloudless (EOX), NASA Blue Marble and Earth at night, USGS imagery, Esri Topographic / Streets / National Geographic / Ocean / Shaded relief / Terrain / Light & Dark gray, OpenTopoMap, OpenStreetMap and CARTO Positron / Dark Matter / Voyager, with optional names and roads on top of imagery; plus 23 designed vector themes (Classic, Offroad, Light, Dark, Fiord, Satellite, Treasure, plus Old Atlas, Sea Chart, Blueprint, Ink Wash, Neon Night, Synthwave, Pastel, Desert, Arctic, Ranger, Autumn, Swiss Topo, Road Atlas, Field Map, Red Planet, Deep Ocean), place names on/off, name language, states and regions, 3D mountains, **3D buildings** (optionally growing up at the start), line colour/width/outline, arrow or vehicle symbol, symbol size, 3D symbols; **animated north arrow** (compass, classic arrow, compass rose or needle) that turns with the map or points along the route, with a swinging motion and spin-in; **scale bar**; **colour grade** (presets like Warm, Golden hour, Cinematic, Vintage, Night, Black & white, plus brightness, contrast, saturation, temperature, faded blacks); **look templates** you can save and reuse.
4. **Signs** — 16 styles: plain board, standing sign, trail pointer, pill marker, callout card, summit flag, night board, treasure plaque, warning, accident, camp, start banner, finish flag, hotel, photo (instant print with your picture) and your own image. Signs pop up when the line reaches them (or from the start / at the end), and can be dragged on the map.
5. **Camera** — **Keyframes** (set views at points in time with linear, ease in/out, fly or hold interpolation), **Orbit** (a drone-like circle around the view), *Fixed view* films exactly what's in the frame; *Start to end* glides between two views you set; *Follow the line* stays with the arrow (choose how close, optionally turning the map with the route). Tilt for a flyover feel. **Start & end moves** zoom in from the whole world, a wide view, the route start or any layer, and zoom out at the end to everything, a wide view, the world, the route end or any layer. **Lens**: depth of field (tilt-shift blur with focus position and size, optionally keeping the arrow sharp) and vignette.
6. **Preview & export** — render presets (YouTube, Reels/TikTok, Instagram, square, cinema, draft), **transitions** between scenes (dip to black/white, cross dissolve, wipe, zoom), **sound** (add music, record a voiceover over the playing animation, volume and fades — mixed into the MP4), **save the current frame as PNG**, still at start/end, resolution (SD 480p, HD 720p, Full HD 1080p, 2K 1440p, 4K 2160p — also in the top bar), frame rate (24–60 fps), cut or fade between scenes, then *Render video*.

The **timeline** works like a video editor (Premiere Pro basics):
- tracks for camera (with keyframe diamonds), line, layers, signs and audio — **drag** layer bars to retime them, drag their right edge to change length, drag the line bar's edges to change when it starts and how long it draws, drag sign markers, keyframes and audio clips;
- **zoom** the timeline (slider, +/−, Ctrl + scroll) and scroll it; **snapping** to the playhead, markers and other items;
- **trim** the scene with in/out handles (or <kbd>I</kbd>/<kbd>O</kbd>), **split/cut** the scene at the playhead (<kbd>Ctrl</kbd>+<kbd>K</kbd>, or the razor tool <kbd>C</kbd>), **markers** (<kbd>M</kbd>, jump with <kbd>↑</kbd>/<kbd>↓</kbd>);
- transport: frame step <kbd>←</kbd>/<kbd>→</kbd> (<kbd>Shift</kbd> = 1 s), <kbd>Home</kbd>/<kbd>End</kbd>, <kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd>, loop, 0.25×–2× playback.

Rendering happens frame by frame: for each frame the map waits until all tiles are loaded, so every frame is sharp, then frames are encoded with WebCodecs into an MP4 (H.264 where available, otherwise VP9/AV1). The video frame is exactly the bright rectangle in the editor.

## Code

A static site — plain HTML, CSS and ES modules, no build step.

| File | Purpose |
| --- | --- |
| `index.html`, `css/app.css` | Home page, editor and dialogs |
| `js/app.js` | Router (`#/` home, `#/p/<id>` editor) |
| `js/home.js` | Projects list, create/open/drop, live demo |
| `js/editor.js` | Editor UI: scenes, steps, drawing, legs, signs, camera, timeline, export |
| `js/scene.js` | Scene model → geometry, timing, camera moves and per-frame state |
| `js/renderer.js` | Draws the line, symbol, signs, compass and editing handles |
| `js/signs.js` | The 16 sign styles |
| `js/layers.js` | Animated layers: boundaries, areas, floods, lines, points/symbols, labels, captions |
| `js/flood.js` | Rising water on real terrain (elevation tiles → map canvas source) |
| `js/effects.js` | Depth of field, vignette, colour grading |
| `js/hud.js` | North arrows and scale bar |
| `js/timeline-ui.js` | Editable timeline |
| `js/audio.js` | Music, voiceover recording, mixing and audio encoding |
| `js/themes.js` | Map themes generated from the OpenFreeMap Liberty style |
| `js/modes.js` | Ways of travelling |
| `js/importers.js` | GPX / KML / KMZ / IGC / GeoJSON readers |
| `js/services.js` | Place search and road snapping |
| `js/export.js` | Frame-by-frame renderer + encoder |
| `js/store.js` | Projects in IndexedDB, demo project |
| `js/geo.js` | Geometry helpers |
| `js/vendor/mp4-muxer.mjs` | [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT) |

Run locally with any static server: `python3 -m http.server 8000`, then open http://localhost:8000.

## Deploying

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## Credits

[MapLibre GL JS](https://maplibre.org/) · map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · tiles by [OpenFreeMap](https://openfreemap.org/) / OpenMapTiles · imagery © Esri, Maxar, Earthstar Geographics · terrain: AWS Terrain Tiles · search by [Nominatim](https://nominatim.org/) · routing by [FOSSGIS OSRM](https://routing.openstreetmap.de/). Please respect these services' usage policies.

Inspired by [mapanimator.baldinger.se](https://mapanimator.baldinger.se/) and GEOlayers; this is an independent, open-source implementation. Some base maps have their own terms (e.g. Sentinel-2 cloudless is non-commercial) — check them before commercial use.

## License

MIT
