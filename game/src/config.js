// Marina Verde — shared constants for the whole game. The city is a 7x7 block grid
// on the north side of a beach; the sea lies to the south (positive Z).
export const CITY = {
  name: 'Marina Verde',
  // Road centrelines sit every BLOCK_STEP metres; roads are ROAD_W wide.
  BLOCK_STEP: 52,
  ROAD_W: 12,
  GRID: 7, // roads at -3..+3 steps
  SEED: 20261118,
};

// Road centrelines, for traffic, pedestrians, the world builder and the minimap.
export const ROAD_LINES = [];
for (let i = -3; i <= 3; i += 1) {
  ROAD_LINES.push({ axis: 'x', at: i * CITY.BLOCK_STEP }); // road runs along X at z = at
  ROAD_LINES.push({ axis: 'z', at: i * CITY.BLOCK_STEP }); // road runs along Z at x = at
}

// Derived extents.
export const ROAD_MIN = -3 * CITY.BLOCK_STEP; // -156
export const ROAD_MAX = 3 * CITY.BLOCK_STEP; // +156
export const BEACH_Z = 190; // sand band starts here
export const SEA_Z = 235; // water starts here
export const CITY_HALF = ROAD_MAX + CITY.BLOCK_STEP / 2; // ~182

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
};

export const CAR = {
  accel: 16,
  brake: 30,
  maxSpeed: 38, // ~137 km/h, arcade
  maxReverse: 10,
  turnRate: 1.9,
  grip: 6,
};

export const WANTED = {
  decaySeconds: 26, // one star fades after this long with no crime
  maxStars: 5,
};

// Palette: sun-soaked coastal — warm sand, teal sea, pastel walls, coral roofs.
export const PALETTE = {
  sky: 0x87c5e8,
  sea: 0x1e9bb5,
  seaDeep: 0x0f6f8f,
  sand: 0xf2d8a7,
  asphalt: 0x3a3f46,
  asphaltLight: 0x4a5058,
  sidewalk: 0xcfc4ae,
  grass: 0x69b06a,
  wall: [0xffe3c2, 0xffd9a0, 0xf7c8c8, 0xcfe8e2, 0xfff3d6, 0xe8d9ff, 0xfbe9b7],
  roof: [0xe86a5a, 0x2f6f6a, 0xd9a441, 0x7a9bb5, 0xb5654a],
  palmTrunk: 0x8a6b4f,
  palmLeaf: 0x2f9e5f,
  car: [0xd94040, 0x2f6fd0, 0xf2c230, 0x38b6a0, 0xe8e8e8, 0x2a2f38, 0xc96fd0, 0xf07f2f],
};

export const MISSIONS = [
  {
    id: 'wheels-up',
    title: '1 · Wheels Up',
    giver: 'Rosa',
    brief:
      'Rosa needs wheels, fast. Any car on the street will do — borrow one and don\'t ask whose it is.',
    steps: [
      { kind: 'enterCar', text: 'Get in a car (walk up to one and press E)' },
    ],
    reward: 150,
  },
  {
    id: 'sunset-courier',
    title: '2 · Sunset Courier',
    giver: 'Rosa',
    brief:
      'A parcel is waiting at the beach kiosk. Pick it up, then drop it at the Coral Hotel before the sun sets.',
    steps: [
      { kind: 'goto', at: 'kiosk', text: 'Pick up the parcel at the beach kiosk' },
      { kind: 'goto', at: 'hotel', text: 'Deliver the parcel to the Coral Hotel' },
    ],
    reward: 300,
  },
  {
    id: 'heat-wave',
    title: '3 · Heat Wave',
    giver: 'Marco',
    brief:
      'The marina police are all over you. Lose the heat — break line of sight and stay clean until the stars fade.',
    steps: [{ kind: 'loseWanted', text: 'Lose the wanted level (stars must reach 0)' }],
    reward: 400,
  },
  {
    id: 'the-drop',
    title: '4 · The Drop',
    giver: 'Marco',
    brief:
      'A rival crew is guarding the drop in the old market alley. Take the package — on foot, and watch your back.',
    steps: [
      { kind: 'goto', at: 'alley', text: 'Reach the market alley on foot' },
      { kind: 'defeat', count: 2, text: 'Deal with the rival crew (2 left)' },
      { kind: 'goto', at: 'marina', text: 'Deliver the package to the marina' },
    ],
    reward: 500,
  },
  {
    id: 'grand-getaway',
    title: '5 · Grand Getaway',
    giver: 'Rosa',
    brief:
      'One last run. The whole force is coming — drive to the yacht at the marina and sail out of Marina Verde a legend.',
    steps: [{ kind: 'goto', at: 'yacht', text: 'Reach the yacht at the marina — with the law on your tail' }],
    reward: 800,
  },
];

// Named places missions and screenshots use (world coordinates).
export const PLACES = {
  kiosk: { x: 78, z: 196, label: 'Beach Kiosk' },
  hotel: { x: -78, z: -26, label: 'Coral Hotel' },
  alley: { x: 26, z: -78, label: 'Market Alley' },
  marina: { x: 130, z: 176, label: 'Marina' },
  yacht: { x: 150, z: 168, label: 'Yacht' },
  hospital: { x: -104, z: 104, label: 'Hospital' },
  tower: { x: 26, z: 26, label: 'Verde Tower' },
  lighthouse: { x: -170, z: 205, label: 'Lighthouse' },
  spawn: { x: 0, z: 120, label: 'Spawn' },
};

export const STORY_INTRO =
  'Marina Verde — a sun-soaked coastal city of pastel towers, palm-lined boulevards and one very bad idea. ' +
  'You are Nico Vale, a courier with no money and a fast car problem. Rosa and Marco have work for you. ' +
  'Five jobs. One way out. Don\'t get caught.';
