// Ember Vice — config.js
// One job: every tunable constant, the city layout and the mission story data.
// Nothing here touches the DOM or three.js; main.js reads it and wires the rest.

// ---- World layout -----------------------------------------------------------
export const CITY = {
  // Street centre lines (both axes), spacing 60 m, road width 12 m.
  streets: [-180, -120, -60, 0, 60, 120, 180],
  roadHalf: 6,
  block: 48,          // block size between streets
  bound: 210,         // drivable city edge (west / north / south)
  beachX: 210,        // beach starts here (east edge)
  oceanX: 246,        // water starts here
  size: 520,          // ground plane side (covers city + ocean)
};

export const COLOURS = {
  skyTop: 0x2f6fb2,
  skyHorizon: 0xffc98a,   // golden-hour horizon
  sun: 0xffd9a0,
  sunIntensity: 2.4,
  hemiSky: 0x9db8d6,
  hemiGround: 0x5a4a3a,
  fog: 0xf2b27d,
  asphalt: 0x33363c,
  sidewalk: 0x8d8578,
  sand: 0xe0c188,
  water: 0x1d6f8f,
  grass: 0x4d7a45,
};

// ---- Player / driving -------------------------------------------------------
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  accel: 26,
  jumpSpeed: 7.5,
  gravity: 22,
  health: 100,
  startCash: 150,
  startPos: { x: -52, z: -44 },   // outside Lena's bar
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,        // ~150 km/h
  maxReverse: 12,
  steerMax: 0.55,      // radians at standstill
  grip: 6.5,
  drag: 0.35,
};

export const TRAFFIC = {
  count: 12,
  parked: 9,
  speedMin: 8,
  speedMax: 14,
};

export const PEDS = { count: 18 };

// ---- Wanted / police --------------------------------------------------------
export const WANTED = {
  // heat thresholds per star
  stars: [0, 25, 60, 120, 200, 300],
  decayPerSec: 2.2,        // heat lost while no police can see the player
  decayHiddenPerSec: 6,    // faster while hidden
  crimeSteal: 30,          // stealing a car in sight of police
  crimeStealQuiet: 8,      // stealing unseen
  crimeHitPed: 45,
  crimeShoot: 35,
  crimeKillCop: 90,
  crimeSpeeding: 0,        // speeding alone is not a crime here
  maxStars: 5,
  // police cars per star level (index = stars)
  copCars: [0, 0, 1, 2, 3, 4],
  footCops: [0, 1, 1, 2, 2, 3],
  bustRadius: 1.6,         // a foot cop this close arrests the player
  bustTime: 1.6,           // seconds inside the radius before "BUSTED"
  sightRange: 90,
};

// ---- Combat -----------------------------------------------------------------
export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 70,
  pistolAmmo: 12,
  pistolReserve: 120,
  reloadTime: 1.1,
  fireInterval: 0.22,
  punchDamage: 12,
  punchRange: 2.2,
  enemyHealth: 100,
  copHealth: 100,
};

// ---- Missions: the Ember Vice story ----------------------------------------
// Dario Cruz, a getaway driver back in Solmar after five years away, owes a
// debt to Lena Marlowe, who runs The Rusty Anchor bar. The Vultures, Sal
// Ferraro's crew, want the same streets. Five jobs, one way out.
export const MISSIONS = [
  {
    id: 'first-gear',
    title: '1 — First Gear',
    brief: 'Lena wants to see you. Drive to The Rusty Anchor bar and walk inside the gold marker.',
    type: 'goto',
    target: { x: -60, z: -60, label: "The Rusty Anchor" },
    radius: 6,
    reward: 200,
    intro: 'LENA: "Dario. Five years, and you still park like a tourist. Come inside."',
    outro: 'LENA: "One job and your debt is clean. A package is waiting at the docks."',
  },
  {
    id: 'package-run',
    title: '2 — Package Run',
    brief: 'Pick up the package at the marina, then deliver it to the Solmar Motel before the timer runs out.',
    type: 'pickup-deliver',
    pickup: { x: 222, z: 60, label: 'Marina pickup' },
    target: { x: -120, z: 120, label: 'Solmar Motel' },
    radius: 6,
    timeLimit: 150,
    reward: 450,
    intro: 'LENA: "The package is at the marina. Motel, room 7. Do not stop for anyone."',
    outro: 'COURIER: "Right on time. Lena says you drive like you mean it."',
  },
  {
    id: 'hot-wheels',
    title: '3 — Hot Wheels',
    brief: 'Steal the red Comet GT parked by the bank and deliver it to Vega Garage. The cops will not like it.',
    type: 'steal-deliver',
    carSpot: { x: 66, z: 8 },
    target: { x: 120, z: -120, label: 'Vega Garage' },
    radius: 7,
    reward: 800,
    intro: 'LENA: "Sal keeps a Comet GT by the bank. Take it. Bring it to your garage, quiet-like."',
    outro: 'LENA: "Beautiful. That car pays half your debt by itself."',
  },
  {
    id: 'dockside-heat',
    title: '4 — Dockside Heat',
    brief: 'The Vultures are waiting at the marina. Take out all four of them, then get clear.',
    type: 'eliminate',
    target: { x: 222, z: 60, label: 'Marina' },
    radius: 10,
    enemies: 4,
    reward: 1000,
    intro: 'SAL (radio): "Cruz. You took my car. My boys at the marina want a word."',
    outro: 'LENA: "Four down. Sal will not forget this — and neither will I."',
  },
  {
    id: 'the-big-score',
    title: '5 — The Big Score',
    brief: 'Grab the cash from Solmar National Bank, then lose the cops and reach the safehouse at Vega Garage.',
    type: 'rob-escape',
    target: { x: 60, z: 0, label: 'Solmar National Bank' },
    escape: { x: 120, z: -120, label: 'Vega Garage safehouse' },
    radius: 7,
    reward: 2500,
    intro: 'LENA: "Last job. The bank, the van, the garage. After this, Dario, you are free."',
    outro: 'LENA: "It is done. Solmar is yours now, Dario. Drive like you own it — because you do."',
  },
];

export const COLLECTIBLES = {
  count: 10,
  reward: 250,
  label: 'Ember stash',
};

// Landmark buildings with signs (position = block centre).
export const LANDMARKS = [
  { name: "The Rusty Anchor", kind: 'bar', x: -60, z: -60, color: 0x7a4a2b, h: 14 },
  { name: 'Solmar Motel', kind: 'motel', x: -120, z: 120, color: 0x3f6d8e, h: 12 },
  { name: 'Solmar National Bank', kind: 'bank', x: 60, z: 0, color: 0x8e8a7a, h: 26 },
  { name: 'Vega Garage', kind: 'garage', x: 120, z: -120, color: 0x5a5f6a, h: 10 },
  { name: 'Solmar General Hospital', kind: 'hospital', x: 0, z: 120, color: 0xd8d3c3, h: 20 },
  { name: 'Solmar Police HQ', kind: 'police', x: 120, z: 60, color: 0x2f4a6b, h: 22 },
  { name: 'Marina', kind: 'marina', x: 222, z: 60, color: 0x6b7a6a, h: 8 },
];

export const SAVE_KEY = 'ember-vice-save-v1';

// Small helpers shared by the game modules.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function fmtCash(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
