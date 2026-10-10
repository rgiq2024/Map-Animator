# Map Animator

Turn your trip into an animated map video, right in the browser. Draw your route or drop in a GPX file, choose how you travelled each leg, add signs and a camera move, and download an MP4 — up to 4K. Free, no account, nothing uploaded.

**Live app:** https://rgiq2024.github.io/Map-Animator/

## How it works

**Home** — name a project and press *Create project*, open or drop a saved project file, or drop a route file to start from it. Your projects are listed with a route thumbnail and are saved in this browser (IndexedDB). A live demo plays on the right; *Try it in the editor* opens it.

**Editor** — a project has one or more **scenes** (tabs at the top, joined into one video). Each scene is made in five steps:

1. **Route** — *Draw it*: click to place points and the line curves smoothly through them; click the line to insert a point; double-click a point for a sharp corner; drag points; click a point to pause there, split the leg or delete it. *Use a route file*: GPX, KML, KMZ (Google My Maps / Earth), IGC flight logs or GeoJSON. Toolbar: Draw, Move map, Select area, Show route, Undo. The **Legs** panel sets how each leg travels — plain line, walk, run, hike, horse, car, caravan, motorhome, bus, truck, tuk-tuk, motorcycle, 4WD, ATV, snowmobile, bicycle, trains, tram, boat, sailboat, cruise ship, ferry, kayak, plane (great-circle arc), helicopter, balloon, paraglider, rocket — each with its own symbol, line colour and style (solid, dashed, dotted, railway), smooth curves, and optional *Follow roads* snapping.
2. **Look** — 23 map themes (Classic, Offroad, Light, Dark, Fiord, Satellite, Treasure, plus Old Atlas, Sea Chart, Blueprint, Ink Wash, Neon Night, Synthwave, Pastel, Desert, Arctic, Ranger, Autumn, Swiss Topo, Road Atlas, Field Map, Red Planet, Deep Ocean), place names on/off, name language, states and regions, 3D mountains, line colour/width/outline, arrow or vehicle symbol, symbol size, 3D symbols, compass.
3. **Signs** — 16 styles: plain board, standing sign, trail pointer, pill marker, callout card, summit flag, night board, treasure plaque, warning, accident, camp, start banner, finish flag, hotel, photo (instant print with your picture) and your own image. Signs pop up when the line reaches them (or from the start / at the end), and can be dragged on the map.
4. **Camera** — *Fixed view* films exactly what's in the frame; *Start to end* glides between two views you set; *Follow the line* stays with the arrow (choose how close, optionally turning the map with the route). Tilt for a flyover feel.
5. **Preview & export** — still at start/end, resolution (720p, 1080p, 2K, 4K), frame rate (24–60 fps), cut or fade between scenes, then *Render video*.

The **timeline** at the bottom shows the camera, line and sign tracks; click or drag it to scrub, press play or <kbd>Space</kbd> to preview, and use the speed control to set how long the line takes to draw.

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

Inspired by [mapanimator.baldinger.se](https://mapanimator.baldinger.se/); this is an independent, open-source implementation.

## License

MIT
