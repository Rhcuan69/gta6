// Every tuning number and colour in one place. The world is a 3600x3600 port city,
// Neon Harbor: a 10x10 road grid, a harbour strip along the south edge, and one
// block per lot between the roads. The renderer shows a 1280x720 window of it.

export const STEP = 1 / 60;

export const WORLD = { size: 3600, pitch: 360, road: 110, roads: 10 };
/** The harbour water starts here (south strip); the pier road runs just above it. */
export const HARBOR_Y = 3340;

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchRange: 40,
  punchDamage: 34,
  punchCooldown: 0.42,
  shootCooldown: 0.22,
  shootRange: 340,
  shootDamage: 45,
};

export const CAR = {
  length: 54,
  width: 26,
  radius: 17,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  turnRate: 2.6,
  drag: 0.55,
  hp: 100,
};

export const TRAFFIC = { count: 14, speedMin: 120, speedMax: 185, parked: 7 };
export const PEDS = { count: 18 };
export const POLICE = { maxActive: 5, chaseSpeed: 520, spawnDist: 700, despawnDist: 1400 };

/** Heat 0-100 maps to wanted stars; crimes add heat, quiet time sheds it. */
export const WANTED = {
  thresholds: [12, 30, 50, 70, 90],
  decayQuiet: 1.6,
  decaySeen: 0.35,
  stealCar: 22,
  stealCarSeen: 34,
  punchPed: 18,
  killPed: 45,
  shoot: 26,
  runOver: 40,
  ramCop: 30,
};

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'MISSION 1 — FIRST WHEELS',
    brief: 'Otto needs a car, any car. Grab one off the street and bring it to the chop shop on Marlin Row. Walk up to a car and press E to take it.',
    reward: 500,
    steps: [
      { kind: 'enterCar', label: 'Steal a car (walk up to one, press E)' },
      { kind: 'goto', x: 2592, y: 828, label: 'Deliver the car to the Chop Shop', needCar: true },
    ],
  },
  {
    id: 'drop',
    title: 'MISSION 2 — THE DROP',
    brief: 'A package is waiting on the pier. Pick it up and deliver it to Otto’s Bar — and keep it quiet. The harbour cops are already watching the docks.',
    reward: 1200,
    steps: [
      { kind: 'goto', x: 1800, y: 3300, label: 'Pick up the package on the pier' },
      { kind: 'goto', x: 828, y: 828, label: 'Deliver the package to Otto’s Bar', armed: true },
    ],
  },
  {
    id: 'run',
    title: 'MISSION 3 — HARBOUR RUN',
    brief: 'The drop was hot. Three stars and the whole harbour precinct on your tail. Lose them — or outrun them — and get to the safehouse on Coral Lane.',
    reward: 2500,
    steps: [
      { kind: 'evade', x: 468, y: 2592, label: 'Reach the safehouse — lose the cops or outrun them', wanted: 3 },
    ],
  },
];

export const PALETTE = {
  backdrop: '#14101f',
  grass: '#233d2a',
  sidewalk: '#3a3f4a',
  asphalt: '#23262e',
  roadLine: '#c9a227',
  curb: '#4a4f5c',
  water: '#14324a',
  waterDeep: '#0e2438',
  pier: '#5a4632',
  buildingRoof: ['#7a4a5e', '#4a6a7a', '#6a5a8a', '#8a6a4a', '#5e7a4a', '#7a3f3f', '#3f5a6e', '#8a7a3f'],
  buildingEdge: '#1c1a26',
  parkTree: '#2f7a3d',
  parkTreeDark: '#256633',
  player: '#ffd23f',
  playerOutline: '#1c1a26',
  police: '#e8e8f0',
  policeDark: '#1c2a4a',
  pedShirt: ['#e5534b', '#4fc3f7', '#f2c94c', '#9b7ede', '#7ede9b', '#f78fb3', '#f5f5f5', '#ff9f43'],
  cash: '#7ee081',
  health: '#ff6b81',
  ammo: '#f2c94c',
  gun: '#c9c9d6',
  hudBg: 'rgba(12, 10, 22, 0.72)',
  hudText: '#f2ede4',
  hudMuted: '#a8a29a',
  star: '#ffd23f',
  starEmpty: '#5a5468',
  mission: '#ffd23f',
  danger: '#ff5252',
  panel: '#171223',
  panelEdge: '#ffd23f',
  minimapBg: 'rgba(12, 10, 22, 0.78)',
  minimapRoad: '#565b68',
  minimapWater: '#14324a',
  titleA: '#ff5e7a',
  titleB: '#ffd23f',
  sky: '#2a1e3f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save.v1';
export const BEST_KEY = 'neon-harbor.best.v1';
