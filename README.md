# Map Animator

Make an animated map video of your trip, right in the browser. Add stops (search or click the map) or import a GPX track, pick how you travelled each leg, add signs and camera moves, then download an MP4 — up to 4K. Free, no account, nothing to install.

**Live app:** https://rgiq2024.github.io/Map-Animator/

## Features

- **Stops** — search places (Nominatim), click the map to drop a stop, drag pins to move them, drag cards to reorder, reverse the route.
- **Legs & travel modes** — car, bus, motorbike, bicycle and walking legs follow real roads and paths (OSRM routing); planes fly great-circle arcs; trains and boats use gentle curves; "jump" legs move the camera without drawing a line.
- **GPX import** — tracks become legs that follow your recorded path exactly; waypoint-only files become stops.
- **Signs** — a pop-up sign for each stop (custom text or hidden per stop), latest-only or all visited, in light, dark or route-colour styles, plus a title card.
- **Camera moves** — Follow, Close-up or Whole-leg framing, per-leg overrides, zoom and tilt, smooth fly-style transitions between legs, and an overview intro/ending.
- **Look** — six map styles (Streets, Bright, Light, Voyager, Dark, Satellite), line colour and width, dashed preview of the route ahead, travel icons.
- **Video** — 16:9, 9:16, 1:1, 4:5 and 4:3 at 720p, 1080p, 1440p or 4K, 24/30/60 fps. Frames are rendered one by one after the map tiles have loaded, so every frame is sharp regardless of your connection, and encoded to MP4 (H.264, or VP9/AV1 where H.264 encoding isn't available) with WebCodecs.
- **Projects** — autosaves in your browser, share link (the whole trip is compressed into the URL), save/open `.json` files.

## How it works

It's a static site — plain HTML, CSS and ES modules, no build step.

| File | Purpose |
| --- | --- |
| `index.html`, `css/style.css` | UI |
| `js/app.js` | UI controller: stops list, search, settings, playback, export dialog |
| `js/model.js` | Project model, travel modes, map styles, routing, geocoding, GPX parsing, share links |
| `js/timeline.js` | Deterministic timeline: leg timing, camera keyframes and transitions, traveller state |
| `js/render.js` | Canvas overlay: route, stops, traveller icon, signs, title, attribution |
| `js/export.js` | Frame-by-frame renderer + WebCodecs encoder (MediaRecorder fallback) |
| `js/geo.js` | Geometry helpers (great circles, mercator, simplification, polyline encoding) |
| `js/vendor/mp4-muxer.mjs` | [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT) |

The preview stage is always laid out at a fixed virtual size (720 px on the short side) and scaled to fit your window, so the exported video looks exactly like the preview at any resolution.

## Run locally

Any static file server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploying

The included GitHub Actions workflow (`.github/workflows/pages.yml`) publishes the site to GitHub Pages on every push to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once.

## Credits

Map rendering by [MapLibre GL JS](https://maplibre.org/). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Tiles by [OpenFreeMap](https://openfreemap.org/), [CARTO](https://carto.com/attributions) and Esri. Routing by the [FOSSGIS OSRM](https://routing.openstreetmap.de/) servers. Search by [Nominatim](https://nominatim.org/). Please respect these services' usage policies — this app only makes requests in response to your edits.

Inspired by [mapanimator.baldinger.se](https://mapanimator.baldinger.se/). This is an independent implementation.

## License

MIT
