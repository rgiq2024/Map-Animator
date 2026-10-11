// Ways to travel. Each leg of a route has one. `rot` is the direction the emoji glyph points
// (degrees, 0 = east, clockwise) for icons that should turn with the route; omit to keep them upright.
export const MODE_GROUPS = [
  { name: 'Simple', modes: ['line'] },
  { name: 'On foot', modes: ['walk', 'run', 'hike', 'horse'] },
  { name: 'On land', modes: ['car', 'caravan', 'motorhome', 'bus', 'truck', 'tuktuk', 'motorcycle', 'offroad', 'atv', 'snowmobile', 'bicycle', 'steamtrain', 'train', 'speedtrain', 'tram'] },
  { name: 'On water', modes: ['boat', 'sailboat', 'cruise', 'ferry', 'kayak'] },
  { name: 'In the air', modes: ['plane', 'helicopter', 'balloon', 'paraglider', 'rocket'] },
  { name: 'Military & space · 3D', modes: ['jet3d', 'airliner3d', 'heli3d', 'drone3d', 'quad3d', 'missile3d', 'warship3d', 'cargo3d', 'sub3d', 'tank3d', 'sat3d'] },
];

export const MODES = {
  line:       { label: 'Plain line', icon: null, style: 'solid' },
  walk:       { label: 'Walk', icon: '🚶', style: 'dotted', route: 'foot' },
  run:        { label: 'Run', icon: '🏃', style: 'dotted', route: 'foot' },
  hike:       { label: 'Hike', icon: '🥾', style: 'dotted', route: 'foot' },
  horse:      { label: 'Horse', icon: '🐎', style: 'dotted', route: 'foot' },
  car:        { label: 'Car', icon: '🚗', style: 'solid', route: 'car' },
  caravan:    { label: 'Car with caravan', icon: '🚙', style: 'solid', route: 'car' },
  motorhome:  { label: 'Motorhome', icon: '🚐', style: 'solid', route: 'car' },
  bus:        { label: 'Bus', icon: '🚌', style: 'solid', route: 'car' },
  truck:      { label: 'Truck', icon: '🚚', style: 'solid', route: 'car' },
  tuktuk:     { label: 'Tuk-tuk', icon: '🛺', style: 'solid', route: 'car' },
  motorcycle: { label: 'Motorcycle', icon: '🏍️', style: 'solid', route: 'car' },
  offroad:    { label: '4WD', icon: '🛻', style: 'dashed', route: 'car' },
  atv:        { label: 'ATV', icon: '🏎️', style: 'dashed' },
  snowmobile: { label: 'Snowmobile', icon: '🛷', style: 'dashed' },
  bicycle:    { label: 'Bicycle', icon: '🚲', style: 'solid', route: 'bike' },
  steamtrain: { label: 'Steam train', icon: '🚂', style: 'rail' },
  train:      { label: 'Train', icon: '🚆', style: 'rail' },
  speedtrain: { label: 'Speed train', icon: '🚄', style: 'rail' },
  tram:       { label: 'Tram', icon: '🚋', style: 'rail' },
  boat:       { label: 'Boat', icon: '🚤', style: 'dashed' },
  sailboat:   { label: 'Sailboat', icon: '⛵', style: 'dashed' },
  cruise:     { label: 'Cruise ship', icon: '🛳️', style: 'dashed' },
  ferry:      { label: 'Ferry', icon: '⛴️', style: 'dashed' },
  kayak:      { label: 'Kayak', icon: '🛶', style: 'dotted' },
  plane:      { label: 'Plane', icon: '✈️', style: 'dashed', air: true, rot: -45 },
  helicopter: { label: 'Helicopter', icon: '🚁', style: 'dashed', air: true },
  balloon:    { label: 'Hot-air balloon', icon: '🎈', style: 'dotted', air: true },
  paraglider: { label: 'Paraglider', icon: '🪂', style: 'dotted', air: true },
  rocket:     { label: 'Rocket', icon: '🚀', style: 'dashed', air: true, rot: -45 },
  jet3d:      { label: 'Fighter jet', icon: '🛩️', sprite: 'jet', style: 'dashed', air: true },
  airliner3d: { label: 'Airliner (3D)', icon: '✈️', sprite: 'airliner', style: 'dashed', air: true },
  heli3d:     { label: 'Helicopter (3D)', icon: '🚁', sprite: 'helicopter', style: 'dotted' },
  drone3d:    { label: 'Drone', icon: '🛸', sprite: 'drone', style: 'dotted' },
  quad3d:     { label: 'Quadcopter', icon: '🛸', sprite: 'quad', style: 'dotted' },
  missile3d:  { label: 'Missile', icon: '🚀', sprite: 'missile', style: 'solid', air: true },
  warship3d:  { label: 'Warship', icon: '🚢', sprite: 'warship', style: 'dashed' },
  cargo3d:    { label: 'Cargo ship', icon: '🚢', sprite: 'cargo', style: 'dashed' },
  sub3d:      { label: 'Submarine', icon: '🚢', sprite: 'submarine', style: 'dotted' },
  tank3d:     { label: 'Tank', icon: '🪖', sprite: 'tank', style: 'dashed', route: 'car' },
  sat3d:      { label: 'Satellite', icon: '🛰️', sprite: 'satellite', style: 'dashed', air: true },
};

export const LINE_STYLES = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', rail: 'Railway' };

export const modeOf = (leg) => MODES[leg?.mode] || MODES.line;
export const lineStyleOf = (leg) => leg?.lineStyle || modeOf(leg).style || 'solid';
