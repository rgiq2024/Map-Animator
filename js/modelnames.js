// Names of the built-in 3D models (kept separate so menus don't need to load three.js).
export const BUILTIN_MODELS = {
  // aircraft
  jet: 'Fighter jet', bomber: 'Stealth bomber', cargoplane: 'Cargo plane (4 propellers)', airliner: 'Airliner', helicopter: 'Helicopter', drone: 'Drone (UAV)',
  nasa_globalhawk: 'Global Hawk drone · realistic (NASA)',
  // land
  train: 'Train (locomotive + coaches)', freight: 'Freight train', tram: 'Tram / metro', car: 'Car', bus: 'Bus', truck: 'Truck', tank: 'Tank',
  // sea
  warship: 'Warship', containership: 'Container ship', tanker: 'Oil tanker', boat: 'Speed boat',
  // space
  missile: 'Missile', rocket: 'Rocket', satellite: 'Satellite', iss: 'Space station',
  nasa_goes: 'GOES weather satellite · realistic (NASA)', nasa_landsat: 'Landsat 8 · realistic (NASA)', nasa_terra: 'Terra satellite · realistic (NASA)',
  nasa_hubble: 'Hubble telescope · realistic (NASA)', nasa_iss: 'ISS · realistic (NASA)', nasa_shuttle: 'Space Shuttle · realistic (NASA)',
  // structures
  skyscraper: 'Skyscraper', tower: 'Tall tower (spire)', house: 'House', windturbine: 'Wind turbine', oilrig: 'Oil rig', lighthouse: 'Lighthouse',
};
export const MODEL_CHOICES = Object.fromEntries(Object.entries(BUILTIN_MODELS).map(([k, v]) => [`builtin:${k}`, v]));
