// Marina Verde — shared constants for the whole game. The city is a 7x7 block grid
// on the north side of a beach; the sea lies to the south (positive Z).
// v2 "Full Tide": 12 story missions in 3 acts, 4 weapons, 3 radio stations,
// 4 shops + safehouse, helicopter police, denser traffic and crowds.
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
// v2 adds deeper downtown tones, beachfront pastels and more car colours.
export const PALETTE = {
  sky: 0x87c5e8,
  skyTop: 0x3f7fc9, // gradient sky: zenith blue
  skyHorizon: 0xffd9a0, // gradient sky: golden horizon
  sea: 0x1e9bb5,
  seaDeep: 0x0f6f8f,
  sand: 0xf2d8a7,
  asphalt: 0x484e57,
  asphaltLight: 0x4a5058,
  sidewalk: 0xcfc4ae,
  grass: 0x69b06a,
  wall: [0xffe3c2, 0xffd9a0, 0xf7c8c8, 0xcfe8e2, 0xfff3d6, 0xe8d9ff, 0xfbe9b7, 0xf3b8a0, 0xa8d8c8, 0xd8c2e8],
  roof: [0xe86a5a, 0x2f6f6a, 0xd9a441, 0x7a9bb5, 0xb5654a, 0x4a6b8a, 0xc25a7a],
  palmTrunk: 0x8a6b4f,
  palmLeaf: 0x46c07a, // v2 polish P1: brighter, lusher fronds (was 0x2f9e5f)
  car: [0xd94040, 0x2f6fd0, 0xf2c230, 0x38b6a0, 0xe8e8e8, 0x2a2f38, 0xc96fd0, 0xf07f2f, 0x9a2fd0, 0x2fd0a8, 0x183a5a, 0xff5a8a],
  shopSign: { gunshop: 0x2f9e5f, garage: 0xf07f2f, clinic: 0x38b6a0, safehouse: 0xffd24a },
  accentBeach: 0xff8a5c,
  accentDowntown: 0x2f6f6a,
};

// Weapons: pistol is Nico's starter; the rest are bought at Verde Arms.
export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Pistol', key: '1', damage: 34, cooldown: 0.28, range: 60, pellets: 1, spread: 0, tracer: 0xffe98a, price: 0, ammoStart: 12, ammoMax: 24, pitch: 900 },
  smg: { id: 'smg', name: 'SMG', key: '2', damage: 16, cooldown: 0.09, range: 45, pellets: 1, spread: 0.03, tracer: 0xffa040, price: 350, ammoStart: 60, ammoMax: 120, pitch: 1400 },
  shotgun: { id: 'shotgun', name: 'Shotgun', key: '3', damage: 12, cooldown: 0.8, range: 25, pellets: 6, spread: 0.09, tracer: 0xffffff, price: 500, ammoStart: 12, ammoMax: 24, pitch: 500 },
  rifle: { id: 'rifle', name: 'Rifle', key: '4', damage: 60, cooldown: 0.9, range: 90, pellets: 1, spread: 0.005, tracer: 0xff4040, price: 800, ammoStart: 10, ammoMax: 30, pitch: 700 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

// Radio stations: all synthesised with WebAudio, no files, no network.
// songs are the "now playing" titles (DESIGN §10.4): they rotate slowly.
export const RADIO_STATIONS = [
  { id: 'verde', name: 'Verde FM', desc: 'chill bass & hats', songs: ['Sunset Drive — The Palms', 'Coral Light — Marina Blue', 'Slow Tide — Nico Vale'] },
  { id: 'neon', name: 'Neon Nights', desc: 'synthwave arpeggio', songs: ['Pink Horizon — Lumen Kids', 'Night Ferry — Vector Nine', 'Chrome Rain — Midnight Static'] },
  { id: 'rock', name: 'Marina Rock', desc: 'power-chord riff', songs: ['Full Tide — The Breakers', 'Salt & Gasoline — Rust Coast', 'High Water — The Gulls'] },
];

// Display names for the car panel (DESIGN §10.5), by body style.
export const CAR_NAMES = { sedan: 'MARINA SEDAN', sport: 'VELOCE GT', van: 'CARGO VAN', police: 'MVPD CRUISER' };

// Shops: gun shop, garage, clinic, safehouse. See shops.js for the UI.
export const SHOPS = [
  {
    id: 'gunshop', name: 'Verde Arms', place: 'gunshop', color: 0x2f9e5f, sign: 'VERDE ARMS',
    items: [
      { id: 'smg', name: 'SMG', price: 350, kind: 'weapon' },
      { id: 'shotgun', name: 'Shotgun', price: 500, kind: 'weapon' },
      { id: 'rifle', name: 'Rifle', price: 800, kind: 'weapon' },
      { id: 'ammo', name: 'Ammo box (+24)', price: 40, kind: 'ammo' },
    ],
  },
  {
    id: 'garage', name: "Rosa's Garage", place: 'garage', color: 0xf07f2f, sign: "ROSA'S GARAGE",
    items: [
      { id: 'repair', name: 'Repair car (full)', price: 150, kind: 'repair' },
      { id: 'repaint', name: 'Repaint car', price: 100, kind: 'repaint' },
    ],
  },
  {
    id: 'clinic', name: 'Coral Clinic', place: 'clinic', color: 0x38b6a0, sign: 'CLINIC',
    items: [
      { id: 'healthkit', name: 'Health kit (full heal)', price: 80, kind: 'health' },
    ],
  },
  {
    id: 'safehouse', name: 'Safehouse', place: 'safehouse', color: 0xffd24a, sign: 'SAFEHOUSE',
    items: [
      { id: 'rest', name: 'Rest & save (free)', price: 0, kind: 'rest' },
    ],
  },
];

export const MISSIONS = [
  {
    id: 'wheels-up',
    act: 1,
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
    act: 1,
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
    id: 'armed-ready',
    act: 1,
    title: '3 · Armed & Ready',
    giver: 'Rosa',
    brief:
      'The next jobs get loud. Verde Arms sells hardware — buy an SMG and learn to switch weapons (keys 1–4, Q cycles).',
    steps: [
      { kind: 'buy', item: 'smg', at: 'gunshop', text: 'Buy an SMG at Verde Arms ($350)' },
    ],
    reward: 200,
  },
  {
    id: 'midnight-taxi',
    act: 1,
    title: '4 · Midnight Taxi',
    giver: 'Rosa',
    brief:
      'A fare is waiting at the Coral Hotel — it\'s Marco, your getaway driver from here on. Drive him to the lighthouse before the clock runs out — 100 seconds, no excuses.',
    steps: [
      { kind: 'timed', at: 'lighthouse', seconds: 100, text: 'Drive the fare to the lighthouse' },
    ],
    reward: 450,
  },
  {
    id: 'heat-wave',
    act: 2,
    title: '5 · Heat Wave',
    giver: 'Marco',
    brief:
      'The marina police are all over you. Lose the heat — break line of sight and stay clean until the stars fade.',
    steps: [{ kind: 'loseWanted', text: 'Lose the wanted level (stars must reach 0)' }],
    reward: 400,
  },
  {
    id: 'tail-job',
    act: 2,
    title: '6 · Tail Job',
    giver: 'Marco',
    brief:
      'A rival is driving a grey sedan through town. Tail it for 20 seconds — stay 8 to 25 metres back. Get closer than 8 m for 3 seconds and you are spotted.',
    steps: [
      { kind: 'follow', seconds: 20, text: 'Tail the grey sedan — stay 8–25 m back' },
    ],
    reward: 550,
  },
  {
    id: 'rooftop-rumble',
    act: 2,
    title: '7 · Rooftop Rumble',
    giver: 'Marco',
    brief:
      'A rival crew is holding the plaza by Verde Tower — four of them, in two waves. A shotgun or rifle helps. Clear them out.',
    steps: [
      { kind: 'defeat', count: 4, at: 'tower', text: 'Clear the rival crew at Verde Tower (4 left)' },
    ],
    reward: 650,
  },
  {
    id: 'quiet-streets',
    act: 2,
    title: '8 · Quiet Streets',
    giver: 'Marco',
    brief:
      'The police doubled their patrols tonight. Reach the safehouse on foot without gaining a single star. Quiet. Slow. Invisible.',
    steps: [
      { kind: 'stealth', at: 'safehouse', text: 'Reach the safehouse on foot — gain 0 stars' },
    ],
    reward: 600,
  },
  {
    id: 'garage-run',
    act: 3,
    title: '9 · Garage Run',
    giver: 'Rosa',
    brief:
      'A red sports coupe is parked at the marina — Marco will drive getaway in it. Steal it, then deliver it to Rosa\'s Garage. She will repair and repaint it on arrival.',
    steps: [
      { kind: 'deliverCar', car: 'sports', at: 'garage', text: 'Steal the red sports coupe at the marina, deliver it to Rosa\'s Garage' },
    ],
    reward: 700,
  },
  {
    id: 'storm-the-pier',
    act: 3,
    title: '10 · Storm the Pier',
    giver: 'Rosa',
    brief:
      'Six rivals hold the marina and the police are at four stars — the helicopter is up. Survive 45 seconds on the pier, then get to the yacht.',
    steps: [
      { kind: 'survive', seconds: 45, at: 'marina', text: 'Survive on the pier for 45 s' },
      { kind: 'goto', at: 'yacht', text: 'Reach the yacht' },
    ],
    reward: 900,
  },
  {
    id: 'long-way-home',
    act: 3,
    title: '11 · The Long Way Home',
    giver: 'Marco',
    brief:
      'A rival driver wants the hospital run too — street race, three checkpoints from the marina to the hospital, 75 seconds, three stars on your tail. Beat the rival sedan there or the job is blown.',
    steps: [
      { kind: 'race', checkpoints: ['raceCp1', 'raceCp2', 'raceCp3'], at: 'hospital', seconds: 75, text: 'Race the rival to the hospital — hit all 3 checkpoints' },
    ],
    reward: 800,
  },
  {
    id: 'grand-getaway',
    act: 3,
    title: '12 · Grand Getaway',
    giver: 'Rosa',
    brief:
      'One last run. Five stars, the helicopter overhead, four police cars on your tail — Marco has the boat ready and drives getaway for the last run. Drive to the yacht at the marina and sail out of Marina Verde a legend.',
    steps: [{ kind: 'goto', at: 'yacht', text: 'Reach the yacht at the marina — with the law on your tail' }],
    reward: 1000,
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
  gunshop: { x: -43, z: -78, label: 'Verde Arms' },
  garage: { x: 112, z: 168, label: "Rosa's Garage" },
  clinic: { x: -112, z: 95, label: 'Coral Clinic' },
  safehouse: { x: 60, z: 130, label: 'Safehouse' },
  towerRoof: { x: 26, z: 26, label: 'Verde Tower Plaza' },
  pier2: { x: 130, z: 210, label: 'Pier End' },
  raceCp1: { x: 0, z: 182, label: 'Checkpoint 1' },
  raceCp2: { x: -104, z: 182, label: 'Checkpoint 2' },
  raceCp3: { x: -104, z: 156, label: 'Checkpoint 3' },
  raceStart: { x: 104, z: 182, label: 'Street Race Start' },
};

// Named districts (9, DESIGN §11 / G-TOP1 — more than Coralina's 8):
// Lighthouse Point, Palm Row, Old Market, Downtown, Northgate, West End,
// Eastside. districtAt is used by the HUD label and the Turf Ledger
// (jobs per district). Order matters: the small quarters are checked
// before the big zones that contain them.
export function districtAt(x, z) {
  if (z >= 182) return 'Beachfront';
  if (x >= 104 && z >= 156) return 'Marina';
  if (x <= -104 && z >= 104) return 'Lighthouse Point';
  if (z > 104 && z < 182 && Math.abs(x) < 104) return 'Palm Row';
  if (x >= -52 && x <= 52 && z >= -104 && z <= -52) return 'Old Market';
  if (Math.abs(x) <= 104 && Math.abs(z) <= 104) return 'Downtown';
  if (z < -104 && Math.abs(x) <= 104) return 'Northgate';
  if (x < -104) return 'West End';
  if (x > 104) return 'Eastside';
  return 'Marina Verde';
}

// Turf Ledger: rep 0–3 = acts completed; shop discount 5% per rep level.
export function repDiscount(rep) {
  return Math.min(0.15, 0.05 * rep);
}
export function discountedPrice(price, rep) {
  return Math.max(0, Math.round(price * (1 - repDiscount(rep))));
}

export const STORY_INTRO =
  'Marina Verde — a sun-soaked coastal city of pastel towers, palm-lined boulevards and one very bad idea. ' +
  'You are Nico Vale, a courier with no money and a fast car problem. Rosa runs the crew, Marco drives getaway. ' +
  'Twelve jobs. One way out. Don\'t get caught.';
