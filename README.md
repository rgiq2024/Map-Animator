# GIS One Map Animator

Turn your map into an animated map video, right in the browser. Search any place or type latitude/longitude to fly there, draw your route or drop in a GPX file, choose how you travelled each leg, add signs and a camera move, and download an MP4 — up to 4K. Free, no account, nothing uploaded.

Map creator by – **Rahul Gawai** · GIS One Mapping Lab

**Live app:** https://rgiq2024.github.io/Map-Animator/

## How it works

**Auto video** — describe the video in one sentence, e.g. *“Train collision at Urda on the Madrid–Seville line, 28 October 2026, Toledo, Castilla-La Mancha. Source: Adif”*. The app reads the places, date, route and what happened (train / road / ship / plane crash, flood, cyclone, earthquake, fire, blast, journey from A to B, drive-time area or a place spotlight), finds the places (Nominatim) and the route, shows the plan to check and edit, then builds a finished project: an opening from space with the title, a **news-explainer map** (dark relief map, side panel with date, big title, subtitle, red rule and location lines, the route drawn in red and the places marked), the event close up in 3D (e.g. two high-speed trains crashing on a double track), TV news graphics and an end card with the source. Give the **exact location as latitude, longitude** (e.g. *39.4126, -3.7139* or *39°24′45″N 3°42′50″W*) in the sentence or in the plan, and the event is placed exactly there (the place name is looked up from the coordinates). Choose about 30 s, 45 s, 1, 2 or 5 minutes, TV news or documentary style. Open it from the home page, the editor's top bar or quick add (<kbd>/</kbd>).

**Home** — name a project and press *Create project*, open or drop a saved project file, or drop a route file to start from it. Your projects are listed with a route thumbnail and are saved in this browser (IndexedDB). A live demo plays on the right; *Try it in the editor* opens it.

**Quick start projects** — five ready-made camera moves, Google-Earth-Studio style: **Zoom-To** (dive from space to a place), **Orbit** (circle a landmark), **Point-to-Point** (fly between stops), **Spiral** (circle down while closing in) and **Fly-To and Orbit** (fly to each place and orbit it). Add places by searching a name, typing latitude/longitude, clicking on a satellite map (drag the numbered pins to adjust), or importing a point layer (GeoJSON, KML/KMZ, GPX waypoints or CSV). Set length, distance, tilt, turns, direction, base map, 3D buildings/terrain, pins and titles; the project is built as camera keyframes you can keep editing. The same moves are available for any scene in the Camera step.

**Editor** — a modern interface with a **light and a dark theme** (follows your system, switch with the sun / moon button) and a **hide-panel** button for a bigger map. While you draw, a bar at the bottom of the map shows how many points you have with **Undo point**, **Finish** and **Cancel** buttons. Layer settings are grouped into folding sections. In the Layers step, switch between **Add** and **Layers**, search the whole catalogue, open or fold each category, or press <kbd>/</kbd> anywhere for **quick add** (type “isochrone”, “cyclone”, “train”… and press Enter). A project has one or more **scenes** (tabs at the top, joined into one video). **Drag a scene tab** to change the order, or press its ✕ to remove it. Set each scene's **length** — 30 s, 1, 2, 5 or 10 minutes, or any time you type. Each scene is made in six steps:

1. **Route** — *Draw it*: click to place points and the line curves smoothly through them; click the line to insert a point; double-click a point for a sharp corner; drag points; click a point to pause there, split the leg or delete it. *Use a route file*: GPX, KML, KMZ (Google My Maps / Earth), IGC flight logs or GeoJSON. Toolbar: Draw, Move map, Select area, Show route, Undo. The **Legs** panel sets how each leg travels — plain line, walk, run, hike, horse, car, caravan, motorhome, bus, truck, tuk-tuk, motorcycle, 4WD, ATV, snowmobile, bicycle, trains, tram, boat, sailboat, cruise ship, ferry, kayak, plane (great-circle arc), helicopter, balloon, paraglider, rocket, plus **3D tracks**: bus lane, road, railway track (ballast, sleepers, steel rails) and lifted flight arcs with a ground shadow — each with its own symbol, line colour and style (solid, dashed, dotted, railway), smooth curves, optional *Follow roads* snapping, and its own **speed** (slow down or speed up any leg).
2. **Layers** — animated map layers, each with its own start time, animation length and how long it stays:
   - **Boundary / Area** — draw a polygon, *Find a boundary* by name (countries, regions, cities, parks, lakes from OpenStreetMap), or import GeoJSON / KML / KMZ / GPX. Animations: trace the outline, fade, grow from the centre, wipe across, glowing pulse; outline colour/width/dash, fill, glow, and *darken outside* to spotlight a region.
   - **Flood** — water that *spreads from a point* you choose (with a wobbly water front and moving waves), *rises and fills*, *flows in from a side*, or **rises on real terrain**: elevation tiles are downloaded for the area and the low ground floods first as the water level climbs between two heights you set.
   - **Line** — draw along, fade, or flowing dashes, with an arrow head and glow.
   - **Point & animated symbols** — dot, pin, ring, target or any emoji with effects: pulse rings, water ripple, radar sweep, bounce, float, spin, shake, blink, heartbeat, flicker; a gallery of 16 presets (fire, warning, storm, flood, earthquake, hospital, airport…).
   - **Space & defence:** **satellite pass** (a remote-sensing satellite flies over with a sensor beam and leaves an imaged strip on the ground), **ISS orbit** (real-shaped ground track through any point), **launch site** (rocket lift-off with flame, smoke and exhaust column), **3D vehicles** (warship, cargo ship, submarine, tank, fighter jet, airliner, drone, quadcopter, helicopter, missile, satellite, ISS) moving along a path with wake, **missile / drone trajectories** (ballistic arc with shadow and smoke trail, drone flight with loiter circle, impact explosion), **blasts** (flash, fireball, shockwave, debris, rising smoke, scorch mark, optional incoming streak), **bombing runs** (aircraft dropping a series of strikes) and **capture areas** (hatched area taken by an advancing front with arrows, then a flag).
   - **Realistic 3D models** (three.js inside MapLibre, with environment lighting, ACES tone mapping and ground shadows): fighter jet, stealth bomber, cargo plane, airliner, helicopter, drone; train, freight train, tram, car, bus, truck, tank; warship, container ship, oil tanker, speed boat; missile, rocket, satellite, space station; skyscraper, tower, house, wind turbine, oil rig, lighthouse — plus **detailed NASA models** (Global Hawk drone, GOES, Landsat 8, Terra, Hubble, ISS, Space Shuttle). Or **upload your own GLB / glTF** (Draco-compressed files work; its animations play). Place one on a point or let it move along a path; size on screen or in real metres, height, heading, pitch, roll, spin or float.
   - **3D in other layers:** bombing runs, missile / drone trajectories and 3D vehicles can use any 3D model instead of the flat symbol (*3D model* in their settings).
   - **Train collisions:** realistic articulated high-speed trains (white with a red stripe, red, silver, blue, green, yellow, pink or your colour; 2–12 cars each with aerodynamic noses, window rows, doors, bogies, roof panels and a pantograph) on a real-size double track with ballast, concrete sleepers, rails and overhead-line masts. Every car follows the curve of the line, and after the impact the cars buckle and jack-knife, the leading car rides up and dust, debris and smoke rise. Scenarios: **head-on on the same track**, **rear-end**, or **one train derails into a train on the next track**; set the run-up distance, how violent it is and the crash point. Cars, ships and planes can collide too.
   - **3D city:** draw an area and it fills with realistic buildings (glass, offices, concrete, brick; day or night with lit windows) that grow up from the ground.
   - **Effect clips:** drop in your own explosion, fire or smoke video; black backgrounds are keyed out automatically.
   - **On-map handles:** the selected point, blast, launch site, label, 3D model or effect clip shows a square handle to **resize** and a round one to **rotate** — drag the item itself to move it.
   - **Flicker / glitch text:** decoding, flickering, RGB-glitch or typewriter text with a blinking cursor.
   - **Network analysis:** **service areas** (isochrones) — the area you can reach in e.g. 5 / 10 / 15 minutes by car, bicycle or on foot over the real road network, or straight-line buffer rings — that spread out from the place with labels and a legend; **routes from A to B** by car, bicycle, walking, train and plane at once, racing each other in real travel time with a comparison panel (distance, time, fastest) and a travel clock; **origin–destination flows** from one origin to many destinations as glowing arcs, straight lines or real road routes, widths by value, moving particles and an OD table; **geofences** — a zone and a tracked vehicle that raises ENTER / EXIT alerts with a banner, event log with clock times and alarm sounds. Search a place by name to set the start, end or destinations. Routing by FOSSGIS Valhalla and OSRM (OpenStreetMap); if the routing service can't be reached, estimates from typical speeds are shown (marked “approx.” / “est.”) and you can retry with *Compute again*. Results are saved in the project.
   - **Placing the collision track:** Auto video now lays a train collision on the real railway line (OpenStreetMap) near the place. In the layer panel, **Snap to the real railway**, rotate (3° / 15°), move (10–300 m), make longer / shorter or redraw the track. **Before / after** can fill the whole video. Auto video lets you pick the **base map** for the close-up and the news map. The news-explainer panel has sliders for width, top, height, text start and text size, so it fits under a logo strip.
   - **News text boxes & zoom frames:** a year tab + navy gradient banner (title and subtitle), a card with a dotted-globe header and typed body text, a digital date stamp and a source credit — all animated and draggable. **Zoom frame:** a dashed ring on a place, a line that draws out and a framed inset that opens — showing your **photo or video**, or a magnified close-up of the map — with a caption; drag the frame anywhere.
   - **Story & text callouts:** six map callouts (leader line, box, speech bubble, numbered marker, bracket title, pill with icon — line draws, text types), **photo animations** (3D carousel, fan, helix, orbit, shatter → assemble, polaroid stack — use up to three of your photos), and **match-cut article highlights** (newspaper, magazine, web and tag-strip pages cut together while one highlighted phrase stays in the same place). BEFORE / AFTER tags of before/after images now sit above the lower third and each can be dragged anywhere.
   - **Auto video — choose what goes in:** after “Find the places”, tick the parts you want: opening from space, news map, an animated **route from A to B** (road, **railway track** with a moving train, flight arc or ship), the 3D event, **highlight the spot** (ripples, pulse rings, radar sweep or target lock), **affected area** circle, **info callout** with facts, **before / after satellite images** (upload a pre and a post image — they are placed over the spot and swiped), HUD overlay, weather, lower third with ticker, music and end card.
   - **Cyclone forecast:** the storm travels to “now”, then the dashed forecast track and the cone grow ahead of it with marching dashes and hollow forecast dots. Legends and on-screen text can be dragged anywhere on the video.
   - **Logo & lower third (on by default):** every scene shows the logo strip across the top and a two-row lower third in the house navy (#292a66) — country tag with a navy square, place name, date, and a scrolling news ticker (items separated by “|”). Edit or switch them off in Preview & export → Logo & lower third; replace the logo strip with your own transparent PNG.
   - **Cinematic HUD pack:** a **satellite launch countdown** (T-minus clock with depleting tick ring, GO/NO-GO poll turning green, telemetry that climbs after LIFTOFF, orbit over the Earth limb, beeps every second), a **HUD ring title** (red & cyan ring, rotating segments, diagonal bar with the title), a **HUD name card** (hatched name box, “Presents”, avatar or your picture), a **biometric scanner** (fingerprint with scan line, hand print on a grid, two waveform scopes, MATCH result), a monochrome **sci-fi data console** (map in the centre window, code panels, letter tiles, dotted world map with pulses), a cyan **live-feed scanner**, a **holo table grid** (cyan map tint, orange tags, data table) and a **scope view** (thermal-blue tint, scope arcs and crosshair, status panel).
   - **Sound is off by default** — turn it on in Preview & export → Sound. Two new scores: **Epic cinematic intro trailer** (braams, string ostinato, taiko, risers and hits) and **Epic cinematic (heroic)** (brass chords, choir, timpani and a theme).
   - **News-style graphics:** **tag labels** (pink letter-spaced boxes, bold stacked title boxes with white letter-spaced subtitles, yellow tags — they wipe in box by box), **violet / night-blue city tints**, glowing **highlight tiles** and a two-colour **mosaic tint**, a **storm vortex** of spinning light streaks with wind-speed labels, an **AIS ship track** (dashed route, ship icon, live LAT/LON/COG/SOG callout, buoy), **photo cards** with bracket titles, an **AR floating panel** with wireframe terrain and floating numbers, **line callouts** (target circle with elbow lines to boxes and a counting number), **vehicle detection boxes / tracking rings** moving along a road, a **plus-mark grid** and a **sun lens flare**.
   - **Analytics dashboard & knowledge graph:** a **real-time analytics** dashboard (title and selector, a red incident callout on your first point, big glowing KPIs that count up, a day × hour heat grid, scrolling route chips with vehicle IDs, buttons and data credit — great over the hologram digital-twin city) and a **knowledge graph** (entities such as people, buses, repairs and incidents with icons, written as “Name | type | linked to”; an optional background network fades away as the focus graph grows from its centre node, with a search box and a details panel).
   - **Showcase elements:** **spectral imagery** (split screen of the map in sepia and false colour — spectral, thermal, vegetation or ice palettes with auto contrast — with analysis frames, checker scale bars, ticking codes and a band legend), a **satellite scan HUD** (long crosshair, side rulers, typed read-outs, self-ticking checklist), a **hologram projection** effect (blue light columns, pixel-block dissolve), a **code screen**, a **split screen** (map + up to three of your pictures, sliding in), a **map diorama block** on a table (the area as a 3D slab with sides and shadow) and **floating glass layer plates** above it, **wildlife markers** and **weather & crop badges**, **hexagon icon badges**, **flow lines** with moving arrows, **light beams** shooting from a hub, a glowing **network mesh**, a **viewshed** (rays from an observer blocked by the real buildings, % visible), a **drone video footprint** (FMV: dashed track, camera footprint and frustum, plus a player window showing the magnified footprint with burned-in telemetry), **neon dots** and a **magenta towers** digital-twin look.
   - **Military & intel HUD:** a **GEOINT drone feed** (map tinted blue / night-vision green / amber, heavy scan lines, zoom gauge, centre cross, heading ruler, detection boxes on your points), a **command & control video wall** (screens power on one by one; live map feeds with REC tags, ticking KPIs, readiness gauge, pie chart, air-picture radar, scrolling event log with red ALERT lines, blinking signal-light towers, red alert frame on screens that hold a point), an **operations dashboard** (panels slide in around the map), a **SIGINT intercept** panel (spectrum waterfall keyed in sync with a Morse message that is decoded live) and **Morse code text** (dots and dashes, signal lamp, decoded letters, key waveform). All with matching sound: Morse tones, radar sweep, missile-seeker growl and lock-on tone, missile warning, radio chatter, teletype, data link, gimbal servo, klaxon, air-raid siren and countdown — also in the sound library under *Military & radar*.
   - **Smart maps (data stories):** a **night roads** map with glowing amber roads, and animated data layers clipped to a region — **population mosaic** (hex cells revealed by a soft wipe), **income hot spots** (additive glow), **potential sites** (popping rings), **drive-time areas** (growing organic blobs), **projected revenue** (hatched halos), **heat map** and **sized circles**. Load your own CSV/GeoJSON points (first numeric column = value) or use sample data. Add an **animated legend** that types itself in and a tilted **3D info card** on a stem (title, picture or building sketch, NOW OPEN badge, bars and a rising chart). Auto video understands *“Best location for a new store in Texas”* and builds a three-scene site-selection story.
   - **Digital twin:** the real city (OpenStreetMap buildings and roads) rebuilt as a glowing 3D model — **white clay model**, **cyan hologram**, **blueprint**, **night gold** or **building heights** colours — rising in a ripple or a sweep from a point behind a scan ring, with **light trails flowing along the roads**, glowing footprints and an info panel (buildings, road km, model %); **live data cards** (sensor beacons with floating cards of ticking values — air quality, traffic, IoT…); **planes taking off and landing** along a runway path, **ships arriving at port** and glowing **data links**. Works with vector themes such as Dark.
   - **People & crowds:** animated people with walk and run cycles — a crowd (standing, cheering), a **protest march** along a line with signs and flags, people walking about, gathering at a point or **running away in panic**, police lines with shields, soldiers marching, rescue teams and cartoon characters; seen from the side when tilted and from above when flat, with crowd sound.
   - **Hazard zones:** **nuclear blast zones** (fireball, heavy / moderate / light blast damage, thermal radiation and radiation rings from the yield, approximate cube-root scaling, for illustration), **explosion perimeters** (tonnes of TNT) or your own danger rings, expanding like a shock wave with labels and legend; **wildfire** spreading through an area with the wind (burning front, burnt scar, smoke, burnt-area legend); **deforestation** cleared patch by patch over the years with a year counter, % lost and new clearing in red; **affected buildings** — only the real OpenStreetMap buildings inside a radius, a blast zone, a fire or an area are raised in 3D in the zone colour (optionally hiding or dimming every other building), with building counts.
   - **Imagery:** **georeferenced images** — PNG/JPG with a world file (.pgw/.jgw/.tfw/.wld, WGS84 or Web Mercator), **GeoTIFF** (EPSG:4326/3857), **KML/KMZ ground overlays** (incl. rotation and LatLonQuad), or any picture placed by hand: drag it, drag each corner onto matching features, rotate and resize with handles, or type north/south/east/west bounds; fade or wipe in. **Before / after** — swipe across, swipe back and forth, slide to split screen or cross-fade between a pre and a post image, with BEFORE/AFTER tags. **Images through time** — a sequence of images (years read from the file names) that cross-fade with a big year label and timeline bar. **Satellite through time** — archived Esri World Imagery (Wayback): list every available release, filter by date range, show every release / one per month / one per year, tick the dates you want and label them by year, month or day; they cross-fade on the map.
   - **Titles & TV news:** **news explainer panel** (dark side panel with date, big title, subtitle, red rule and location lines, like TV news explainers), opening titles (letters close in), cinematic titles (blur-in with a light sweep and anamorphic streak), glitch titles, chapter cards, typed location stamps, rolling credits (“Role: Name” lines), quotes and end titles — all draggable anywhere — plus TV news graphics: channel logo bug (your own logo image or text) with LIVE, LIVE badge with location and clock, BREAKING NEWS banner, news lower third, and fully editable **news tickers** in many styles — classic, red news band, navy and gold, white, **headline + ticker** (two lines), **rolling headlines** (one at a time), **breaking crawl** with blinking tag, **stock ticker** (▲▼ in green / red) and **sports scores** — type your own items, tag, colours, separator, direction, speed and clock.
   - **Effects & video:** your own videos full screen or picture-in-picture (rounded corners, border, caption tag, trim, speed, loop, and “use the clip’s sound”) with **green screen** (remove a green, blue or any colour background — e.g. a presenter over the map — with tolerance, soft edges and fringe removal), film grain, old film, VHS, glitch, colour split, light leak, flash, camera shake, focus pull; **weather and particles**: rain, **thunderstorm with lightning**, **lightning strikes**, **hail**, snow, **blizzard**, **falling leaves**, **blossom petals**, **rising embers**, **falling ash**, **sandstorm**, fog, **drifting mist** and **sun rays** (with wind, speed and size). Trees can drop **leaves falling from their crowns**.
   - **Weather:** **cyclone tracks** coloured by Saffir–Simpson category (TD, TS, 1–5) with numbered dots and date labels, a spinning satellite-style storm with a clear **eye** (anticlockwise in the north, clockwise in the south), the cyclone symbol, wind-radii rings, a dashed forecast part with a widening **cone of uncertainty**, a name/category label and a category legend; **low and high pressure** centres (L / H) with wobbly isobars labelled in hPa and circulation arrows; **cold, warm, occluded and stationary fronts**; **city weather** markers (animated icons and temperature); **temperature, rainfall radar, wind (moving streaks), humidity and pressure fields** over an area — a realistic made-up pattern or **live data from Open-Meteo**, with colour legends and values on the map; **live weather now** — current temperature, conditions and a 5-day forecast for the cities shown on the map; **live satellite imagery** — NOAA GOES-East / GOES-West, EUMETSAT Meteosat (0° and Indian Ocean), Himawari and NASA VIIRS, the latest picture or a loop of the last hours to show a cyclone in near real time, plus **live weather radar** (RainViewer) or any WMS layer; **TV forecast panels** — days ahead, cities list, current conditions and yellow/orange/red weather warnings. Storm, rain and wind sounds come along automatically.
   - **Nature:** realistic trees — fill an area with a forest (mixed, broadleaf, pine, palm, autumn, blossom or desert) or plant a row along a line; side view when the map is tilted, canopies from above when it's flat; they grow in one by one.
   - **Target markers:** lock-on brackets, rotating crosshair, acquisition reticle, tracking diamond, radar ping or box with a callout and coordinates, with beeps and a lock tone.
   - **More HUD:** tactical (compass tape, pitch ladder, range rings, data), radar scope (blips at your point layers), thermal camera (the map turns white-hot / black-hot), mission briefing (typed), terrain scanner (scan line that boxes your points); **HUD text** boxes — telemetry with live-ticking numbers, alert banner, terminal, live coordinates, stamp and news ticker; more glitch text — slice, scan reveal, redacted bars, neon.
   - **Place anything anywhere:** captions, charts, flicker / HUD text, radar and the year label can be dragged anywhere in the video frame (position “Anywhere”).
   - **Infographics & HUD:** animated **bar, horizontal bar, line and donut charts, counters and progress bars** (type the data as “Label: value” lines), and **HUD overlays** — drone camera (heading tape, coordinates, altitude, REC timecode, scan lines), satellite feed and target lock.
   - **Freehand** lines and areas drawn directly on the map, and **points from CSV** (lat/lon columns, labels, appearing one after another, optionally joined by a line).
   - **Text on map** — labels that fade, type out, slide up or pop.
   - **Captions** — on-screen titles: lower third, big title, card, band or plain text, with slide / fade / typewriter / pop / wipe; `{km}` and `{mi}` show the distance travelled so far.
3. **Look** — **green screen / blue screen backgrounds** (pure chroma colour so you can key the animation over other footage in your editor), **globe (3D Earth)** with atmosphere and stars, **sky & fog**, **blank base maps** (white, gray, black, or with coastlines and borders), **cinema bars** (letterbox 2.39 / 2 / 1.85, optionally sliding in), **clouds** you fly through while zooming, **zoom blur** (warp while the camera dives); **base maps**: Esri satellite, Sentinel-2 cloudless (EOX), NASA Blue Marble and Earth at night, USGS imagery, Esri Topographic / Streets / National Geographic / Ocean / Shaded relief / Terrain / Light & Dark gray, OpenTopoMap, OpenStreetMap and CARTO Positron / Dark Matter / Voyager, with optional names and roads on top of imagery; plus 23 designed vector themes (Classic, Offroad, Light, Dark, Fiord, Satellite, Treasure, plus Old Atlas, Sea Chart, Blueprint, Ink Wash, Neon Night, Synthwave, Pastel, Desert, Arctic, Ranger, Autumn, Swiss Topo, Road Atlas, Field Map, Red Planet, Deep Ocean), place names on/off, name language, states and regions, 3D mountains, **3D buildings** (optionally growing up at the start), line colour/width/outline, arrow or vehicle symbol, symbol size, 3D symbols; **animated north arrow** (compass, classic arrow, compass rose or needle) that turns with the map or points along the route, with a swinging motion and spin-in; **scale bar**; **colour grade** (presets like Warm, Golden hour, Cinematic, Vintage, Night, Black & white, plus brightness, contrast, saturation, temperature, faded blacks); **look templates** you can save and reuse.
4. **Signs** — 16 styles: plain board, standing sign, trail pointer, pill marker, callout card, summit flag, night board, treasure plaque, warning, accident, camp, start banner, finish flag, hotel, photo (instant print with your picture) and your own image. Signs pop up when the line reaches them (or from the start / at the end), and can be dragged on the map.
5. **Camera** — **Earth zoom from space** (start on the spinning globe and dive to the place, or zoom back out to space at the end), **Rotate globe** (the traveller stays centred and the Earth turns under a flight route), **Keyframes** (set views at points in time with linear, ease in/out, fly or hold interpolation), **Orbit** (a drone-like circle around the view), *Fixed view* films exactly what's in the frame; *Start to end* glides between two views you set; *Follow the line* stays with the arrow (choose how close, optionally turning the map with the route). Tilt for a flyover feel. **Start & end moves** zoom in from the whole world, a wide view, the route start or any layer, and zoom out at the end to everything, a wide view, the world, the route end or any layer. **Lens**: depth of field (tilt-shift blur with focus position and size, optionally keeping the arrow sharp) and vignette.
6. **Preview & export** — render presets (YouTube, Reels/TikTok, Instagram, square, cinema, draft), **transitions** between scenes (dip to black/white, cross dissolve, wipe, zoom through, slide, push, whip pan, circle reveal, flash, blur dissolve, glitch, spin zoom, venetian blinds, pixelate, film burn, light leak flash, ink bleed, noise dissolve, zoom blur, slide up, doors open, and **your own video stinger** — an ink splash, light sweep or logo clip on black, green screen or with transparency played over the cut), **sound** — **cinematic sound effects made automatically** from your layers and camera (bomb whistles and explosions, jet / airliner / helicopter / drone engines, missile and rocket roars, satellite pings, HUD boot beeps, glitches and target-lock tones, flicker-text typing, **wind and whooshes when the camera zooms**, whooshes on transitions), an optional synthesised **background score** (tension, epic, ambient, documentary, space), per-layer sound on/off and volume; plus your own music and voiceovers with volume and fades — all mixed through a limiter into the MP4, **save the current frame as PNG**, still at start/end, resolution (SD 480p, HD 720p, Full HD 1080p, 2K 1440p, 4K 2160p — also in the top bar), a **sound library** (cinematic braams, hits, risers, sub booms, whooshes, explosions, gunshots, thunder, vehicles, glitches, static, radio, beeps, sonar, typing, alarms, wind, crowd…) you can preview and drop on the timeline, frame rate (24–60 fps), cut or fade between scenes, **map credits in the video on or off** (off by default), then *Render video*. Long videos (several minutes) keep the bit rate in check so the file stays manageable.

The **timeline** works like a video editor (Premiere Pro basics):
- tracks for camera (with keyframe diamonds), line, layers, signs and audio — **drag** layer bars to retime them, drag their right edge to change length, drag the line bar's edges to change when it starts and how long it draws, drag sign markers, keyframes and audio clips;
- **zoom** the timeline (slider, +/−, Ctrl + scroll) and scroll it; **snapping** to the playhead, markers and other items;
- **trim** the scene with in/out handles (or <kbd>I</kbd>/<kbd>O</kbd>), **split/cut** the scene at the playhead (<kbd>Ctrl</kbd>+<kbd>K</kbd>, or the razor tool <kbd>C</kbd>), **markers** (<kbd>M</kbd>, jump with <kbd>↑</kbd>/<kbd>↓</kbd>);
- **delete a section** (Shift + drag, or the section tool <kbd>R</kbd>, then Delete — the video jumps over it; ↺ restores it), **freeze** the picture at the playhead (<kbd>F</kbd>, +1 s per press, double-click to remove) and **extend** the scene end (<kbd>E</kbd>, +1 s);
- transport: frame step <kbd>←</kbd>/<kbd>→</kbd> (<kbd>Shift</kbd> = 1 s), <kbd>Home</kbd>/<kbd>End</kbd>, <kbd>J</kbd>/<kbd>K</kbd>/<kbd>L</kbd>, loop, 0.25×–2× playback.

Rendering happens frame by frame: for each frame the map waits until all tiles are loaded, so every frame is sharp, then frames are encoded with WebCodecs into an MP4 (H.264 where available, otherwise VP9/AV1). The video frame is exactly the bright rectangle in the editor.

### Remote sensing: Sentinel imagery, oil spills, video on the map, moving labels

- **Sentinel-2 by date** (natural colour, colour infrared, SWIR, agriculture, NDVI, bathymetric), **Sentinel-1 radar (SAR)** and **Sentinel-2 cloudless yearly mosaics** — *Add → Imagery & remote sensing*. Each date is the clearest scene in its search window; dates cross-fade with a label. Sources: Esri Sentinel-2 / Sentinel-1 image services, EOX s2cloudless, or **Copernicus Browser** with your own free instance ID (Sentinel Hub WMS, any layer from your configuration). Contains modified Copernicus Sentinel data.
- **Real scenes from Microsoft Planetary Computer** — Sentinel-2 L2A, Sentinel-1 RTC / GRD radar, Landsat 8/9 and HLS: *Find scenes in this view* searches the STAC catalogue (no account) and lists every real acquisition day with cloud cover and a thumbnail; tick the days and each becomes a mosaic of that day’s scenes, drawn with the collection’s own looks (natural colour, colour infrared, NDVI, VV/VH radar…). Copernicus Browser layers can also list the real Sentinel passes from the public Copernicus catalogue.
- **Flight reconstruction** — draw the ground track, type the time / altitude profile (`12:48:15 | 35250 | 82 | 6` = clock | feet | % along the track | video second) and the radio calls (`12:48:27 | “Mayday, Mayday” | PILOT`): the path is drawn in 3D at its real altitude (the camera’s own matrix, so it is right from any angle, even a ground-level “dashcam” view), with the aircraft and a drop line, callouts pinned on the path, the quote at the top while it is said, a clock / altitude / descent-rate panel with an altitude chart, “+0:51 since the dive began”, REAL TIME / SLOW MOTION / FAST badge and an impact flash.
- **Storm cells in 3D** — radar-style rain volumes (light · heavy · downpour · core) with a legend and a core callout; **NEXRAD radar on a past date** (USA, 5-minute archive from the Iowa Environmental Mesonet).
- **Example:** `examples/learjet-n722bd-reconstruction.json` — the Learjet 60 N722BD crash in Greenacres, Florida (1 Nov 2026), five scenes built from public reports (route overview → cruise → dive → ground viewpoint → crash site), blue-and-white boxes, impacted location at 26.632833° N, 80.113090° W; open it with *Open file* on the home page. The ground track and times are approximate. The flight reconstruction has a real 3D aircraft (business jet, airliner, fighter or cargo plane) that pitches into the dive and banks into turns, *Box colours* (dark / blue / white), modern radio callouts (glass card, time chip, corner ticks) and an *Impact label*.
- **AI object detection** — finds ships, aircraft, helicopters, trucks, cars, storage tanks, harbours, bridges… on the imagery inside the video frame (Esri World Imagery / Wayback at zoom 16–19 works best) with a YOLO11n-OBB model (DOTA) running in the browser through ONNX Runtime Web. Each object gets a rotated box stuck to the map, its **length × width in metres** measured on the ground, and a flicker-in / scan-line reveal; styles: filled box, thin box, targeting brackets, HUD crosshair; a count card. *Measure an object* adds boxes by hand (click both ends, type the width). Model licence: AGPL-3.0 — see `assets/models/README.md`.
- **Oil spill** — draw the slick (start at the ship): it spreads from the source, drifts, has a marching dashed outline, an “OIL SPILL” label you can drag, a glowing source ship, a drift arrow and a stats card (area, estimated volume from the thickness, perimeter, sensor, date). Styles: outline only, dark slick, rainbow sheen, thickness zones, red alert. *SAR look* turns the map into a teal radar picture like a Sentinel-1 scene.
- **Video on the map** — a drone / satellite / thermal clip warped onto the map by its four corners (move, rotate and stretch the corners like a georeferenced image). Exported frame-exact.
- **Moving label** — text that follows a moving object or 3D model (plane taking off, ship, vehicle, missile path, the route arrow) with live `{speed}` `{alt}` `{heading}` `{lat}` `{lon}` `{dist}`; looks: tag, data box, target tracker, flag, plain text; optional dotted trail.

### Railways, metro, tram, bus and ferry lines

*Add → Transit & railways*. A **transit line** draws its route and runs a vehicle from station A to the last station, stopping at each one; the travel time between stations is shared by distance and each stop has a dwell.
- **Line types:** railway, high-speed rail, metro, light rail, tram, bus, BRT and ferry. Each has its own track style, vehicle, colour and line badge (for example M1, T1, 12).
- **Ways to build a line:**
  - Draw it on the map.
  - Type the station names (`Name` or `Name | lng, lat`) and press *Find stations & build the line*. Stations are found by name with OpenStreetMap Nominatim.
  - Pick an existing line from **OpenStreetMap**: *Detect lines from OpenStreetMap* lists the route relations (train, subway, light rail, tram, bus, ferry), with their real geometry, stops, colour and number.
- ***Follow the real tracks*** re-draws the line along the OSM railway between the stations (Overpass + shortest path on the track network). For buses it follows the roads (OSRM). Gaps where tracks aren't mapped are bridged.
- ***All railway tracks in view (OSM)*** draws the whole railway network in the current view.
- **Text and badges:** a moving label on the vehicle (`{name} · Next: {next}`, "Arriving · X"), station names, a line badge and a route strip with the stations.
- **Close-ups:** when zoomed in, the line becomes **real 3D track** (ballast, sleepers and rails at real size). *Add a 3D train* puts a real-scale train on the tracks that follows the line's timetable and stops at every station.
- ***Camera tour:*** keyframes for the country, then the whole line, then a tilted close-up of each station as the vehicle arrives, then the line again.
- **Example:** *Etihad Rail (UAE)* has the 11 announced passenger stations: Al Sila, Al Dhannah, Al Mirfa, Mezaira’a, Madinat Zayed, Mohamed Bin Zayed City, Al Faya, Jumeirah Golf Estates, University City, Al Dhaid and Al Hilal (Fujairah). The station positions are approximate.

### Holograms and model-builder diagrams

*Add → Holograms & model builder.*

- **Holograms:** floating glass panels in real perspective. **Turn** and **lean** them like a screen or a table top, drag them anywhere, and set the colour, accent, glow, flicker, scan lines and glass darkness. Choose light or normal blending (light is best over your own video, *Add → Video*). They materialise, unfold or glitch in.
  - **Variants:**
    - **globe** on a projector, with land dots, orbit rings with satellites and a marker at the map centre;
    - **map of this place**: the map under the frame turned into a hologram, with a grid, sweep and target;
    - **chart**, **ring gauges**, **3D network**, **info card** (`Label | value` lines, `{lat}` `{lon}` `{time}`), **3D terrain**;
    - a **dashboard** of several panels.
  - Land outline: Natural Earth via world-atlas (public domain).
- **Model builder diagram:** a GIS workflow (inputs → tools → outputs) like ArcGIS ModelBuilder or Velocity, with white node cards and icons, ports, animated dashed connectors and live event rates (`29.8 e/s`).
  - **Animations:** builds up step by step; runs tool by tool, with a highlight box, spinner and ✓; or flows.
  - **Looks:** light cards, dark, classic ModelBuilder (ovals and boxes) and holographic.
  - ***Open the model builder*** for the drag-and-drop editor: drag inputs, 40 tools and outputs from the palette onto the canvas, drag from a node's right ● to another node to connect, then rename it, change its type, set a rate badge, duplicate it, Delete it, auto-lay it out, zoom and pan.
  - **Examples:** real-time bus alerts, flood risk, wildfire alerts, ship detection (AI), site suitability.

### Documentary map looks

*Add → Documentary map looks:*
- **Category markers + legend**: places as circles, triangles, squares, diamonds or stars by category (e.g. 12-inch / 8-inch / 6-inch fab, advanced backend), popping in one by one, with a legend.
- **Zoom inset**: a framed close-up of a place in real satellite imagery (Esri World Imagery; streets / topo / grey canvases too, optional black & white). A leader line runs from a small square on the map, the box opens out of its corner, and category markers are drawn inside. Drag the box anywhere.
- **Country spotlight**: pick countries by name (or groups: USSR, EU, GCC, NATO) or any boundary / area layer.
  - **Looks:**
    - colour inside with the world grey and dark (Austria);
    - grey and bright inside (Paris arrondissements);
    - a colour / flag fill with your emblem picture and inner borders (USSR);
    - a colour tint;
    - outline only.
  - It also has a big name and black city tags.
- **Locator mini-map**: the country's silhouette with a box showing the current view and the route.
- **Elevation profile + trail stats**: the real elevation along the route or a line (AWS Terrain Tiles), growing as it is travelled. Two looks: a wide profile along the bottom with a title and length (Route des Grandes Alpes), or a corner runner / hiker / cyclist / car with a mini profile and distance counter (km / mi). Also totals (distance, climb, descent) and a glowing trail on the map.
- **Range rings**: dotted rings at real distances (mi / km / nm) from a base, expanding one by one, with top-down aircraft silhouettes (fighter, twin-boom, bomber, jet, helicopter, missile) and "Range … Miles" labels.
- **Front line / territory**: a controlled area with a ragged, patchy frontier and a lighter band, multiplied over the map. It advances in a direction or grows from the centre.
- **Top-down units**: tanks, armoured carriers, trucks, artillery, jeeps, jets, bombers, helicopters and ships driving along a path in a column, pairs or wedge, with moving tracks, dust and shadows.
- **Blast decal**: a flash, a black burst with debris, smoke, and a scorch mark that stays.
- **Incident dots / heat**: clusters of red dots with a heat glow appearing over a country or area, at random or sweeping across.
- **Portrait badge**: your photo in an octagon, circle, square or shield frame with a name plate and an optional colour tint and leader line.

- **Pick any country**: the country dropdown at the top of the section (all countries, plus groups USSR, EU, GCC, NATO) is used by the spotlight, fill, tint, dots, regions and locator buttons. In a layer's settings, a country field has a dropdown to replace, a second one to add another, and ⌖ to zoom to it. City / place lists have a *Find a city or place by name* box that adds it with its coordinates (OpenStreetMap Nominatim).
- **More spotlight looks**: a picture / flag fills the country (with relief and an inner shadow); two colours across a country (red / blue); a neon glow outline with the world darker (night map, sci-fi); a tint with dot city labels and a capital star (`*Bern`); the name in a box.
- **Photo pin**: a round photo in a coloured map pin with a distance chip.
- **Leader-line labels**: a white box (Fordo / Natanz), a sci-fi underline with coordinates, a big serif title on an elbow line (Japan), a black tag, a rounded pill, a tilted board.
- **Distance spokes**: coloured lines from a home to nearby places, each with an icon card and the distance (miles / km).
- **Runway lights**: chasing, twinkling or switching-on lights in one or two rows, with or without a centre line.
- **Fire plume**: animated flames and smoke on a ringed marker (nuclear / factory icon).
- **Missile trails**: glowing heads with wavy smoke trails from launch to target, and fireballs on impact.
- **Stealth bombers**: flying-wing silhouettes in formation (also in range rings); a **nuclear** symbol for category markers.
- **Coloured regions / choropleth**: states, districts or counties of any place, from OpenStreetMap admin boundaries (choose the level), or countries. Each region gets its own colour and name (Manipur), or is coloured by your values with classes and a legend (COVID map).
- **Event timeline**: earthquakes or any dated events (`date | lng, lat | magnitude`), or live USGS earthquakes (past 30 days M4.5+ / past 7 days M2.5+). Dots are sized and coloured by magnitude and appear day by day, with rings, a highlighted newest event and a date timeline.
- **Ripple rings**: sonar-like pulses at places.
- **Big curved arrow**: a smooth, tapered arrow with a shadow that grows along the path.

Country outlines: Natural Earth 1:50m via world-atlas (public domain), in `assets/geo/`. Districts: © OpenStreetMap contributors. Earthquakes: USGS.

### Weather forecast (TV weather graphics)

*Add → 🌦 Weather forecast* gathers everything for weather shows:
- **TV weather graphics:**
  - **Title bars**: white with logo, title, day and time, and an optional rain → snow or wind-gust scale (CBS style); dark with a rainfall-mm strip (News 5); or a red tab (7 News).
  - **City values**: big numbers ("10.0 mi", "24") over the cities, with the name in a dark strip. They pop in or count up.
  - **Gust / temperature map**: smoothly interpolated (inverse-distance) from your station values, with a terrain-like texture and moving wind arrows. It can be clipped to an area.
  - **City forecast cards**: name tab, low in black, high in red and an animated weather icon; or icons with temperatures.
  - **High / low discs**: arrows turning around them.
  - **Live USGS earthquakes** and **location pills**.
- **Maps, radar & satellite** (the earlier weather tools): cyclone tracks, pressure systems with isobars, fronts, live weather, live satellite, live radar, NEXRAD history, 3D storm cells, temperature / rain / wind / humidity fields, forecast panels and warnings.

### Rotating globes

*Add → 🌍 Rotating globes*:
- **Looks**
  - **Shader looks (WebGL, NASA textures)**: realistic Earth (NASA Blue Marble by day, city lights on the night side), day only, night lights, black & white, flat cartoon.
  - **Drawn looks**: transparent glass (the far side shows through), wireframe, glowing hologram, sci-fi HUD (rings and a countdown), neon, gold dots, blueprint.
- **Settings**:
  - sun intensity and direction, with the sun flare;
  - city-light intensity;
  - moving clouds (cover, drift speed);
  - atmosphere glow (strength, colour);
  - globe opacity (see-through over the map or a video);
  - texture detail (high = sharper when zoomed in);
  - space and stars;
  - facing longitude and latitude, turning speed, size and position.
- **Tour**: the globe turns first, then flies and zooms to every place in turn, with a pulsing marker and a label, staying a while at each. Set the turn time, travel time, stay time and zoom. *Make the layer that long* fits the layer to the tour.
- **Places and arcs**: places with labels, glowing great-circle arcs (from a hub, or "From > To"), and an orbit ring.
- **Your data**: paste or load a CSV (`name, lat, lon, value`; the column order is found from the header) or GeoJSON. Points appear as ripples, glows, spikes (height = value), dots or pins, sized by value and optionally named. Lines and areas are drawn on the globe.

### Typography: callouts, titles and text

**Add → Start here → Typography.**

- **Callouts on the map** — 16 styles pinned to a place with a leader line: clean, outlined box, solid box, pill,
  numbered badge, value card (e.g. 110 km/h), big label + ring, tagged, neon, counting number, percentage ring,
  photo, corner bracket, title + paragraph, modern hatched frame and HUD corners. Drag the box anywhere.
- **Callouts that follow your video** — add a video, then a tracked callout: click the person or object once and it
  is tracked through the whole clip (forwards and backwards, right in the browser); the callout follows it.
- **Titles & text on screen** — kinetic, stacked with colour bar, outline that fills, box wipe reveal, underlined,
  kicker + big word, typewriter, cinematic, lower third, quote, counting number, heading + paragraph,
  big number + title, highlighter marker and framed title. Five font families, letter spacing, nine positions.
- **Measure** — dimension lines that show the measured distance (m / km / ft / mi / NM) or your own text.
- **Sci-fi windows & camera overlays** — retinal scan, fingerprint, ID card, profile + data, and an airborne
  camera (FLIR) overlay with live coordinates, heading, altitude, target, crosshair and a thermal map look.
- **More titles & text** — shortcuts to the film titles, lower thirds, text on map, captions and text cards.

### Finding layers

The Add panel lists categories in five groups (Start here, Maps & data, Imagery & 3D, Motion graphics, Specialist).
Open a category to see its items as a list; the back arrow returns to all categories. Search looks through
every category, “Recently added” remembers your last six, and “/” opens quick add from anywhere.

### Cartography: thematic maps, graphs and map layout

**Add → 🗺 Cartography** (the first section after “Draw or place”).

- **Thematic maps** — choropleth, graduated colours, graduated symbols, proportional symbols, dot density,
  bivariate (3 × 3 colours), unique values (categories) and heat map. Load your own data with **📂 Load data file(s)**:
  CSV / TSV (with lat / lon columns, or a country-name column that is joined to country shapes), GeoJSON, TopoJSON,
  KML / KMZ, GPX, or an Esri shapefile (a .zip, or .shp + .dbf + .prj picked together). Projected shapefiles in UTM /
  Transverse Mercator, Lambert Conformal Conic or Web Mercator are re-projected to WGS 84 automatically.
  Classification: quantile, equal interval, natural breaks (Jenks), standard deviation, rounded or manual breaks;
  ColorBrewer, Viridis and diverging schemes; normalise by a second field; labels; animated reveal; own legend.
- **Graphs** — bar, line, combo, pie / donut, histogram, box plot, scatter plot, scatter-plot matrix, data clock,
  calendar heat chart, matrix heat chart, QQ plot and elevation profile (from data or from a line on the map).
- **Map layout** — map title, legend (built from the thematic maps and map layers), north arrow / compass rose,
  scale bar (with 1 : N ratio), coordinate grid / graticule, map frame and neatline (with paper margin), data source
  and credits, projection and coordinate reference system, inset map, locator map, author and date, and an overview
  map with the current extent. “Complete map layout” and “Atlas layout” add all of them at once.

## Tutorials

`tutorials.html` (linked from the top bar, the home page and Help) has step-by-step guides for the workflow and a card for every element in *Layers → Add* — an example frame, its settings panel, how to place it, its animations and the settings you can change, with search. Pictures are in `assets/tutorials/`.

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

Before publishing, run `python3 tools/stamp.py`: it stamps every script with a content hash in the import map so browsers never mix old cached files with a new page.


`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## Credits

[MapLibre GL JS](https://maplibre.org/) · map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · tiles by [OpenFreeMap](https://openfreemap.org/) / OpenMapTiles · imagery © Esri, Maxar, Earthstar Geographics · terrain: AWS Terrain Tiles · search by [Nominatim](https://nominatim.org/) · routing by [FOSSGIS OSRM](https://routing.openstreetmap.de/) and [FOSSGIS Valhalla](https://valhalla1.openstreetmap.de/) · 3D models of satellites, ISS, Hubble, Shuttle and Global Hawk from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) · live satellite imagery from NASA GIBS / NOAA and © EUMETSAT · radar by [RainViewer](https://www.rainviewer.com/) · weather by [Open-Meteo](https://open-meteo.com/). Please respect these services' usage policies.

Inspired by [mapanimator.baldinger.se](https://mapanimator.baldinger.se/) and GEOlayers; this is an independent, open-source implementation. Some base maps have their own terms (e.g. Sentinel-2 cloudless is non-commercial) — check them before commercial use.

## License

MIT

## Login and users

The app opens with a sign-in screen. Users and their password hashes (salted PBKDF2-SHA256) are in `auth/users.json`.

- **Administrators** see **Users** in the header: add users, reset passwords, change roles, remove users. Changes are collected in a new `users.json` — press **Download users.json** and replace `auth/users.json` in the repository. Anyone can change their own password with **Password** (same download step).
- Sessions last 14 days with “Keep me signed in” (otherwise until the browser closes). Removing a user or changing a password signs that user out everywhere.
- **Limits:** GitHub Pages serves static files, so this login keeps casual visitors out but cannot stop someone who reads the site's code. For real protection, switch to **Firebase Authentication**:
  1. Create a free project at console.firebase.google.com → add a Web app → copy its config.
  2. Authentication → Sign-in method → enable **Email/Password**; Authentication → Users → **Add user** for each person.
  3. In `js/auth-config.js` set `mode: 'firebase'`, paste the config into `firebase`, and optionally list `allowedEmails` and `adminEmails`.
  4. Authentication → Settings → Authorised domains → add `rgiq2024.github.io`.
  Also consider making the repository private (GitHub Pages from a private repository needs a paid plan).

## News desk · AI (daily incidents → news video)

**Home page → “News desk · AI”** (or **📰 News desk** in the top bar).

- **Finds incidents** of the last 24 h / 3 days / 7 days: floods, flash floods, wildfires, deforestation, earthquakes, landslides, volcanoes, storms, drought, man-made disasters and illegal migration. Sources: USGS earthquakes, NASA EONET, GDACS alerts and world news from GDELT. Reports about the same event are joined and ranked (severity, number of sources and outlets, how recent).
- **Builds the video** for the story you pick: 1 fly / zoom to the incident → 2 pre and post satellite images (real Sentinel-2 scenes from Microsoft Planetary Computer, Sentinel-1 radar for cloudy floods) → 3 damage & analysis (affected area or shaking rings, callout, facts card) → 4 photos and videos (your own files, plus geotagged Wikimedia Commons photos with credits) → 5 end card with the sources.
- **Write with AI** (optional): add your Anthropic API key under *AI settings*. It stays in your browser and is only sent to api.anthropic.com. The AI writes the headline, facts, analysis, voice-over and post text from the feed data only. Without a key, built-in templates write the text. Always check facts against the linked sources before publishing.
- **Every 24 hours**: `.github/workflows/daily-news.yml` runs `tools/news-fetch.mjs` at 02:17 UTC, writes `news/latest.json` (+ `news/archive/<date>.json`) and redeploys the site. The home page then shows **Today’s top story** with **Build today’s video**. Run it any time from the repository’s *Actions → Daily news feed → Run workflow*.

## Briefing layout (new) / Classic layout

**Auto video** and **News desk** have a **Layout** choice. The app remembers the one you pick.
- **Briefing**: the map sits in a framed window on a dark intelligence-briefing background, with no scrolling ticker. **Layout A** has a globe with the country highlighted, the title, and rows for date, place and event on the left, with *Before* / *After* satellite panels under the map. **Layout B** has a header title, a locator map, a *Site analysis (before / after)* panel, a scale bar and a field strip (incident date, location, event, assessment). The end card lists the sources. The camera is moved so the incident stays in the middle of the window.
- **Classic**: the full-screen map with the lower third and scrolling ticker, as before.
- To add a frame by hand, go to **Add → Typography → Frames → Briefing frame**. Every text, the accent colour and the layout (A / B / end) can be edited in the layer settings.
- **Create project** on the home page has a **Layout** choice too: *Standard* (full-screen map), *Briefing A* or *Briefing B*. A briefing project starts with the frame, and every new scene you add gets the same frame. Fill in the place, event and dates in the frame's layer settings.
- **Editing a briefing frame:** select the *Briefing frame* layer.
  - **Move panels:** drag any panel on the video (globe, title, info rows, before, after, locator, field strip, place tag, scale bar). **Panels → Reset** puts them all back.
  - **Before / after images:** choose your own pictures. Set each one's label, date, **zoom** and **move ←→ / ↑↓** to crop it. For satellite before / after images, set the map zoom.
  - **Text:** every text and label (title, subtitle, header line, map tag, field labels, panel titles) is editable in the settings.

## GEO·BRIEF briefing set (multi-scene)

- **Create project → Layout → GEO·BRIEF set** makes 5 scenes with the same text and look: **Intro** (title over a globe), **Dashboard** (title, map window, regional context, before / after, field strip), **Analysis** (globe, title, info rows, before / after), **Full view** (map full frame, title block, mini globe, compact before / after) and **End**. It has a header bar (organisation · GEO·BRIEF · briefing date) and a **Breaking** ticker; switch either off in the frame settings.
- **+ Briefing scene…** (next to *New scene* in the editor) adds another scene in any of these layouts. It copies the text, images and look and starts from the current map view. Add as many as you need.
- **Same text on every scene** (on by default): edit the title, date, place, event, before / after images, header or ticker in one scene and every other briefing scene updates. Turn it off on a scene to give it its own text.
- **Add layers** on any briefing scene as usual: routes, areas, 3D models, callouts and so on. **Add → Typography → Frames → Briefing marker** adds the glowing ring with a label box (e.g. “18:11Z — IMPACT”).
- **Auto video** and **News desk** have a **GEO·BRIEF** layout too. It adds the header bar, an intro card, the full view for the close-up, and the breaking ticker.
- **Logos:** with the header bar on, the frame settings take a **Logo** (left, before the organisation name) and a **Second logo** (right, before the briefing line). They are shared by every scene.
- **Photos section:** the **Photos** layout (from **+ Briefing scene… → Photos**, the 6th scene of the GEO·BRIEF set, or *Add → Typography → Frames*) is a photo slideshow. It shows a big photo with a slow zoom, a counter (PHOTO 02 / 05), captions, credits and a progress bar, with a thumbnail strip, a live map inset and a caption panel. Add photos with **＋ Add photos…**, type a caption and credit for each, reorder or remove them, and set the seconds per photo and the motion (slow zoom, cross-fade, slide). The scene stretches to fit every photo. In Auto video / News desk the *Photos & videos* scene uses this layout automatically.
- **Resize panels:** select the briefing frame. Every panel has a dashed outline; drag the white square at its bottom-right corner to resize it. Boxes (map window, info rows, before / after, locator, side panel, field strip, photo, thumbnails, caption) stretch in width and height. Text panels (titles, globe, tags, logos, north arrow, scale bar) scale evenly. Grab the map window by its border to move it. **Panels → Reset** clears all moves and sizes.
- **Logo size:** use the *Logo — size* / *Second logo — size* sliders, or drag and resize the logos directly on the video.
- **Incident location:** type *lat, lon* or press **◎ Map centre** under *Incident location*. The globe, locator map and place tag then point there on every synced scene. Without it they follow the country you typed, or the middle of the map.
- **Auto video opening:** one smooth, eased move from space down to the place. It ends exactly where the next scene starts, so there is no jump.
- **Parts:** in the frame settings, **Parts — untick to remove one** lists every separate part of the current layout. This includes the globe, title, info rows, before, after, locator, field strip, place label, scale bar, north arrow, photo, thumbnails, caption, title block, the background, the map window frame and the logos. Untick a part to remove it from that scene; tick it to bring it back.
- **Themes:** *Theme → Deep space* gives a black starry background, a glowing grid globe without countries and the Rajdhani tech type, as in the intro image. *Navy — GEO·BRIEF* is the original look. The theme is shared by every synced scene.
- **Layers in front:** the briefing frame is now drawn underneath every other layer. Titles, callouts, points, lines, text and markers you add always sit on top. Map imagery (satellite time series, images, before / after, map videos) stays under the frame. 3D models are drawn by the map itself, so they still stay inside the map window.
- **Every part is its own layer:** briefing scenes are built as separate layers, e.g. *Briefing · Background*, *· Map window frame*, *· Globe*, *· Title*, *· Info rows*, *· Before picture*, *· After picture*, *· Place label*, *· Header bar*, *· Logos*, *· Breaking ticker*. Select, hide (eye) or delete any of them in the layer list, like any other layer. Text, theme and images stay shared. Changing the layout rebuilds the scene's parts for the new layout. An older single-layer frame (or one added from *Add → Typography → Frames*) has a **Split into layers** button.
- **Logos — place:** *Top* puts the logos in the header row; *Bottom* puts them in the bottom band above the ticker. Size them with the sliders, or drag and resize them on the video. The logos work with or without the header bar.
- **Header text:** *Header — show organisation text / show centre title / show briefing line* each switch one text off. The header bar's background, glow arc and lines stay.
- **Logo & lower third (Preview & export):** *Logo place* (top or bottom of the video) and *Logo — move ↑ / ↓* position the logo strip. *Lower third — move ↑ / ↓* lifts the lower third and ticker off the bottom edge.
- **Logos — spread to the sides ← →** pushes the left and right logos of the strip out towards the edges (and back in with negative values) without stretching them. **Logo — move ← / →** shifts the whole strip.
- **Header — show text** (briefing frame): turn it off to keep only the header background, glow arc and line; the text and the short accent lines go.
- **Zoom to location:** **+ Briefing scene… → Zoom to location** adds a scene right after the Intro. The camera flies smoothly from the globe down to the place and ends with a slight tilt; the header, logos, ticker and place label stay on. It flies to the briefing's *Incident location*, else to its country, else to the middle of the map. Setting or changing the Incident location later re-aims every zoom scene. The GEO·BRIEF set now includes this scene as its 2nd scene.
- **Logos never covered:** briefing layouts measure where the project's logo strip ends (from the logo pixels themselves, at the strip's current size and position) and start their panels just below it, or above it when the strip sits at the bottom. While the logo strip is at the top, the briefing header keeps only its background, so the logos sit in it cleanly. Move or resize the strip under *Logo & lower third* and the layouts follow.
- **Build-in animation (like the reference video):** each briefing part draws its corner marks first, then wipes in from the top behind a glowing scan line. The parts come one after another: header, globe / title, map window, locator, before / after, field strip, labels. Before / after pictures, the map window and the slideshow photos all use it (*Photo motion → Scan wipe*). Set *Animation* to *Fade in* or *Shown* on a part to change it.
- **Scene transition — Scan line wipe:** a glowing cyan line sweeps across and reveals the next scene. Briefing scenes use it by default; pick it for any scene under *Preview & export → Join to next scene*.
- **Type:** the GEO·BRIEF look now uses **Rajdhani** for titles, labels and numbers, as in the reference. The earlier look is still there as *Theme → Navy — Archivo type*.
- **Logo strip remembered:** the logo strip's file, size and position (*Logo & lower third*) are remembered. Every new project, GEO·BRIEF set, Auto video and News desk video starts with the logos exactly where you last placed them.
- **Header bar off by default:** new briefings start without the GEO·BRIEF header bar, so your logo strip stands alone. Turn **Header bar** on in any briefing layer's settings to add it to every scene.
- **Logo strip in the header:** with the briefing header bar on (the default again for the GEO·BRIEF set), your logo strip takes the place of the header text. The header band grows to sit behind the whole strip, with its glow arc. **Default logo** under *Logo & lower third* also puts the strip back at the top in its original size and position.
- **Logo alignment (default: Left & right edges):** the logo strip snaps up close to the top. Its left logo lines up with the left margin and its right logo with the right margin, measured from the logo pixels. The centre text stays centred. The ↑ / ↓ and left / right sliders nudge from there; *Free* keeps the strip as drawn in the image.
- **No scrolling text by default:** new GEO·BRIEF sets and GEO·BRIEF videos start without the breaking ticker or the lower third. Switch on *Breaking ticker at the bottom* in a briefing layer, or the lower third under *Logo & lower third*, when you want them.
- **Layer order (front / back):** select any layer — an image, a text, a callout or a briefing part — and use **⤒ Bring to front**, **↑ Forward**, **↓ Backward** or **⤓ Send to back** in its settings. In briefing scenes every layer is stacked exactly in the layer list order, so a text can sit over a photo or behind a panel. *Send to back* stops just above the briefing background so the layer stays visible.
- Zoom to location: in the Zoom scene, search a place or type "lat, lon", Fly there, use the map centre or incident spot; sliders for zoom at end, length, tilt, rotate, globe spin turns and start height; Preview.
- Automatic fire & flood news: one click (home page or News desk) builds Intro → Zoom to location → Pre & post satellite → Photos → Analysis → End. Fires use NASA FIRMS active-fire hotspots (your free MAP_KEY, or the daily feed with the public 24 h VIIRS file); new "Fire hotspots (NASA FIRMS)" layer under Cartography.
- Geopolitics documentary layers (Layers → Geopolitics documentary): round magnifier lens, lens zooming out of the place, rectangle zoom inset, inset cards with title / flag tag, glass bubble, gold 200 nm zone, glowing red danger circle, dashed corridor with text, red hand-drawn circle, measure line with big “3 km”, stem labels, dashed routes with legend, orange / red country highlights.
- Smoother camera: zoom-to-location is one continuous flight (no stop-start between keys); satellite before/after imagery keeps one tile level during slow zooms so it does not shimmer. Lenses, insets and glass bubbles stay put on the screen while their line and ring follow the place (or choose “Moves with the map”).
- SAR open-data library (Layers → Imagery & remote sensing → 📡): ~200 small preview images from ICEYE, Capella Space and Umbra open data (CC BY 4.0) placed on their true footprints, with SAR colour grades (teal, viridis, amber, thermal, ice, night, rainbow, sepia, two-colour), blend modes with the map, contrast / gamma / speckle controls, radar-scan reveal and an automatic credit caption. Previews are refreshed monthly by the “SAR open-data library” GitHub Action.
- Trailer text & sound (Layers → Trailer text & sound): typed location slates with digital ticks, wide metallic trailer title cards with a boom, movie title over embers with braam + hit, credits block, glowing box that decodes, password field with keyboard + “access granted”, dossier fields with a red badge. These play their own sounds even with automatic sound off; new library sounds: typing ticks, keyboard, trailer boom, data decode, access granted.
- Dossier HUD (Layers → Trailer text & sound → 🕵): password intro, red-notice badge, typed fields, photo window with face reticle, face close-up and camera caption, scrolling side photos, static cuts between up to 3 main photos and an RGB glitch out — every photo and text editable, with keyboard / static / glitch sounds. Fixed: lens and zoom insets no longer move twice as far when dragged.
- Proper typewriter (Layers → Trailer text & sound → 📃 / ⌨ / ↔): human key rhythm with pauses after spaces, punctuation and line ends, ink-pressed letters with uneven ink and double strikes, carriage return with bell, optional sliding carriage (the paper moves), paper / index card / dark card / none, typewriter fonts, and one mechanical key sound per letter in sync. The Typography “Typewriter” look now uses the same rhythm and sound.
- Real typing sounds: typewriter keys, space bar, bell and carriage return, and computer keyboard keys are now real recordings (sfx/, built by the “Sound library (typing)” GitHub Action) used by every typing effect — typewriter, slates, hacker text, password, dossier, terminal titles. Recordings: “WWS Typewriter” (Erika 5), Work with Sounds / Wikimedia Commons, CC BY 4.0; “Typewriter ding” by stubb, CC0; IBM Model M / M2 / M13 typing recordings, Wikimedia Commons, CC0.
- Music & text sounds: six music tracks (Sound → Background music, with ▶ Listen, volume and start point; plays even with Sound off, loops if the video is longer, fades out at the end) and a recorded digital-interface text sound. Every text layer has a “Text sound” choice: built-in, typewriter, computer keyboard, digital interface ticks, light ticks or none. Tracks and the interface sound were uploaded by the project owner (Pixabay downloads: AudioAtlant, AtlasAudio, The Mountain, Kulakovka, Alana Jordan, estudiocoati).
- **3D ship collisions** — new built-in *River cruise ship (paddlewheeler)* model and two new 3D-model motions: **Ram** (steady speed into a target, hard stop, recoil; set *Impact at*) and **Capsize** (jolt, then the ship rolls onto its side and settles; set start, duration, roll and sink).
