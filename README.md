# GIS One Map Animator

Turn your map into an animated map video, right in the browser. Search any place or type latitude/longitude to fly there, draw your route or drop in a GPX file, choose how you travelled each leg, add signs and a camera move, and download an MP4 — up to 4K. Free, no account, nothing uploaded.

Map creator by – **Rahul Gawai** · GIS One Mapping Lab

**Live app:** https://rgiq2024.github.io/Map-Animator/

## How it works

**Home** — name a project and press *Create project*, open or drop a saved project file, or drop a route file to start from it. Your projects are listed with a route thumbnail and are saved in this browser (IndexedDB). A live demo plays on the right; *Try it in the editor* opens it.

**Quick start projects** — five ready-made camera moves, Google-Earth-Studio style: **Zoom-To** (dive from space to a place), **Orbit** (circle a landmark), **Point-to-Point** (fly between stops), **Spiral** (circle down while closing in) and **Fly-To and Orbit** (fly to each place and orbit it). Add places by searching a name, typing latitude/longitude, clicking on a satellite map (drag the numbered pins to adjust), or importing a point layer (GeoJSON, KML/KMZ, GPX waypoints or CSV). Set length, distance, tilt, turns, direction, base map, 3D buildings/terrain, pins and titles; the project is built as camera keyframes you can keep editing. The same moves are available for any scene in the Camera step.

**Editor** — a modern dark interface with glass toolbars. In the Layers step, switch between **Add** and **Layers**, search the whole catalogue, open or fold each category, or press <kbd>/</kbd> anywhere for **quick add** (type “isochrone”, “cyclone”, “train”… and press Enter). A project has one or more **scenes** (tabs at the top, joined into one video). **Drag a scene tab** to change the order, or press its ✕ to remove it. Set each scene's **length** — 30 s, 1, 2, 5 or 10 minutes, or any time you type. Each scene is made in six steps:

1. **Route** — *Draw it*: click to place points and the line curves smoothly through them; click the line to insert a point; double-click a point for a sharp corner; drag points; click a point to pause there, split the leg or delete it. *Use a route file*: GPX, KML, KMZ (Google My Maps / Earth), IGC flight logs or GeoJSON. Toolbar: Draw, Move map, Select area, Show route, Undo. The **Legs** panel sets how each leg travels — plain line, walk, run, hike, horse, car, caravan, motorhome, bus, truck, tuk-tuk, motorcycle, 4WD, ATV, snowmobile, bicycle, trains, tram, boat, sailboat, cruise ship, ferry, kayak, plane (great-circle arc), helicopter, balloon, paraglider, rocket, plus **3D tracks**: bus lane, road, railway track (ballast, sleepers, steel rails) and lifted flight arcs with a ground shadow — each with its own symbol, line colour and style (solid, dashed, dotted, railway), smooth curves, optional *Follow roads* snapping, and its own **speed** (slow down or speed up any leg).
2. **Layers** — animated map layers, each with its own start time, animation length and how long it stays:
   - **Boundary / Area** — draw a polygon, *Find a boundary* by name (countries, regions, cities, parks, lakes from OpenStreetMap), or import GeoJSON / KML / KMZ / GPX. Animations: trace the outline, fade, grow from the centre, wipe across, glowing pulse; outline colour/width/dash, fill, glow, and *darken outside* to spotlight a region.
   - **Flood** — water that *spreads from a point* you choose (with a wobbly water front and moving waves), *rises and fills*, *flows in from a side*, or **rises on real terrain**: elevation tiles are downloaded for the area and the low ground floods first as the water level climbs between two heights you set.
   - **Line** — draw along, fade, or flowing dashes, with an arrow head and glow.
   - **Point & animated symbols** — dot, pin, ring, target or any emoji with effects: pulse rings, water ripple, radar sweep, bounce, float, spin, shake, blink, heartbeat, flicker; a gallery of 16 presets (fire, warning, storm, flood, earthquake, hospital, airport…).
   - **Space & defence:** **satellite pass** (a remote-sensing satellite flies over with a sensor beam and leaves an imaged strip on the ground), **ISS orbit** (real-shaped ground track through any point), **launch site** (rocket lift-off with flame, smoke and exhaust column), **3D vehicles** (warship, cargo ship, submarine, tank, fighter jet, airliner, drone, quadcopter, helicopter, missile, satellite, ISS) moving along a path with wake, **missile / drone trajectories** (ballistic arc with shadow and smoke trail, drone flight with loiter circle, impact explosion), **blasts** (flash, fireball, shockwave, debris, rising smoke, scorch mark, optional incoming streak), **bombing runs** (aircraft dropping a series of strikes) and **capture areas** (hatched area taken by an advancing front with arrows, then a flag).
   - **Realistic 3D models** (three.js inside MapLibre, with environment lighting, ACES tone mapping and ground shadows): fighter jet, stealth bomber, cargo plane, airliner, helicopter, drone; train, freight train, tram, car, bus, truck, tank; warship, container ship, oil tanker, speed boat; missile, rocket, satellite, space station; skyscraper, tower, house, wind turbine, oil rig, lighthouse — plus **detailed NASA models** (Global Hawk drone, GOES, Landsat 8, Terra, Hubble, ISS, Space Shuttle). Or **upload your own GLB / glTF** (Draco-compressed files work; its animations play). Place one on a point or let it move along a path; size on screen or in real metres, height, heading, pitch, roll, spin or float.
   - **3D in other layers:** bombing runs, missile / drone trajectories and 3D vehicles can use any 3D model instead of the flat symbol (*3D model* in their settings).
   - **Collisions:** two 3D trains (or cars, ships, planes…) head towards each other along a line, on a 3D railway track or road, and crash where you choose — fireball, smoke, derailment and sound.
   - **3D city:** draw an area and it fills with realistic buildings (glass, offices, concrete, brick; day or night with lit windows) that grow up from the ground.
   - **Effect clips:** drop in your own explosion, fire or smoke video; black backgrounds are keyed out automatically.
   - **On-map handles:** the selected point, blast, launch site, label, 3D model or effect clip shows a square handle to **resize** and a round one to **rotate** — drag the item itself to move it.
   - **Flicker / glitch text:** decoding, flickering, RGB-glitch or typewriter text with a blinking cursor.
   - **Network analysis:** **service areas** (isochrones) — the area you can reach in e.g. 5 / 10 / 15 minutes by car, bicycle or on foot over the real road network, or straight-line buffer rings — that spread out from the place with labels and a legend; **routes from A to B** by car, bicycle, walking, train and plane at once, racing each other in real travel time with a comparison panel (distance, time, fastest) and a travel clock; **origin–destination flows** from one origin to many destinations as glowing arcs, straight lines or real road routes, widths by value, moving particles and an OD table; **geofences** — a zone and a tracked vehicle that raises ENTER / EXIT alerts with a banner, event log with clock times and alarm sounds. Search a place by name to set the start, end or destinations. Routing by FOSSGIS Valhalla and OSRM (OpenStreetMap); results are saved in the project.
   - **Imagery:** **georeferenced images** — PNG/JPG with a world file (.pgw/.jgw/.tfw/.wld, WGS84 or Web Mercator), **GeoTIFF** (EPSG:4326/3857), **KML/KMZ ground overlays** (incl. rotation and LatLonQuad), or any picture placed by hand: drag it, drag each corner onto matching features, rotate and resize with handles, or type north/south/east/west bounds; fade or wipe in. **Before / after** — swipe across, swipe back and forth, slide to split screen or cross-fade between a pre and a post image, with BEFORE/AFTER tags. **Images through time** — a sequence of images (years read from the file names) that cross-fade with a big year label and timeline bar. **Satellite through time** — archived Esri World Imagery (Wayback): list every available release, filter by date range, show every release / one per month / one per year, tick the dates you want and label them by year, month or day; they cross-fade on the map.
   - **Titles & TV news:** opening titles (letters close in), cinematic titles (blur-in with a light sweep and anamorphic streak), glitch titles, chapter cards, typed location stamps, rolling credits (“Role: Name” lines), quotes and end titles — all draggable anywhere — plus TV news graphics: channel logo bug (your own logo image or text) with LIVE, LIVE badge with location and clock, BREAKING NEWS banner, news lower third, and a fully editable news ticker (items, tag, colours, separator, direction, speed, capitals, clock).
   - **Effects & video:** your own videos full screen or picture-in-picture (rounded corners, border, caption tag, trim, speed, loop, and “use the clip’s sound”), film grain, old film, VHS, glitch, colour split, light leak, flash, camera shake, focus pull, rain, snow and fog.
   - **Weather:** **cyclone tracks** coloured by Saffir–Simpson category (TD, TS, 1–5) with numbered dots and date labels, a spinning satellite-style storm with a clear **eye** (anticlockwise in the north, clockwise in the south), the cyclone symbol, wind-radii rings, a dashed forecast part with a widening **cone of uncertainty**, a name/category label and a category legend; **low and high pressure** centres (L / H) with wobbly isobars labelled in hPa and circulation arrows; **cold, warm, occluded and stationary fronts**; **city weather** markers (animated icons and temperature); **temperature, rainfall radar, wind (moving streaks), humidity and pressure fields** over an area — a realistic made-up pattern or **live data from Open-Meteo**, with colour legends and values on the map; **live weather now** — current temperature, conditions and a 5-day forecast for the cities shown on the map; **live satellite imagery** — NOAA GOES-East / GOES-West, EUMETSAT Meteosat (0° and Indian Ocean), Himawari and NASA VIIRS, the latest picture or a loop of the last hours to show a cyclone in near real time, plus **live weather radar** (RainViewer) or any WMS layer; **TV forecast panels** — days ahead, cities list, current conditions and yellow/orange/red weather warnings. Storm, rain and wind sounds come along automatically.
   - **Nature:** realistic trees — fill an area with a forest (mixed, broadleaf, pine, palm, autumn, blossom or desert) or plant a row along a line; side view when the map is tilted, canopies from above when it's flat; they grow in one by one.
   - **Target markers:** lock-on brackets, rotating crosshair, acquisition reticle, tracking diamond, radar ping or box with a callout and coordinates, with beeps and a lock tone.
   - **More HUD:** tactical (compass tape, pitch ladder, range rings, data), radar scope (blips at your point layers), thermal camera (the map turns white-hot / black-hot), mission briefing (typed), terrain scanner (scan line that boxes your points); **HUD text** boxes — telemetry with live-ticking numbers, alert banner, terminal, live coordinates, stamp and news ticker; more glitch text — slice, scan reveal, redacted bars, neon.
   - **Place anything anywhere:** captions, charts, flicker / HUD text, radar and the year label can be dragged anywhere in the video frame (position “Anywhere”).
   - **Infographics & HUD:** animated **bar, horizontal bar, line and donut charts, counters and progress bars** (type the data as “Label: value” lines), and **HUD overlays** — drone camera (heading tape, coordinates, altitude, REC timecode, scan lines), satellite feed and target lock.
   - **Freehand** lines and areas drawn directly on the map, and **points from CSV** (lat/lon columns, labels, appearing one after another, optionally joined by a line).
   - **Text on map** — labels that fade, type out, slide up or pop.
   - **Captions** — on-screen titles: lower third, big title, card, band or plain text, with slide / fade / typewriter / pop / wipe; `{km}` and `{mi}` show the distance travelled so far.
3. **Look** — **globe (3D Earth)** with atmosphere and stars, **sky & fog**, **blank base maps** (white, gray, black, or with coastlines and borders), **cinema bars** (letterbox 2.39 / 2 / 1.85, optionally sliding in), **clouds** you fly through while zooming, **zoom blur** (warp while the camera dives); **base maps**: Esri satellite, Sentinel-2 cloudless (EOX), NASA Blue Marble and Earth at night, USGS imagery, Esri Topographic / Streets / National Geographic / Ocean / Shaded relief / Terrain / Light & Dark gray, OpenTopoMap, OpenStreetMap and CARTO Positron / Dark Matter / Voyager, with optional names and roads on top of imagery; plus 23 designed vector themes (Classic, Offroad, Light, Dark, Fiord, Satellite, Treasure, plus Old Atlas, Sea Chart, Blueprint, Ink Wash, Neon Night, Synthwave, Pastel, Desert, Arctic, Ranger, Autumn, Swiss Topo, Road Atlas, Field Map, Red Planet, Deep Ocean), place names on/off, name language, states and regions, 3D mountains, **3D buildings** (optionally growing up at the start), line colour/width/outline, arrow or vehicle symbol, symbol size, 3D symbols; **animated north arrow** (compass, classic arrow, compass rose or needle) that turns with the map or points along the route, with a swinging motion and spin-in; **scale bar**; **colour grade** (presets like Warm, Golden hour, Cinematic, Vintage, Night, Black & white, plus brightness, contrast, saturation, temperature, faded blacks); **look templates** you can save and reuse.
4. **Signs** — 16 styles: plain board, standing sign, trail pointer, pill marker, callout card, summit flag, night board, treasure plaque, warning, accident, camp, start banner, finish flag, hotel, photo (instant print with your picture) and your own image. Signs pop up when the line reaches them (or from the start / at the end), and can be dragged on the map.
5. **Camera** — **Earth zoom from space** (start on the spinning globe and dive to the place, or zoom back out to space at the end), **Rotate globe** (the traveller stays centred and the Earth turns under a flight route), **Keyframes** (set views at points in time with linear, ease in/out, fly or hold interpolation), **Orbit** (a drone-like circle around the view), *Fixed view* films exactly what's in the frame; *Start to end* glides between two views you set; *Follow the line* stays with the arrow (choose how close, optionally turning the map with the route). Tilt for a flyover feel. **Start & end moves** zoom in from the whole world, a wide view, the route start or any layer, and zoom out at the end to everything, a wide view, the world, the route end or any layer. **Lens**: depth of field (tilt-shift blur with focus position and size, optionally keeping the arrow sharp) and vignette.
6. **Preview & export** — render presets (YouTube, Reels/TikTok, Instagram, square, cinema, draft), **transitions** between scenes (dip to black/white, cross dissolve, wipe, zoom through, slide, push, whip pan, circle reveal, flash, blur dissolve, glitch, spin zoom, venetian blinds), **sound** — **cinematic sound effects made automatically** from your layers and camera (bomb whistles and explosions, jet / airliner / helicopter / drone engines, missile and rocket roars, satellite pings, HUD boot beeps, glitches and target-lock tones, flicker-text typing, **wind and whooshes when the camera zooms**, whooshes on transitions), an optional synthesised **background score** (tension, epic, ambient, documentary, space), per-layer sound on/off and volume; plus your own music and voiceovers with volume and fades — all mixed through a limiter into the MP4, **save the current frame as PNG**, still at start/end, resolution (SD 480p, HD 720p, Full HD 1080p, 2K 1440p, 4K 2160p — also in the top bar), a **sound library** (cinematic braams, hits, risers, sub booms, whooshes, explosions, gunshots, thunder, vehicles, glitches, static, radio, beeps, sonar, typing, alarms, wind, crowd…) you can preview and drop on the timeline, frame rate (24–60 fps), cut or fade between scenes, **map credits in the video on or off** (off by default), then *Render video*. Long videos (several minutes) keep the bit rate in check so the file stays manageable.

The **timeline** works like a video editor (Premiere Pro basics):
- tracks for camera (with keyframe diamonds), line, layers, signs and audio — **drag** layer bars to retime them, drag their right edge to change length, drag the line bar's edges to change when it starts and how long it draws, drag sign markers, keyframes and audio clips;
- **zoom** the timeline (slider, +/−, Ctrl + scroll) and scroll it; **snapping** to the playhead, markers and other items;
- **trim** the scene with in/out handles (or <kbd>I</kbd>/<kbd>O</kbd>), **split/cut** the scene at the playhead (<kbd>Ctrl</kbd>+<kbd>K</kbd>, or the razor tool <kbd>C</kbd>), **markers** (<kbd>M</kbd>, jump with <kbd>↑</kbd>/<kbd>↓</kbd>);
- **delete a section** (Shift + drag, or the section tool <kbd>R</kbd>, then Delete — the video jumps over it; ↺ restores it), **freeze** the picture at the playhead (<kbd>F</kbd>, +1 s per press, double-click to remove) and **extend** the scene end (<kbd>E</kbd>, +1 s);
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
| `js/fx.js` | Satellites, ISS, launches, trajectories, blasts, bombing runs, capture areas, charts, HUD |
| `js/sprites.js` | 3D-look vehicle sprites |
| `js/explosion.js` | Photographic explosions: fireball, smoke, debris, shockwave, scorch |
| `js/models3d.js` | Real 3D models (built-in + your GLB/glTF) in a MapLibre custom layer |
| `js/videofx.js` | Your own effect video clips, keyed and frame-exact in exports |
| `js/sfx.js` | Synthesised sound effects, music beds and the automatic sound timeline |
| `js/gizmo.js` | On-map resize / rotate handles |
| `js/geoimage.js` | Georeferenced images (world files, GeoTIFF, KML/KMZ), warped drawing, before/after, time series |
| `js/wayback.js` | Esri World Imagery Wayback dates as cross-fading map layers |
| `js/hudplus.js` | Tactical / radar / thermal / mission / scanner HUDs, HUD text boxes, target markers |
| `js/titles.js` | Film titles, credits and letterbox bars |
| `js/news.js` | TV news graphics (logo bug, LIVE, breaking news, lower third) |
| `js/screenfx.js` | Whole-picture effects and on-screen videos |
| `js/trees.js` | Forests and tree rows |
| `js/place.js` | Drag-anywhere placement of on-screen elements |
| `js/vendor/geotiff/` | [geotiff.js](https://github.com/geotiffjs/geotiff.js) 2.1.3 (MIT), loaded only for GeoTIFFs |
| `js/vendor/three/` | [three.js](https://threejs.org) r170 + GLTFLoader (MIT) |
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

[MapLibre GL JS](https://maplibre.org/) · map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · tiles by [OpenFreeMap](https://openfreemap.org/) / OpenMapTiles · imagery © Esri, Maxar, Earthstar Geographics · terrain: AWS Terrain Tiles · search by [Nominatim](https://nominatim.org/) · routing by [FOSSGIS OSRM](https://routing.openstreetmap.de/) and [FOSSGIS Valhalla](https://valhalla1.openstreetmap.de/) · 3D models of satellites, ISS, Hubble, Shuttle and Global Hawk from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) · live satellite imagery from NASA GIBS / NOAA and © EUMETSAT · radar by [RainViewer](https://www.rainviewer.com/) · weather by [Open-Meteo](https://open-meteo.com/). Please respect these services' usage policies.

Inspired by [mapanimator.baldinger.se](https://mapanimator.baldinger.se/) and GEOlayers; this is an independent, open-source implementation. Some base maps have their own terms (e.g. Sentinel-2 cloudless is non-commercial) — check them before commercial use.

## License

MIT
