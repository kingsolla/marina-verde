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
import { getShotPreset } from './graphics-polish.js';

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

  if (name === 'beach') {
    // Capture-only coastal day shot (concept 2): the VELOCE GT on the
    // beachfront road heading WEST toward the ferris wheel, palms left,
    // sea right, one police car + a yellow taxi ahead. NOT one of the 4
    // dossier shots. stepState.started is set so the mission-12 setup
    // (5 stars + heli) does not override the staged 2 stars.
    world.setSkyMode('day');
    game.clock = 14 * 60 + 31;
    startMission(game.missions, game, 11);
    game.missions.stepState.started = true;
    noBanner(game);
    const car = spawnSportsCoupe();
    car.x = 118;
    car.z = 182;
    car.heading = -Math.PI / 2;
    car.mesh.position.set(118, 0, 182);
    car.mesh.rotation.y = -Math.PI / 2;
    placePlayer(game, 118, 178, -Math.PI / 2);
    enterCar(car);
    game.playerCar.speed = 8;
    game.playerCar.health = 100;
    game.wanted.stars = 2;
    game.wanted.heat = 0;
    spawnPoliceIfNeeded();
    game.policeCars.forEach((pc, i) => {
      // Ahead of the player (west), in the camera's field of view — the
      // camera sits EAST of the car looking west, so cars staged east
      // would fill the lens.
      pc.x = game.playerX - 14 - i * 8;
      pc.z = game.playerZ + (i === 0 ? 2.4 : -2.4);
      pc.heading = -Math.PI / 2;
      pc.speed = 12;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.heading;
    });
    game.trafficCars.slice(0, 1).forEach((tc) => {
      tc.x = 62;
      tc.z = 184.4;
      tc.heading = -Math.PI / 2;
      tc.speed = 10;
      tc.ai.axis = 'x';
      tc.ai.dir = -1;
      tc.mesh.userData.bodyMat.color.setHex(0xf2c230);
      tc.mesh.position.set(tc.x, 0, tc.z);
      tc.mesh.rotation.y = tc.heading;
    });
    game.ledger.rep = 2;
    game.radio.station = 0; // Verde FM
    game.money = 45320;
    const preset = getShotPreset('chase-cover');
    game.cameraDistOverride = preset.dist;
    game.cameraPitch = preset.pitch;
    game.cameraYaw = -Math.PI / 2; // behind the car, looking west
    game.objective = 'Coastal day — Beachfront, ferris wheel ahead';
    return;
  }

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
      // Close in on the camera's side so the roof light bar reads: the
      // light bar sits at the car's rear (local -z), so heading east puts
      // it on the camera-facing side instead of the far side.
      // NOTE: the police DRIVE toward Nico during the capture (~5-7 m in
      // the ~0.3 s of game time before the screenshot lands), so stage
      // them a few metres further out than the final frame wants.
      pc.x = game.playerX + 16 + i * 4;
      pc.z = game.playerZ + (i === 0 ? 5 : 2);
      pc.heading = Math.PI / 2;
      // v2 polish: stage them at a STANDSTILL. spawnPoliceCar gives them
      // speed 18 and updatePolice accelerates them toward ~24 m/s — but
      // their heading starts east (AWAY from Nico, so the light bar faces
      // the camera) and updatePolice only turns them slowly, so in the
      // capture window they drive ~6 m EAST and end up at the frame's left
      // edge with the light bar on the far side. From 0 they move ~1 m.
      pc.speed = 0;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.heading;
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
    // v2 polish: cameraYaw 0.9 (look east-southeast) instead of π-2.6
    // (0.54). At 0.54 the two police cars (staged east of Nico) land at
    // the frame's far left edge and one hides behind a traffic car; at
    // 0.9 they sit centre-left (~x 370-510) with Nico centred and the lit
    // downtown tower (south-east of Nico) still in frame behind them.
    game.cameraYaw = 0.9;
    game.cameraPitch = 0.24;
    game.objective = '5 · Heat Wave: Lose the wanted level (stars must reach 0)';
    return;
  }

  if (name === 'street') {
    // Verde Arms open over the street (SCREENSHOTS.md §4.3): mission 3,
    // Nico in the VELOCE GT, the real shop UI open, cash line visible.
    // Polish 3 R3: staging moved to the BEACHFRONT so the shot is bright
    // midday (14:31) AND the ferris wheel + beach read in frame.
    // Wheel geometry (measured, not assumed): the wheel at (-138, 208)
    // is a torus in the XY plane — it faces NORTH/SOUTH, so from the east
    // (heading west along the beachfront road) it is EDGE-ON, a sliver.
    // It only reads face-on looking SOUTH. So the car sits on the
    // north-south road x=-104 heading SOUTH, camera behind it looking
    // south-southwest at the wheel (~80 m away, face-on), NOT west.
    // Audit (Polish 3 §8.4, verified in main.js/shops.js/missions.js):
    // openShop only sets state='shop'; in that state update() never runs,
    // so no mission step, police, traffic or proximity check can move the
    // player, close the shop, or touch cash; closeShop only restores
    // state='playing' (no teleport, no car change); buyItem only runs on a
    // click (capture never clicks); startMission only sets index/step. The
    // staging + camera below live ONLY in this ?shot= branch.
    world.setSkyMode('day');
    game.clock = 14 * 60 + 31;
    startMission(game.missions, game, 2);
    noBanner(game);
    const car = spawnSportsCoupe();
    car.x = -104;
    car.z = 128;
    car.heading = 0; // south, down the x=-104 road toward the beach
    car.mesh.position.set(-104, 0, 128);
    car.mesh.rotation.y = 0;
    placePlayer(game, -104, 128, 0);
    enterCar(car);
    game.playerCar.speed = 0;
    game.playerCar.health = 100;
    game.money = 540;
    game.radio.station = 0; // Verde FM
    // Camera: 6 m behind the car, ~2.5 m up, looking 8.6° down — close
    // enough that the VELOCE GT's red rear + tail bar peek out BELOW the
    // shop panel (at 10.5 m the whole car hid behind it), while the wheel
    // rim top (~29 m at ~87 m) still lands near the top of the frame,
    // above the shop panel; the wheel sits right of the panel so its
    // right leg + side gondolas stay visible past the panel edge.
    // Yaw +0.10 rad points the lens south-southwest at the wheel.
    game.cameraDistOverride = 6.0;
    game.cameraPitch = 0.15;
    game.cameraYaw = 0.10;
    // Street life at the frame edges, past the panel: a parked car on the
    // beachfront road (right, below the wheel) + a yellow taxi crossing
    // it (left). Both frozen: the game is paused while the shop is open.
    const parked = game.allCars.find((c) => c.driver === null && !c.isPolice);
    if (parked) {
      parked.x = -130;
      parked.z = 178;
      parked.heading = -Math.PI / 2;
      parked.mesh.position.set(-130, 0, 178);
      parked.mesh.rotation.y = -Math.PI / 2;
    }
    game.trafficCars.slice(0, 1).forEach((tc) => {
      tc.x = -64;
      tc.z = 182;
      tc.heading = -Math.PI / 2;
      tc.speed = 0;
      tc.ai.axis = 'x';
      tc.ai.dir = -1;
      tc.mesh.userData.bodyMat.color.setHex(0xf2c230);
      tc.mesh.position.set(tc.x, 0, tc.z);
      tc.mesh.rotation.y = tc.heading;
    });
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
  // v2 polish (P8): park in the GAP between the boulevard palms (x=24/48)
  // and swing the camera to look south-southwest down the beachfront, so no
  // palm trunk stands next to the lens. The old yaw (-0.83) put the camera
  // ON the palm line (z=176) — the palm at x=48 filled the right third.
  car.x = 36;
  car.z = 182;
  car.heading = Math.PI / 2;
  car.mesh.position.set(36, 0, 182);
  car.mesh.rotation.y = Math.PI / 2;
  placePlayer(game, 36, 178, Math.PI / 2);
  enterCar(car);
  // NOTE (cover drift trap): the car KEEPS DRIVING after staging — update()
  // runs while the capture waits, and at speed 26 the car travels ~6-10 m
  // east before the screenshot lands, carrying the camera into the palm at
  // x=48 and the billboard post at x=52 (both fill the frame as trunks).
  // Stage speed 8 (~29 km/h): the drift is ~2-3 m, the camera stays clear
  // of both, and the car stays in the 24-48 palm gap. The HUD reads 29 km/h.
  game.playerCar.speed = 8;
  game.playerCar.health = 82; // CONDITION 82% — a chase leaves marks
  game.wanted.stars = 4;
  game.wanted.heat = 0;
  spawnHeliIfNeeded();
  // Polish 3 R2: angle 0.45, height 10, radius 18 (was 12 / 26). Round-2
  // angle -0.45 hid the heli behind the billboard; 0.45 keeps it clear
  // top-right. The smaller orbit radius (staging-only) puts the heli
  // ~27 m from the camera instead of ~35 m, so the body + skids + nav
  // light read at ~100 px instead of a distant grey ball — the light-grey
  // body (0x9aa7b0), red stripe, navy fin and dark rotor from
  // helicopter.js do the rest. (The tail still points away from a chase
  // cam; the rotor blades are thin and their phase at capture varies.) Orbit height/radius are shot staging;
  // gameplay orbit (30 m / 26 m) is untouched.
  game.heli.angle = 0.45;
  game.heli.height = 10;
  game.heli.radius = 18;
  spawnPoliceIfNeeded();
  // Police AHEAD of the player (east, in the camera's field of view) in a
  // tight echelon — the chase cam sits WEST of the car looking east, so
  // cars staged behind the player would be behind the lens. This matches
  // the top-1 cover composition (police ahead of the hero car).
  game.policeCars.forEach((pc, i) => {
    pc.x = game.playerX + 12 + i * 7;
    pc.z = game.playerZ + (i === 1 ? -2 : 2);
    pc.heading = Math.PI / 2;
    pc.speed = 24;
    pc.mesh.position.set(pc.x, 0, pc.z);
    pc.mesh.rotation.y = pc.heading;
  });
  // Two traffic cars on the same road, ahead of the player.
  game.trafficCars.slice(0, 2).forEach((tc, i) => {
    tc.x = game.playerX + 45 + i * 20;
    tc.z = 182 + (i === 0 ? 2.4 : -2.4);
    tc.heading = Math.PI / 2;
    tc.speed = 10;
    tc.ai.axis = 'x';
    tc.ai.dir = 1;
    tc.mesh.position.set(tc.x, 0, tc.z);
    tc.mesh.rotation.y = tc.heading;
  });
  // A few pedestrians on the beach-side sidewalk ahead, in frame right.
  game.peds.slice(0, 3).forEach((p, i) => {
    p.x = 55 + i * 4;
    p.z = 188;
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
  game.cameraYaw = Math.PI / 2; // TRUE chase cam: directly behind the car,
  // looking east down the beachfront road (top-1 composition)
  // Polish 2 Q2: the low chase-cover preset applies ONLY in this capture
  // mode (game.shotMode === 'cover'); gameplay keeps its own camera.
  const coverPreset = getShotPreset('chase-cover');
  game.cameraDistOverride = coverPreset.dist;
  game.cameraPitch = coverPreset.pitch;
  game.objective = '12 · Grand Getaway: Reach the yacht at the marina — with the law on your tail';
}
