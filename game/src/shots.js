// Marina Verde — screenshot staging. Each named shot arranges the real game
// state (player, cars, police, mission, wanted level) and the camera, then the
// normal loop renders it, so every screenshot is a genuine frame of the game.
// ?shot=cover|chase|street|hud — window.__shotReady is set by main.js once
// a few frames have rendered. Banners are suppressed for the shots: the
// mission panel at the top left already tells the story.
// v2 §10 (SCREENSHOTS.md §4): cover = HERO Act III chase at sunset (MVPD
// panel, money + wanted + clock, weapon slots, minimap + district + REP bar,
// dialog + portrait, radio + car panel, heli + police + living city);
// chase = on-foot night neon; street = Verde Arms shop open over the street;
// hud = full map screen + Turf Ledger + 12-mission list.
import { PLACES, SHOPS } from './config.js';
import { startMission } from './missions.js';
import { giveWeapon } from './weapons.js';
import { showDialog } from './hud.js';

function placePlayer(game, x, z, heading) {
  game.playerX = x;
  game.playerZ = z;
  game.playerHeading = heading;
  game.playerMesh.position.set(x, 0, z);
  game.playerMesh.rotation.y = heading;
  game.cameraYaw = heading;
}

function noBanner(game) {
  game.missions.banner = null;
}

export function stageShot(name, game, ctx) {
  const { enterCar, spawnPoliceIfNeeded, spawnRivals, spawnRivalsAt, spawnSportsCoupe, spawnHeliIfNeeded, audio, world, hud, openShop, openMap } = ctx;
  game.time = 0;

  if (name === 'chase') {
    // On-foot night neon (SCREENSHOTS.md §4.2): Nico on foot downtown at
    // night, pistol drawn, wanted 3, a police car closing in, dialog + radio.
    // Mission 5 (Heat Wave — lose the wanted level) fits the scene exactly.
    world.setSkyMode('night');
    game.clock = 21 * 60 + 30;
    startMission(game.missions, game, 4);
    noBanner(game);
    placePlayer(game, 0, 104, Math.PI);
    game.wanted.stars = 3;
    game.wanted.heat = 0;
    spawnPoliceIfNeeded();
    game.policeCars.forEach((pc, i) => {
      // Ahead of the player, in the camera's view direction, closing in.
      pc.x = game.playerX + 20 + i * 9;
      pc.z = game.playerZ + (i === 0 ? 6 : -4);
      pc.heading = -Math.PI / 2;
      pc.speed = 18;
      pc.mesh.position.set(pc.x, 0, pc.z);
    });
    giveWeapon(game.arsenal, 'smg');
    game.arsenal.ammo.smg = 60;
    game.arsenal.current = 'pistol';
    game.arsenal.ammo.pistol = 12;
    game.radio.station = 2; // Marina Rock
    game.money = 1250;
    // 600 s: the dialog must still be up when the capture lands — __shotReady
    // takes >8 real seconds on swiftshader, and the timer is real-time.
    showDialog(hud, 'Marco', 'Three stars, Nico. Break line of sight, stay clean, and let the heat die down.', 600);
    game.cameraYaw = Math.PI - 2.6;
    game.cameraPitch = 0.24;
    game.objective = '5 · Heat Wave: Lose the wanted level (stars must reach 0)';
    return;
  }

  if (name === 'street') {
    // Verde Arms open over the street (SCREENSHOTS.md §4.3): mission 3,
    // Nico at the gun shop door, the real shop UI open, cash line visible.
    world.setSkyMode('day');
    game.clock = 16 * 60 + 40;
    startMission(game.missions, game, 2);
    noBanner(game);
    placePlayer(game, -48.2, -74, Math.PI);
    game.money = 540;
    game.radio.station = 0; // Verde FM
    game.cameraYaw = Math.PI + 0.15;
    game.cameraPitch = 0.3;
    const shop = SHOPS.find((s) => s.id === 'gunshop');
    openShop(shop);
    game.objective = '3 · Armed & Ready: Buy an SMG at Verde Arms ($350)';
    return;
  }

  if (name === 'hud') {
    // Full map + Turf Ledger (SCREENSHOTS.md §4.4): mission 12 active,
    // ledger mid-game, the real map screen open (game paused).
    world.setSkyMode('day');
    game.clock = 12 * 60;
    startMission(game.missions, game, 11);
    noBanner(game);
    game.ledger.rep = 2;
    game.ledger.jobsByDistrict = { Beachfront: 3, Downtown: 3, 'Old Market': 2, Marina: 3 };
    game.ledger.races = { played: 3, wins: 2, bestMs: 68400 };
    game.money = 5240;
    game.radio.station = 1; // Neon Nights
    placePlayer(game, 0, 104, 0);
    openMap();
    game.objective = '12 · Grand Getaway: Reach the yacht at the marina — with the law on your tail';
    return;
  }

  // Default: cover. HERO chase at sunset (SCREENSHOTS.md §4.1): Act III
  // Grand Getaway, wanted 4, helicopter + spotlight, 3 police on the tail,
  // sports coupe, traffic + pedestrians, neon billboard, sunset sky.
  world.setSkyMode('sunset');
  game.clock = 18 * 60 + 52;
  startMission(game.missions, game, 11);
  noBanner(game);
  const car = spawnSportsCoupe(); // red sports coupe as the getaway car
  car.x = 40;
  car.z = 182;
  car.heading = Math.PI / 2;
  car.mesh.position.set(40, 0, 182);
  car.mesh.rotation.y = Math.PI / 2;
  placePlayer(game, 40, 178, Math.PI / 2);
  enterCar(car);
  game.playerCar.speed = 26;
  game.playerCar.health = 82; // CONDITION 82% — a chase leaves marks
  game.wanted.stars = 4;
  game.wanted.heat = 0;
  spawnHeliIfNeeded();
  game.heli.angle = 2.4; // in front of the chase cam (cameraYaw -0.83 looks
  // west-northwest): angle 0.35 puts the heli BEHIND the camera
  game.heli.height = 8; // low enough to sit inside the frame, not at its edge
  spawnPoliceIfNeeded();
  // Pull the police in close behind the player for a real chase frame.
  game.policeCars.forEach((pc, i) => {
    pc.x = game.playerX - 12 - i * 9;
    pc.z = game.playerZ + (i === 0 ? 2 : -3);
    pc.heading = Math.PI / 2;
    pc.speed = 24;
    pc.mesh.position.set(pc.x, 0, pc.z);
  });
  // Two traffic cars ahead on the same road, for a living street.
  game.trafficCars.slice(0, 2).forEach((tc, i) => {
    tc.x = game.playerX + 48 + i * 30;
    tc.z = 182 + (i === 0 ? 2.4 : -2.4);
    tc.heading = Math.PI / 2;
    tc.speed = 10;
    tc.ai.axis = 'x';
    tc.ai.dir = 1;
    tc.mesh.position.set(tc.x, 0, tc.z);
  });
  // A few pedestrians on the sidewalk by the neon billboard (60, 176).
  game.peds.slice(0, 3).forEach((p, i) => {
    p.x = 54 + i * 6;
    p.z = 176;
    p.mesh.position.set(p.x, 0, p.z);
  });
  // Mid-game loadout for the weapon slots + ledger for the REP bar.
  giveWeapon(game.arsenal, 'smg');
  giveWeapon(game.arsenal, 'shotgun');
  game.arsenal.ammo.smg = 120;
  game.arsenal.ammo.shotgun = 18;
  game.arsenal.current = 'smg';
  game.ledger.rep = 2;
  game.ledger.jobsByDistrict = { Beachfront: 3, Downtown: 3, 'Old Market': 2, Marina: 3 };
  game.radio.station = 1; // Neon Nights on the radio line
  game.money = 38420;
  // 600 s: the dialog must still be up when the capture lands — __shotReady
  // takes >8 real seconds on swiftshader, and the timer is real-time.
  showDialog(hud, 'Rosa', 'The whole force is coming. Drive to the yacht — don\'t stop for anything.', 600);
  game.cameraYaw = Math.PI / 2 - 2.4; // camera ahead-side, looking back: police in frame behind the player
  game.cameraPitch = 0.2;
  game.objective = '12 · Grand Getaway: Reach the yacht at the marina — with the law on your tail';
}
