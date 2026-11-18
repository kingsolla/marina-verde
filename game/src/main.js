// Marina Verde — the game itself. Boots three.js, builds the city, and runs the
// loop: on-foot third-person movement, arcade driving, traffic, pedestrians,
// police and wanted level, twelve story missions in three acts, combat with
// four weapons, helicopter police, radio, shops + Turf Ledger, HUD + minimap,
// save, pause, and the screenshot staging hook (?shot=...).
// v2 "Full Tide": ACES tone mapping, gradient sky, procedural textures.
import * as THREE from 'three';
import { CITY, PLAYER, PLACES, STORY_INTRO, MISSIONS, WEAPONS, WEAPON_ORDER, SHOPS, districtAt, discountedPrice, repDiscount } from './config.js';
import { mulberry32, pick, range } from './rng.js';
import { buildWorld, collideCircle, clampToCity, hasLineOfSight } from './world.js';
import { createCar, drivePlayerCar, makeTrafficCar, updateTraffic, spawnParkedCars } from './vehicles.js';
import { createPed, updatePed, spawnPeds, makePersonMesh } from './peds.js';
import { createWanted, addCrime, policeDemand, spawnPoliceCar, updatePolice, updateWanted } from './police.js';
import { createMissionState, currentMission, currentStep, objectiveText, stepTarget, advanceStep, startMission, createBeacon, updateBeacon, resetStepState } from './missions.js';
import { createCombat, shoot, punch, updateRival, updateTracers, resetCombat } from './combat.js';
import { createArsenal, weaponDef, selectWeapon, cycleWeapon, giveWeapon, fireWeapon, ownedWeapons } from './weapons.js';
import { createHelicopter, helicopterDemand, updateHelicopter } from './helicopter.js';
import { createRadio } from './radio.js';
import { createShops, nearestShop } from './shops.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud, updateHud, drawMinimap, showToast, showBanner, showDialog, openMap, closeMap } from './hud.js';
import { stageShot } from './shots.js';
import { getShotPreset, formatSaveSummary } from './graphics-polish.js';

const SAVE_KEY = 'marina-verde-save-v2';

export function createGame() {
  const game = {
    time: 0,
    clock: 16 * 60 + 40, // 16:40, golden hour
    state: 'title', // title | playing | paused | busted | wasted | shop
    money: 250,
    health: PLAYER.maxHealth,
    wanted: createWanted(),
    missions: createMissionState(),
    combat: createCombat(),
    arsenal: createArsenal(),
    ledger: { jobsByDistrict: {}, rep: 0, races: { played: 0, wins: 0, bestMs: 0 } }, // Turf Ledger
    district: 'Marina Verde',
    inCar: false,
    onFoot: true,
    playerX: PLACES.spawn.x,
    playerZ: PLACES.spawn.z,
    playerHeading: Math.PI,
    playerCar: null,
    objective: '',
    missionTarget: null,
    prompt: '',
    cameraYaw: Math.PI,
    cameraPitch: 0.32,
    cameraDist: 8,
    bustedTimer: 0,
    // Police SEARCH state (G-TOP2): pursuit | search | clear. lastSeen is
    // where the law last had eyes on Nico; searchZone is the circle they
    // sweep when they lose line-of-sight.
    policeMode: 'clear',
    lastSeen: null,
    unseenTimer: 0,
    searchZone: null,
    rivalSpawned: false,
    rivalWave2: false,
    shotMode: null,
    shopOpen: false,
    currentShop: null,
    followTarget: null,
    raceRival: null,
    raceRivalWp: 0,
    raceRivalDone: false,
    raceWaypoints: [], // checkpoints + finish for mission 11 and repeat races
    repeatRace: null, // {cp, timer, elapsed} while a repeatable street race runs
    sportsCoupe: null,
    patrolCars: [],
    heli: null,
    radio: null,
    shops: [],
    perf: { updateMs: 0, updateSamples: [], frameTimes: [], renderCalls: 0, triangles: 0 },
  };
  return game;
}

function buildPlayerMesh() {
  // v2 polish P5 — Nico hero treatment (player only, ~0 cost): darker teal
  // jacket (0x1f6f6a, distinct from every ped shirt), dark hair under the
  // cap, and shoes so the figure grounds at screenshot distance.
  const mesh = makePersonMesh(0x1f6f6a, 0x2a2f38, 0xf2c9a0);
  // Nico Vale: teal jacket, dark jeans, a cap.
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.12, 0.38),
    new THREE.MeshLambertMaterial({ color: 0xf2c230 }),
  );
  cap.position.y = 1.92;
  mesh.add(cap);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x241a12 }),
  );
  hair.position.y = 1.74;
  mesh.add(hair);
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const shoeGeo = new THREE.BoxGeometry(0.24, 0.12, 0.34);
  for (const leg of [mesh.userData.legL, mesh.userData.legR]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.42, 0.05);
    leg.add(shoe);
  }
  return mesh;
}

export async function boot() {
  const params = new URLSearchParams(location.search);
  const shotName = params.get('shot');
  const game = createGame();
  game.shotMode = shotName;
  // v2fix (A): in screenshot mode the title screen already shows the
  // controls, so hide the hint panel — with 5 MVPD units it grew into the
  // minimap and its last line was clipped. Only the 4 known shot names
  // trigger this; arbitrary ?shot= values leave the HUD untouched.
  if (['cover', 'chase', 'street', 'hud', 'beach'].includes(shotName)) {
    document.body.classList.add('shot-mode');
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // v2: ACES filmic tone mapping + ~1.1 exposure, sRGB output.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);
  game.renderer = renderer;

  const scene = new THREE.Scene();
  game.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  const world = buildWorld(scene);
  game.world = world; // exposed for the playtest sky-mode checks
  const rand = mulberry32(CITY.SEED + 7);

  const audio = createAudio();
  const input = createInput();
  const hud = createHud();
  const beacon = createBeacon(scene);
  const heli = createHelicopter(scene, world.haloTex);
  game.heli = heli;
  const radio = createRadio(audio);
  game.radio = radio;
  const shops = createShops(scene, world);
  game.shops = shops;

  // --- Player --------------------------------------------------------------
  const playerMesh = buildPlayerMesh();
  playerMesh.position.set(game.playerX, 0, game.playerZ);
  scene.add(playerMesh);
  game.playerMesh = playerMesh;
  let walkPhase = 0;

  // --- Cars ------------------------------------------------------------------
  const allCars = [];
  const parked = spawnParkedCars(scene, rand, 16);
  allCars.push(...parked);
  const trafficCars = [];
  for (let i = 0; i < 20; i += 1) {
    const c = makeTrafficCar(rand, 0, 0);
    scene.add(c.mesh);
    trafficCars.push(c);
    allCars.push(c);
  }
  game.trafficCars = trafficCars;
  const policeCars = [];
  game.policeCars = policeCars;
  game.allCars = allCars;

  // --- Pedestrians -----------------------------------------------------------
  const peds = spawnPeds(scene, rand, 40);
  for (const p of peds) p.mesh.userData.pedRef = p;
  game.peds = peds;
  const rivals = [];
  game.rivals = rivals;

  // --- Helpers ---------------------------------------------------------------
  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const c of allCars) {
      const d = Math.hypot(c.x - game.playerX, c.z - game.playerZ);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function spawnPoliceIfNeeded() {
    // Only chase cars are demand-managed; patrol cars (mission 8) are
    // owned by their mission and must not be popped when demand is 0.
    const want = policeDemand(game.wanted.stars);
    const chase = policeCars.filter((c) => c.driver !== 'patrol');
    while (chase.length < want) {
      // Spawn at a road edge away from the player.
      const angle = range(rand, 0, Math.PI * 2);
      const x = game.playerX + Math.cos(angle) * 70;
      const z = game.playerZ + Math.sin(angle) * 70;
      const clamped = clampToCity(x, z);
      const car = spawnPoliceCar(scene, clamped.x, clamped.z, Math.atan2(game.playerX - clamped.x, game.playerZ - clamped.z));
      policeCars.push(car);
      chase.push(car);
      allCars.push(car);
    }
    while (chase.length > want) {
      const car = chase.pop();
      scene.remove(car.mesh);
      let i = policeCars.indexOf(car);
      if (i >= 0) policeCars.splice(i, 1);
      i = allCars.indexOf(car);
      if (i >= 0) allCars.splice(i, 1);
    }
  }

  function spawnHeliIfNeeded() {
    const want = helicopterDemand(game.wanted.stars);
    const on = want > 0;
    if (on && !heli.active) {
      heli.active = true;
      audio.startHeliRotor();
    } else if (!on && heli.active) {
      heli.active = false;
      heli.spotlit = 0;
      audio.stopHeliRotor();
    }
  }
  game.spawnHeliIfNeeded = spawnHeliIfNeeded;

  function spawnPatrolCars() {
    if (game.patrolCars.length > 0) return;
    for (let i = 0; i < 2; i += 1) {
      const car = spawnPoliceCar(scene, game.playerX + (i === 0 ? 40 : -40), game.playerZ + 30, 0);
      car.driver = 'patrol';
      car.ai = { axis: 'x', dir: i === 0 ? 1 : -1, speed: 8, turnAt: null, wait: 0 };
      game.patrolCars.push(car);
      policeCars.push(car);
      allCars.push(car);
    }
  }

  function removePatrolCars() {
    for (const car of game.patrolCars) {
      scene.remove(car.mesh);
      let i = policeCars.indexOf(car);
      if (i >= 0) policeCars.splice(i, 1);
      i = allCars.indexOf(car);
      if (i >= 0) allCars.splice(i, 1);
    }
    game.patrolCars = [];
  }

  function removeFollowTarget() {
    if (!game.followTarget) return;
    const car = game.followTarget;
    scene.remove(car.mesh);
    let i = trafficCars.indexOf(car);
    if (i >= 0) trafficCars.splice(i, 1);
    i = allCars.indexOf(car);
    if (i >= 0) allCars.splice(i, 1);
    game.followTarget = null;
  }

  function spawnFollowTarget() {
    if (game.followTarget) return;
    const car = makeTrafficCar(rand, 0, 0);
    car.mesh.userData.bodyMat.color.setHex(0x6a7078); // grey sedan
    car.color = 0x6a7078;
    car.isFollowTarget = true;
    car.x = game.playerX + 30;
    car.z = game.playerZ;
    car.mesh.position.set(car.x, 0, car.z);
    scene.add(car.mesh);
    trafficCars.push(car);
    allCars.push(car);
    game.followTarget = car;
  }

  function spawnSportsCoupe() {
    if (game.sportsCoupe) return game.sportsCoupe;
    const car = createCar(118, 190, Math.PI / 2, 0xd94040, false, 'sport', { glow: true });
    car.isSportsCoupe = true;
    scene.add(car.mesh);
    allCars.push(car);
    game.sportsCoupe = car;
    return car;
  }
  game.spawnSportsCoupe = spawnSportsCoupe;

  function spawnRaceRival(x = 120, z = 176, heading = Math.PI / 2) {
    // Both the mission-11 race and the repeatable street race run the same
    // route: beachfront checkpoints, then the hospital.
    game.raceWaypoints = [PLACES.raceCp1, PLACES.raceCp2, PLACES.raceCp3, PLACES.hospital];
    if (game.raceRival) {
      game.raceRival.x = x;
      game.raceRival.z = z;
      game.raceRival.heading = heading;
      game.raceRival.mesh.position.set(x, 0, z);
      game.raceRival.mesh.rotation.y = heading;
      game.raceRivalWp = 0;
      game.raceRivalDone = false;
      return game.raceRival;
    }
    const car = createCar(x, z, heading, 0x2a2f38, false, 'sedan');
    car.isRaceRival = true;
    scene.add(car.mesh);
    allCars.push(car);
    game.raceRival = car;
    game.raceRivalWp = 0;
    game.raceRivalDone = false;
    return car;
  }

  // --- Repeatable street race (DESIGN §9.3) --------------------------------
  function raceUnlocked() {
    return game.missions.index > 10 || game.missions.done;
  }
  game.raceUnlocked = raceUnlocked;

  function startRepeatRace() {
    game.repeatRace = { cp: 0, timer: 75, elapsed: 0 };
    spawnRaceRival(112, 182, -Math.PI / 2);
    showDialog(hud, 'Marco', 'Street race! Three checkpoints, then the hospital — 75 seconds. Beat the grey sedan, $200 if you win.', 6);
    audio.blip(880, 0.15, 'square', 0.25);
  }
  game.startRepeatRace = startRepeatRace;

  function endRepeatRace(won) {
    const rr = game.repeatRace;
    if (!rr) return;
    game.repeatRace = null;
    const races = game.ledger.races;
    races.played += 1;
    if (won) {
      races.wins += 1;
      const ms = Math.round(rr.elapsed * 1000);
      if (!races.bestMs || ms < races.bestMs) races.bestMs = ms;
      game.money += 200;
      showBanner(hud, `Street Race WON — $${200}`, `Finished in ${(rr.elapsed).toFixed(1)} s. Best: ${(races.bestMs / 1000).toFixed(1)} s · ${races.wins}W/${races.played} races.`);
      audio.cash();
    } else {
      showToast(hud, 'Street race lost — try again at the beachfront marker.', game.time);
    }
    if (game.raceRival) {
      const i = allCars.indexOf(game.raceRival);
      if (i >= 0) allCars.splice(i, 1);
      scene.remove(game.raceRival.mesh);
      game.raceRival = null;
    }
    game.raceRivalDone = false;
    saveGame();
  }

  function resetRace() {
    const ss = game.missions.stepState;
    ss.timer = currentStep(game.missions)?.seconds ?? 75;
    ss.raceCp = 0;
    if (game.raceRival) {
      game.raceRival.x = 120;
      game.raceRival.z = 176;
      game.raceRival.heading = Math.PI / 2;
      game.raceRival.mesh.position.set(120, 0, 176);
      game.raceRivalWp = 0;
      game.raceRivalDone = false;
    }
  }

  function enterCar(car) {
    if (car.driver === 'traffic') {
      // Carjacking (DESIGN §9.1): the driver gets out and runs, control
      // passes to the player. +1 star as usual, +1 more if a police car is
      // close enough to witness it (< 40 m).
      const driver = createPed(car.x + 2, car.z + 1, rand, false);
      driver.state = 'flee';
      driver.heading = Math.atan2(game.playerX - car.x, game.playerZ - car.z);
      driver.targetX = car.x + (car.x - game.playerX) * 4;
      driver.targetZ = car.z + (car.z - game.playerZ) * 4;
      driver.mesh.userData.pedRef = driver;
      scene.add(driver.mesh);
      peds.push(driver);
      let stars = 1;
      const nearCop = policeCars.some((pc) => Math.hypot(pc.x - car.x, pc.z - car.z) < 40);
      if (nearCop) stars = 2;
      addCrime(game.wanted, stars, 'carjacking');
      showToast(hud, nearCop ? 'You jacked the driver out — the police saw it!' : 'You jacked the driver out!', game.time);
      audio.blip(220, 0.2, 'square', 0.25);
    } else if (car.driver === 'police') {
      addCrime(game.wanted, 2, 'stolen police car');
      showToast(hud, 'You stole a police car?!', game.time);
    }
    car.driver = 'player';
    game.inCar = true;
    game.onFoot = false;
    game.playerCar = car;
    playerMesh.visible = false;
    spawnPoliceIfNeeded();
    const step = currentStep(game.missions);
    if (step && step.kind === 'enterCar') {
      advanceStep(game.missions, game);
      afterMissionEvent();
    }
  }

  function exitCar() {
    const car = game.playerCar;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    game.inCar = false;
    game.onFoot = true;
    game.playerCar = null;
    // Step out on the driver's side.
    const side = { x: car.x + Math.cos(car.heading) * 2.2, z: car.z - Math.sin(car.heading) * 2.2 };
    const hit = collideCircle(world.colliders, side.x, side.z, 0.6);
    game.playerX = hit.x;
    game.playerZ = hit.z;
    game.playerHeading = car.heading;
    playerMesh.visible = true;
    playerMesh.position.set(game.playerX, 0, game.playerZ);
    playerMesh.rotation.y = game.playerHeading;
  }

  function spawnRivalsAt(x, z, count) {
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const p = createPed(x + (i - (count - 1) / 2) * 4, z + 3, rand, true);
      p.mesh.userData.pedRef = p;
      scene.add(p.mesh);
      rivals.push(p);
      peds.push(p);
      made.push(p);
    }
    return made;
  }
  game.spawnRivalsAt = spawnRivalsAt;

  function spawnRivals() {
    if (game.rivalSpawned) return;
    game.rivalSpawned = true;
    spawnRivalsAt(PLACES.tower.x - 6, PLACES.tower.z + 26, 2);
    showDialog(hud, 'Marco', 'There they are — the crew holding the plaza. Take them down, Nico.', 6);
  }

  function afterMissionEvent() {
    const m = currentMission(game.missions);
    if (!m) {
      if (game.missions.done) {
        showBanner(hud, 'MARINA VERDE COMPLETE', 'All twelve jobs done. Nico Vale is a legend of the coast. Free roam — the city is yours.');
        audio.cash();
      }
      return;
    }
    const step = currentStep(game.missions);
    if (m.id === 'heat-wave' && step.kind === 'loseWanted') {
      showDialog(hud, 'Marco', 'Three stars, Nico. Break line of sight, stay clean, and let the heat die down.', 6);
    }
    if (m.id === 'grand-getaway') {
      showDialog(hud, 'Rosa', 'Marco has the boat ready — he drives getaway for the last run. Get to the yacht, don\'t stop for anything.', 6);
    }
    if (m.id === 'armed-ready') {
      showDialog(hud, 'Rosa', 'Verde Arms is on the west side — green sign, can\'t miss it. Buy the SMG, then come back.', 6);
    }
  }

  function onMissionComplete(m) {
    // Turf Ledger: one job in the district where it finished; rep = acts done.
    // NOTE: advanceStep calls this BEFORE it advances the index / sets done,
    // so rep is computed from the completed count (idx + 1), not from the
    // not-yet-advanced index — otherwise the final act could never reach 3.
    const d = game.district || 'Marina Verde';
    game.ledger.jobsByDistrict[d] = (game.ledger.jobsByDistrict[d] ?? 0) + 1;
    const completed = game.missions.index + 1; // the mission just finished
    game.ledger.rep = (completed >= 4 ? 1 : 0) + (completed >= 8 ? 1 : 0) + (completed >= 12 ? 1 : 0);
    showBanner(hud, `Job complete — $${m.reward}`, m.id === 'grand-getaway' ? 'You made it to the yacht. Marina Verde is yours.' : 'Money banked. The next job is waiting.');
    audio.cash();
    audio.stopSiren();
    saveGame();
  }
  game.onMissionComplete = onMissionComplete;

  // Seed per-step mechanics the first frame a step is active.
  function ensureStepSetup() {
    const m = currentMission(game.missions);
    if (!m) return;
    const step = currentStep(game.missions);
    const ss = game.missions.stepState;
    if (ss.started) return;
    ss.started = true;
    if (step.kind === 'timed') {
      ss.timer = step.seconds;
      // G-TOP3: mission 4 — the fare is Marco, the crew's getaway driver.
      if (m.id === 'midnight-taxi') showDialog(hud, 'Marco', 'I\'m your fare, Nico — and your getaway driver from here on. Drive like you mean it.', 6);
    } else if (step.kind === 'survive') {
      ss.timer = step.seconds;
      if (m.id === 'storm-the-pier') {
        game.wanted.stars = 4;
        game.wanted.heat = 0;
        spawnPoliceIfNeeded();
        spawnHeliIfNeeded();
        audio.startSiren();
        spawnRivalsAt(PLACES.marina.x - 12, PLACES.marina.z + 10, 3);
        spawnRivalsAt(PLACES.marina.x + 12, PLACES.marina.z + 10, 3);
        showDialog(hud, 'Rosa', 'Six rivals on the pier and the helicopter is up. Survive 45 seconds!', 6);
      }
    } else if (step.kind === 'follow') {
      spawnFollowTarget();
      showDialog(hud, 'Marco', 'That grey sedan — tail it. Not too close, not too far.', 6);
    } else if (step.kind === 'stealth') {
      ss.starsAtStart = game.wanted.stars;
      spawnPatrolCars();
      showDialog(hud, 'Marco', 'Patrols doubled tonight. Walk to the safehouse and do not get seen.', 6);
    } else if (step.kind === 'race') {
      ss.timer = step.seconds;
      ss.raceCp = 0;
      game.wanted.stars = 3;
      game.wanted.heat = 0;
      spawnPoliceIfNeeded();
      audio.startSiren();
      spawnRaceRival();
      showDialog(hud, 'Marco', 'Three checkpoints, 75 seconds, and a rival who wants it more than you. Go!', 6);
    } else if (step.kind === 'defeat' && m.id === 'rooftop-rumble') {
      game.rivalSpawned = true;
      game.rivalWave2 = false;
      spawnRivalsAt(PLACES.tower.x - 6, PLACES.tower.z + 26, 2);
      showDialog(hud, 'Marco', 'Two waves, four rivals. Clear the plaza, Nico.', 6);
    } else if (step.kind === 'deliverCar') {
      spawnSportsCoupe();
      showDialog(hud, 'Rosa', 'Red sports coupe, parked at the marina. Marco drives getaway in that car — bring it to my garage in one piece.', 6);
    } else if (step.kind === 'loseWanted' && m.id === 'heat-wave') {
      game.wanted.stars = 3;
      game.wanted.heat = 0;
      spawnPoliceIfNeeded();
      audio.startSiren();
    } else if (m.id === 'grand-getaway') {
      game.wanted.stars = 5;
      game.wanted.heat = 0;
      spawnPoliceIfNeeded();
      spawnHeliIfNeeded();
      audio.startSiren();
    }
  }

  function checkMissionProgress(dt) {
    const m = currentMission(game.missions);
    if (!m) return;
    ensureStepSetup();
    const step = currentStep(game.missions);
    const ss = game.missions.stepState;
    if (step.kind === 'goto') {
      const target = stepTarget(game.missions);
      if (!target) return;
      const d = Math.hypot(game.playerX - target.x, game.playerZ - target.z);
      if (d < 7) {
        audio.pickup();
        advanceStep(game.missions, game);
        afterMissionEvent();
      }
    } else if (step.kind === 'loseWanted') {
      if (game.wanted.stars === 0) {
        advanceStep(game.missions, game);
        afterMissionEvent();
      }
    } else if (step.kind === 'timed') {
      ss.timer -= dt;
      const target = stepTarget(game.missions);
      if (target && Math.hypot(game.playerX - target.x, game.playerZ - target.z) < 7) {
        audio.pickup();
        advanceStep(game.missions, game);
        afterMissionEvent();
      } else if (ss.timer <= 0) {
        ss.timer = step.seconds;
        showToast(hud, 'Too slow — the clock ran out. Try again!', game.time);
        audio.blip(180, 0.3, 'square', 0.3);
      }
    } else if (step.kind === 'follow') {
      const t = game.followTarget;
      if (!t) return;
      const d = Math.hypot(t.x - game.playerX, t.z - game.playerZ);
      if (d < 8) {
        ss.spottedTimer += dt;
        if (ss.spottedTimer >= 3) {
          ss.followTime = 0;
          ss.spottedTimer = 0;
          showToast(hud, 'Spotted! Back off — stay 8–25 m behind the sedan.', game.time);
        }
      } else {
        ss.spottedTimer = 0;
        if (d <= 25) ss.followTime += dt;
      }
      if (ss.followTime >= step.seconds) {
        removeFollowTarget();
        advanceStep(game.missions, game);
        afterMissionEvent();
      }
    } else if (step.kind === 'stealth') {
      if (game.wanted.stars > ss.starsAtStart) {
        showToast(hud, 'You were spotted — lose the heat, then try the quiet streets again.', game.time);
        resetStepState(game.missions);
        return;
      }
      const target = stepTarget(game.missions);
      if (target && Math.hypot(game.playerX - target.x, game.playerZ - target.z) < 7) {
        removePatrolCars();
        advanceStep(game.missions, game);
        afterMissionEvent();
      }
    } else if (step.kind === 'survive') {
      ss.timer -= dt;
      if (ss.timer <= 0) {
        advanceStep(game.missions, game);
        afterMissionEvent();
      }
    } else if (step.kind === 'deliverCar') {
      const coupe = game.sportsCoupe;
      if (!coupe) return;
      const inCoupe = game.inCar && game.playerCar === coupe;
      const target = stepTarget(game.missions);
      if (inCoupe && target && Math.hypot(game.playerX - target.x, game.playerZ - target.z) < 8) {
        // Garage bonus: repaired + repainted on arrival, +$100.
        coupe.health = 100;
        coupe.handicap = 1;
        const newColor = pick(rand, [0x2f6fd0, 0xf2c230, 0x38b6a0, 0xe8e8e8, 0xc96fd0]);
        coupe.mesh.userData.bodyMat.color.setHex(newColor);
        coupe.color = newColor;
        game.money += 100;
        showToast(hud, 'Garage bonus +$100 — coupe repaired and repainted.', game.time);
        advanceStep(game.missions, game);
        afterMissionEvent();
      }
    } else if (step.kind === 'race') {
      ss.timer -= dt;
      const target = stepTarget(game.missions);
      if (target && Math.hypot(game.playerX - target.x, game.playerZ - target.z) < 10) {
        if (ss.raceCp < (step.checkpoints?.length ?? 0)) {
          ss.raceCp += 1;
          audio.pickup();
          showToast(hud, `Checkpoint ${ss.raceCp}/${step.checkpoints.length}!`, game.time);
        } else {
          // Final target is the hospital.
          audio.pickup();
          if (game.raceRival) {
            const i = allCars.indexOf(game.raceRival);
            if (i >= 0) allCars.splice(i, 1);
            scene.remove(game.raceRival.mesh);
            game.raceRival = null;
          }
          advanceStep(game.missions, game);
          afterMissionEvent();
          return;
        }
      }
      if (game.raceRivalDone) {
        showToast(hud, 'The rival beat you to the hospital — race again!', game.time);
        resetRace();
        return;
      }
      if (ss.timer <= 0) {
        showToast(hud, 'Out of time — race again!', game.time);
        resetRace();
      }
    }
  }

  function respawn(reason) {
    game.health = PLAYER.maxHealth;
    game.wanted.stars = 0;
    game.wanted.decayTimer = 0;
    audio.stopSiren();
    resetCombat(game.combat, scene);
    const lost = Math.min(game.money, reason === 'busted' ? 100 : 150);
    game.money -= lost;
    if (game.playerCar) {
      game.playerCar.driver = null;
      game.playerCar.speed = 0;
      game.playerCar = null;
    }
    game.inCar = false;
    game.onFoot = true;
    game.playerX = PLACES.hospital.x;
    game.playerZ = PLACES.hospital.z;
    playerMesh.visible = true;
    playerMesh.position.set(game.playerX, 0, game.playerZ);
    showBanner(
      hud,
      reason === 'busted' ? 'BUSTED' : 'WASTED',
      reason === 'busted'
        ? `The marina police caught you. Bail cost $${lost}. Back on the street at the hospital.`
        : `You went down. The hospital patched you up for $${lost}.`,
    );
    game.bustedTimer = 0;
    heli.spotlit = 0;
  }

  // --- Shops -------------------------------------------------------------------
  const shopEl = document.getElementById('shop');
  const shopTitle = document.getElementById('shop-title');
  const shopItems = document.getElementById('shop-items');
  const shopRep = document.getElementById('shop-rep');
  const shopClose = document.getElementById('shop-close');

  function openShop(shop) {
    game.currentShop = shop;
    game.shopOpen = true;
    game.state = 'shop';
    shopTitle.textContent = shop.name;
    const rep = game.ledger.rep;
    const disc = Math.round(repDiscount(rep) * 100);
    const races = game.ledger.races ?? { played: 0, wins: 0, bestMs: 0 };
    const raceLine = races.played > 0
      ? ` · Street races ${races.wins}W/${races.played} · best ${(races.bestMs / 1000).toFixed(1)} s`
      : '';
    shopRep.textContent = disc > 0
      ? `Turf Ledger — rep ${rep} · ${disc}% discount applied${raceLine}`
      : `Turf Ledger — rep ${rep} · finish an act for a 5% shop discount${raceLine}`;
    const shopCash = document.getElementById('shop-cash');
    if (shopCash) shopCash.textContent = `Your cash: $${game.money.toLocaleString('en-US')}`;
    shopItems.innerHTML = '';
    for (const item of shop.items) {
      const price = discountedPrice(item.price, rep);
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.textContent = `${item.name} — $${price}${item.price > 0 && price < item.price ? ` (was $${item.price})` : ''}`;
      btn.addEventListener('click', () => buyItem(shop, item, price));
      shopItems.appendChild(btn);
    }
    shopEl.classList.add('show');
    document.exitPointerLock?.();
  }
  game.openShop = openShop;

  function closeShop() {
    game.shopOpen = false;
    game.currentShop = null;
    shopEl.classList.remove('show');
    if (game.state === 'shop') game.state = 'playing';
    audio.resume();
  }
  game.closeShop = closeShop;
  shopClose.addEventListener('click', closeShop);

  function buyItem(shop, item, price) {
    if (game.money < price) {
      showToast(hud, `Not enough cash — ${item.name} costs $${price}.`, game.time);
      audio.blip(180, 0.25, 'square', 0.3);
      return;
    }
    let ok = true;
    let msg = '';
    if (item.kind === 'weapon') {
      giveWeapon(game.arsenal, item.id);
      msg = `${WEAPONS[item.id].name} bought — press ${WEAPONS[item.id].key} to use it.`;
    } else if (item.kind === 'ammo') {
      const cur = game.arsenal.current;
      const def = weaponDef(cur);
      game.arsenal.ammo[cur] = Math.min(def.ammoMax, (game.arsenal.ammo[cur] ?? 0) + 24);
      msg = `+24 ${def.name} ammo.`;
    } else if (item.kind === 'repair') {
      if (game.playerCar) {
        game.playerCar.health = 100;
        game.playerCar.handicap = 1;
        msg = 'Car repaired to full.';
      } else {
        ok = false;
        msg = 'No car to repair — bring a car to the garage.';
      }
    } else if (item.kind === 'repaint') {
      if (game.playerCar) {
        const c = pick(rand, [0xd94040, 0x2f6fd0, 0xf2c230, 0x38b6a0, 0xe8e8e8, 0x2a2f38, 0xc96fd0, 0xf07f2f]);
        game.playerCar.mesh.userData.bodyMat.color.setHex(c);
        game.playerCar.color = c;
        msg = 'Fresh paint job — looking sharp.';
      } else {
        ok = false;
        msg = 'No car to repaint — bring a car to the garage.';
      }
    } else if (item.kind === 'health') {
      game.health = PLAYER.maxHealth;
      msg = 'Health kit used — full health.';
    } else if (item.kind === 'rest') {
      game.health = PLAYER.maxHealth;
      saveGame();
      msg = 'Safehouse — health restored, game saved.';
    }
    if (!ok) {
      showToast(hud, msg, game.time);
      return;
    }
    game.money -= price;
    audio.chaChing();
    showToast(hud, msg, game.time);
    // Mission 3 (buy step): buying the named item completes the step.
    const step = currentStep(game.missions);
    if (step && step.kind === 'buy' && step.item === item.id) {
      closeShop();
      advanceStep(game.missions, game);
      afterMissionEvent();
      return;
    }
    openShop(shop); // refresh prices / money display
  }
  game.buyItem = buyItem;

  // --- Save / load -----------------------------------------------------------
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: game.money,
        health: game.health,
        missionIndex: game.missions.index,
        missionStep: game.missions.step,
        x: game.playerX,
        z: game.playerZ,
        clock: game.clock,
        arsenal: game.arsenal,
        radioStation: game.radio.station,
        ledger: game.ledger,
      }));
    } catch { /* storage unavailable */ }
  }
  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      game.money = s.money ?? 250;
      game.health = s.health ?? PLAYER.maxHealth;
      game.clock = s.clock ?? game.clock;
      game.missions.index = Math.min(s.missionIndex ?? 0, MISSIONS.length - 1);
      game.missions.step = s.missionStep ?? 0;
      resetStepState(game.missions);
      game.playerX = s.x ?? PLACES.spawn.x;
      game.playerZ = s.z ?? PLACES.spawn.z;
      if (s.arsenal) game.arsenal = { ...createArsenal(), ...s.arsenal };
      if (typeof s.radioStation === 'number') game.radio.station = s.radioStation;
      if (s.ledger) {
        game.ledger = {
          jobsByDistrict: {},
          rep: 0,
          races: { played: 0, wins: 0, bestMs: 0 },
          ...s.ledger,
        };
        if (!game.ledger.races) game.ledger.races = { played: 0, wins: 0, bestMs: 0 };
      }
      playerMesh.position.set(game.playerX, 0, game.playerZ);
      return true;
    } catch {
      return false;
    }
  }
  game.saveGame = saveGame;
  setInterval(() => { if (game.state === 'playing') saveGame(); }, 15000);

  // --- Title screen ----------------------------------------------------------
  const titleEl = document.getElementById('title');
  const pauseEl = document.getElementById('pause');
  const playBtn = document.getElementById('play-btn');
  const continueBtn = document.getElementById('continue-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const restartBtn = document.getElementById('restart-btn');
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  continueBtn.style.display = hasSave ? '' : 'none';
  // Polish 2 Q7: the save slot is visible on the title screen — read-only
  // summary (renderTitleSaveSummary); a corrupt save hides the line.
  const saveSummaryEl = document.getElementById('save-summary');
  if (saveSummaryEl) {
    let summary = null;
    try { summary = formatSaveSummary(localStorage.getItem(SAVE_KEY), MISSIONS); } catch { summary = null; }
    if (summary) {
      saveSummaryEl.textContent = summary;
      saveSummaryEl.style.display = '';
    } else {
      saveSummaryEl.style.display = 'none';
    }
  }

  function startPlaying(fromSave) {
    if (fromSave) loadGame();
    else {
      startMission(game.missions, game, 0);
      showDialog(hud, 'Rosa', STORY_INTRO, 8);
    }
    titleEl.classList.remove('show');
    pauseEl.classList.remove('show');
    game.state = 'playing';
    audio.init();
    audio.resume();
    radio.start();
    radio.setDriving(false);
    input.requestLock();
    const m = currentMission(game.missions);
    if (m) showBanner(hud, m.title, `${m.giver}: ${m.brief}`);
  }
  playBtn.addEventListener('click', () => startPlaying(false));
  continueBtn.addEventListener('click', () => startPlaying(true));
  resumeBtn.addEventListener('click', () => {
    pauseEl.classList.remove('show');
    game.state = 'playing';
    audio.resume();
  });
  restartBtn.addEventListener('click', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
    location.reload();
  });
  document.getElementById('mute-btn').addEventListener('click', (e) => {
    audio.enabled = !audio.enabled;
    if (audio.master) audio.master.gain.value = audio.enabled ? 0.5 : 0;
    e.target.textContent = audio.enabled ? 'Sound: On' : 'Sound: Off';
  });
  document.getElementById('map-close').addEventListener('click', () => closeMap(hud, game));

  // --- Shot staging ----------------------------------------------------------
  if (shotName) {
    titleEl.classList.remove('show');
    game.state = 'playing';
    startMission(game.missions, game, 0);
    audio.init();
    radio.start();
    stageShot(shotName, game, {
      scene, camera, hud, world, rand, enterCar, spawnPoliceIfNeeded, spawnRivals,
      spawnRivalsAt, spawnSportsCoupe, spawnHeliIfNeeded, audio, openShop,
      openMap: () => openMap(hud, game),
    });
    // Let the renderer draw a few frames, then signal readiness.
    let frames = 0;
    const readyCheck = () => {
      frames += 1;
      if (frames >= 3) {
        window.__shotReady = true;
        return;
      }
      requestAnimationFrame(readyCheck);
    };
    requestAnimationFrame(readyCheck);
  }

  // --- Main loop -------------------------------------------------------------
  const clock = new THREE.Clock();
  let fpsFrames = 0;
  let fpsTime = 0;
  let lastFrameNow = performance.now();

  function animate() {
    requestAnimationFrame(animate);
    const frameStart = performance.now();
    // Frame-time distribution for the perf report (DESIGN §8).
    const ft = frameStart - lastFrameNow;
    lastFrameNow = frameStart;
    if (game.state === 'playing') {
      game.perf.frameTimes.push(ft);
      if (game.perf.frameTimes.length > 600) game.perf.frameTimes.shift();
    }
    const dt = Math.min(clock.getDelta(), 0.05);
    game.time += dt;
    fpsFrames += 1;
    fpsTime += dt;
    if (fpsTime >= 1) {
      game.fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }

    if (game.state === 'playing') {
      const t0 = performance.now();
      update(dt);
      const ms = performance.now() - t0;
      game.perf.updateMs = game.perf.updateMs * 0.9 + ms * 0.1; // EMA
      game.perf.updateSamples.push(ms);
      if (game.perf.updateSamples.length > 120) game.perf.updateSamples.shift();
    } else if (game.state === 'shop') {
      // Shop open: game paused, but E/Esc closes it.
      if (input.interact || input.pause) closeShop();
    } else if (game.state === 'map') {
      // Full map open: game paused; M / E / Esc closes it.
      if (input.interact || input.pause || input.mission) closeMap(hud, game);
    }
    // Camera + render always run, so the title screen shows the city behind it.
    updateCamera(dt);
    updateHud(hud, game);
    // Minimap every other frame (DESIGN §8): the 2D canvas redraw is pure
    // overhead at 60 fps and nobody can see a 30 Hz minimap stutter.
    game._frameCount = (game._frameCount ?? 0) + 1;
    if (game._frameCount % 2 === 0) drawMinimap(hud, game);
    world.beacon.material.opacity = 0.6 + Math.sin(game.time * 3) * 0.25;
    if (world.lighthouseLamp) world.lighthouseLamp.material.color.setHex(Math.floor(game.time * 1.4) % 2 === 0 ? 0xfff2a0 : 0xffe08a);
    // Water shimmer: scroll the canvas textures slowly.
    for (const t of world.waterTextures) {
      t.offset.x += dt * 0.008;
      t.offset.y += dt * 0.004;
    }
    renderer.render(scene, camera);
    game.perf.renderCalls = renderer.info.render.calls;
    game.perf.triangles = renderer.info.render.triangles;
    input.consumeEdges();
  }

  function update(dt) {
    game.clock += dt * 0.5; // one game minute every 2 seconds
    if (game.health < PLAYER.maxHealth) game.health = Math.min(PLAYER.maxHealth, game.health + dt * 1.2);

    // District tracking (Turf Ledger + HUD label).
    const d = districtAt(game.playerX, game.playerZ);
    if (d !== game.district) {
      game.district = d;
      showToast(hud, `— ${d} —`, game.time);
    }

    // Camera orbit from the mouse.
    const { dx, dy } = input.consumeMouse();
    game.cameraYaw -= dx * 0.0032;
    game.cameraPitch = Math.max(0.05, Math.min(1.1, game.cameraPitch + dy * 0.0022));

    // --- Weapon + radio keys (work on foot and in the car) -------------------
    if (input.weaponSlot >= 1 && input.weaponSlot <= 4) {
      const id = WEAPON_ORDER[input.weaponSlot - 1];
      if (selectWeapon(game.arsenal, id)) {
        showToast(hud, `${WEAPONS[id].name} equipped.`, game.time);
        audio.blip(700, 0.08, 'square', 0.15);
      } else {
        showToast(hud, `${WEAPONS[id].name} not owned — buy it at Verde Arms.`, game.time);
      }
    }
    if (input.cycleWeapon) {
      const id = cycleWeapon(game.arsenal);
      showToast(hud, `${WEAPONS[id].name} equipped.`, game.time);
    }
    if (input.radio) {
      const name = radio.cycleStation();
      showToast(hud, `♪ ${name}`, game.time);
    }
    radio.setDriving(game.inCar);

    // --- Player on foot ------------------------------------------------------
    if (game.onFoot) {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      let mx = 0;
      let mz = 0;
      if (input.forward) { mx += Math.sin(game.cameraYaw); mz += Math.cos(game.cameraYaw); }
      if (input.back) { mx -= Math.sin(game.cameraYaw); mz -= Math.cos(game.cameraYaw); }
      if (input.left) { mx += Math.sin(game.cameraYaw - Math.PI / 2); mz += Math.cos(game.cameraYaw - Math.PI / 2); }
      if (input.right) { mx += Math.sin(game.cameraYaw + Math.PI / 2); mz += Math.cos(game.cameraYaw + Math.PI / 2); }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        const nx = game.playerX + mx * speed * dt;
        const nz = game.playerZ + mz * speed * dt;
        const hit = collideCircle(world.colliders, nx, nz, PLAYER.radius);
        game.playerX = hit.x;
        game.playerZ = hit.z;
        game.playerHeading = Math.atan2(mx, mz);
        walkPhase += dt * speed * 1.6;
      }
      playerMesh.position.set(game.playerX, 0, game.playerZ);
      playerMesh.rotation.y = game.playerHeading;
      const u = playerMesh.userData;
      const swing = len > 0 ? Math.sin(walkPhase) * 0.6 : 0;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;

      // Shop prompt takes priority over the car prompt on foot.
      const shop = nearestShop(shops, { x: game.playerX, z: game.playerZ });
      const near = nearestCar(4.2);
      game.prompt = shop
        ? `Press E — ${shop.name}`
        : near ? (near.driver === 'traffic' ? 'Press E to steal the car' : near.driver === 'police' ? 'Press E to steal the police car' : 'Press E to get in the car') : '';
      if (input.interact && shop) {
        openShop(shop);
        input.interact = false;
      } else if (input.interact && near) {
        enterCar(near);
        input.interact = false;
      }

      // Combat on foot (v2 arsenal).
      game.combat.cooldown = Math.max(0, game.combat.cooldown - dt);
      game.combat.punchCooldown = Math.max(0, game.combat.punchCooldown - dt);
      const curDef = weaponDef(game.arsenal.current);
      if (input.shoot && (game.arsenal.ammo[game.arsenal.current] ?? 0) > 0) {
        const from = new THREE.Vector3(game.playerX, 1.5, game.playerZ);
        const dir = new THREE.Vector3(Math.sin(game.playerHeading), 0.02, Math.cos(game.playerHeading)).normalize();
        const fired = fireWeapon(game.arsenal, game.combat, scene, from, dir, rivals, (ped, killed) => {
          if (killed) {
            game.missions.defeated += 1;
            game.money += 25; // $25 per rival defeated
            addCrime(game.wanted, 1, 'rival down');
            showToast(hud, 'Rival down. +$25', game.time);
            const step = currentStep(game.missions);
            if (step && step.kind === 'defeat' && game.missions.defeated >= step.count) {
              advanceStep(game.missions, game);
              afterMissionEvent();
            } else if (step && step.kind === 'defeat' && currentMission(game.missions)?.id === 'rooftop-rumble' && game.missions.defeated === 2 && !game.rivalWave2) {
              game.rivalWave2 = true;
              spawnRivalsAt(PLACES.tower.x + 6, PLACES.tower.z + 26, 2);
              showDialog(hud, 'Marco', 'Second wave incoming!', 4);
            }
          }
        });
        if (fired) {
          audio.gunshot(curDef.pitch);
          addCrime(game.wanted, 0, 'shot fired');
        }
      } else if (input.shoot) {
        showToast(hud, 'Out of ammo — buy more at Verde Arms.', game.time);
      }
      if (input.punch) {
        const hitAnyone = punch(game.combat, { x: game.playerX, z: game.playerZ }, game.playerHeading, rivals, (ped, killed) => {
          if (killed) {
            game.missions.defeated += 1;
            game.money += 25;
            const step = currentStep(game.missions);
            if (step && step.kind === 'defeat' && game.missions.defeated >= step.count) {
              advanceStep(game.missions, game);
              afterMissionEvent();
            }
          }
        });
        if (hitAnyone) audio.thud();
      }
      updateTracers(game.combat, scene, game.time);
    }

    // --- Driving ---------------------------------------------------------------
    if (game.inCar && game.playerCar) {
      const car = game.playerCar;
      const speed = drivePlayerCar(car, input, dt, world.colliders, allCars);
      game.playerX = car.x;
      game.playerZ = car.z;
      game.playerHeading = car.heading;
      audio.setEngine(Math.abs(speed) / 38, true);
      // Ease the camera behind the car when the mouse is idle (not in shot
      // mode, where the staged camera angle must stay put).
      if (Math.abs(dx) < 1 && !game.shotMode) {
        let dh = car.heading - game.cameraYaw;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        game.cameraYaw += dh * Math.min(1, dt * 1.2);
      }
      // Running over a pedestrian is a crime.
      for (const p of peds) {
        if (p.state === 'dead' || p.hostile) continue;
        if (Math.hypot(p.x - car.x, p.z - car.z) < 2.2 && Math.abs(speed) > 4) {
          p.state = 'dead';
          p.mesh.rotation.x = -Math.PI / 2;
          p.mesh.position.y = 0.4;
          addCrime(game.wanted, 1, 'hit a pedestrian');
          showToast(hud, 'You hit a pedestrian! The police are coming.', game.time);
          audio.thud();
        }
      }
      // Garage service while driving: E opens Rosa's Garage at the door.
      const shop = nearestShop(shops, { x: game.playerX, z: game.playerZ });
      const nearRaceStart = Math.hypot(game.playerX - PLACES.raceStart.x, game.playerZ - PLACES.raceStart.z) < 8;
      game.prompt = shop && shop.id === 'garage'
        ? `Press E — ${shop.name}`
        : nearRaceStart && raceUnlocked() && !game.repeatRace ? 'Press E — Street Race ($200 prize)' : '';
      if (input.interact) {
        if (shop && shop.id === 'garage') {
          openShop(shop);
          input.interact = false;
        } else if (nearRaceStart && raceUnlocked() && !game.repeatRace) {
          startRepeatRace();
          input.interact = false;
        } else {
          exitCar();
        }
      }
    } else {
      audio.setEngine(0, false);
    }

    // --- Traffic + pedestrians -------------------------------------------------
    for (const c of trafficCars) updateTraffic(c, dt, rand, world.colliders, allCars);
    const threat = game.inCar && game.playerCar && Math.abs(game.playerCar.speed) > 6
      ? { x: game.playerCar.x, z: game.playerCar.z }
      : game.wanted.stars >= 3 ? { x: game.playerX, z: game.playerZ } : null;
    for (const p of peds) {
      if (p.hostile) updateRival(p, dt, { x: game.playerX, z: game.playerZ }, game.health > 0, (rival, dist) => {
        // Rival shot: damage falls off with distance; tracer from the rival.
        const dmg = Math.max(3, 12 - dist * 0.3);
        game.health -= dmg;
        audio.gunshot();
        if (game.health <= 0) respawn('wasted');
      });
      else updatePed(p, dt, rand, world.colliders, threat);
    }

    // --- Race rival ------------------------------------------------------------
    if (game.raceRival && !game.raceRivalDone) {
      const rival = game.raceRival;
      const wps = game.raceWaypoints.length ? game.raceWaypoints : [PLACES.hospital];
      const wp = wps[Math.min(game.raceRivalWp, wps.length - 1)];
      const dx = wp.x - rival.x;
      const dz = wp.z - rival.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        if (game.raceRivalWp >= wps.length - 1) game.raceRivalDone = true;
        else game.raceRivalWp += 1;
      } else {
        rival.heading = Math.atan2(dx, dz);
        rival.x += Math.sin(rival.heading) * 13 * dt;
        rival.z += Math.cos(rival.heading) * 13 * dt;
        rival.mesh.position.set(rival.x, 0, rival.z);
        rival.mesh.rotation.y = rival.heading;
      }
    }

    // --- Police + wanted ---------------------------------------------------------
    if (!game.shotMode) spawnPoliceIfNeeded();
    spawnHeliIfNeeded();
    let nearestPolice = null;
    const playerPos = { x: game.playerX, z: game.playerZ };
    const playerSpeed = game.inCar && game.playerCar ? Math.abs(game.playerCar.speed) : 0;
    let touchOnFoot = false;
    for (const pc of policeCars) {
      let d;
      if (pc.driver === 'patrol' && game.wanted.stars === 0) {
        updateTraffic(pc, dt, rand, world.colliders, allCars);
        d = Math.hypot(pc.x - playerPos.x, pc.z - playerPos.z);
      } else {
        // SEARCH mode (G-TOP2): chase cars drive to the last-seen spot
        // instead of the player; the bust/ram check still uses the real
        // distance to the player.
        const chaseTarget = (game.policeMode === 'search' && game.searchZone)
          ? { x: game.searchZone.x, z: game.searchZone.z }
          : playerPos;
        updatePolice(pc, dt, chaseTarget, playerSpeed, world.colliders, allCars, game.wanted.stars, chaseTarget === playerPos && game.onFoot);
        d = Math.hypot(pc.x - playerPos.x, pc.z - playerPos.z);
      }
      if (nearestPolice === null || d < nearestPolice) nearestPolice = d;
      // Ramming the player hurts (in a car). A police car that reaches the
      // on-foot player grabs them — bust radius 4.5 m, wider than the
      // car-car bump radius (3.5 m), so a nearby parked car cannot shield
      // the player forever. The timer is accumulated once per frame below,
      // not per car: a far-away second car must not reset the timer that
      // a touching car just built up.
      if (game.inCar && game.playerCar) {
        if (d < 3.4) {
          game.playerCar.speed *= 0.92;
          game.health -= dt * 4;
          if (game.health <= 0) respawn('wasted');
        }
      } else if (d < 4.5) {
        touchOnFoot = true;
        game.prompt = 'The police are grabbing you… run!';
      }
    }
    if (touchOnFoot) {
      // Helicopter spotlight lock accelerates the bust (x2 after 3 s).
      const heliMult = heli.spotlit >= 3 ? 2 : 1;
      game.bustedTimer += dt * heliMult;
      if (game.bustedTimer > 2.5) respawn('busted');
    } else {
      game.bustedTimer = 0;
    }
    // Helicopter orbit + spotlight (only while wanted 4–5).
    if (heli.active) updateHelicopter(heli, dt, playerPos, game.onFoot, game.time);
    if (game.wanted.stars > 0) {
      const faded = updateWanted(game.wanted, dt, nearestPolice);
      if (faded) {
        showToast(hud, game.wanted.stars === 0 ? 'You lost the heat.' : `Heat dropping — ${game.wanted.stars} star${game.wanted.stars > 1 ? 's' : ''} left.`, game.time);
        if (game.wanted.stars === 0) audio.stopSiren();
      }
      if (game.wanted.stars > 0 && !audio.sirenOsc) audio.startSiren();
    }

    // --- Police SEARCH / line-of-sight (G-TOP2) ---------------------------
    // A chase unit "sees" Nico within 70 m with a clear line past the
    // buildings; the helicopter sees over the rooftops while it is up and
    // close. Lose sight for 3 s and the MVPD switches to SEARCH: they sweep
    // a 40 m zone around where you were last seen (drawn on the minimap).
    // Stay out of the zone and unseen for 10 s and the heat drops to zero;
    // get seen again and it is back to PURSUIT.
    if (game.wanted.stars > 0) {
      if (!game.lastSeen) game.lastSeen = { x: game.playerX, z: game.playerZ };
      let seen = false;
      for (const pc of policeCars) {
        if (pc.driver === 'patrol') continue;
        const d = Math.hypot(pc.x - game.playerX, pc.z - game.playerZ);
        if (d < 70 && hasLineOfSight(world.colliders, pc.x, pc.z, game.playerX, game.playerZ)) { seen = true; break; }
      }
      if (!seen && heli.active) {
        const hd = Math.hypot(heli.mesh.position.x - game.playerX, heli.mesh.position.z - game.playerZ);
        if (hd < 60) seen = true;
      }
      if (seen) {
        game.lastSeen = { x: game.playerX, z: game.playerZ };
        game.unseenTimer = 0;
        if (game.policeMode !== 'pursuit') {
          if (game.policeMode === 'search') showToast(hud, 'Spotted again — the MVPD is back on you!', game.time);
          game.policeMode = 'pursuit';
          game.searchZone = null;
        }
      } else {
        game.unseenTimer += dt;
        if (game.policeMode === 'pursuit' && game.unseenTimer > 3) {
          game.policeMode = 'search';
          game.searchZone = { x: game.lastSeen.x, z: game.lastSeen.z, r: 40 };
          showToast(hud, 'MVPD lost sight of you — search zone on the map. Get out of it!', game.time);
        } else if (game.policeMode === 'search' && game.unseenTimer > 10) {
          const dz = Math.hypot(game.playerX - game.searchZone.x, game.playerZ - game.searchZone.z);
          if (dz > game.searchZone.r + 5) {
            game.wanted.stars = 0;
            game.wanted.decayTimer = 0;
            game.policeMode = 'clear';
            game.searchZone = null;
            game.unseenTimer = 0;
            audio.stopSiren();
            showToast(hud, 'You lost the MVPD — clean getaway.', game.time);
          }
        } else if (game.policeMode === 'clear' && game.unseenTimer > 3) {
          game.policeMode = 'search';
          game.searchZone = { x: game.lastSeen.x, z: game.lastSeen.z, r: 40 };
        }
      }
    } else {
      game.policeMode = 'clear';
      game.searchZone = null;
      game.unseenTimer = 0;
    }

    // --- Repeatable street race progress (DESIGN §9.3) ----------------------
    if (game.repeatRace) {
      const rr = game.repeatRace;
      rr.elapsed += dt;
      rr.timer -= dt;
      const wps = game.raceWaypoints.length ? game.raceWaypoints : [PLACES.hospital];
      const target = wps[Math.min(rr.cp, wps.length - 1)];
      if (Math.hypot(game.playerX - target.x, game.playerZ - target.z) < 10) {
        if (rr.cp < wps.length - 1) {
          rr.cp += 1;
          audio.pickup();
          showToast(hud, `Checkpoint ${rr.cp}/3!`, game.time);
        } else {
          endRepeatRace(true);
        }
      } else if (game.raceRivalDone) {
        endRepeatRace(false);
      } else if (rr.timer <= 0) {
        showToast(hud, 'Out of time — race again!', game.time);
        endRepeatRace(false);
      }
    }

    // --- Missions ------------------------------------------------------------------
    game.objective = objectiveText(game.missions);
    if (game.repeatRace) {
      // The live race overrides the mission objective + beacon.
      const rr = game.repeatRace;
      game.objective = `Street Race: checkpoint ${rr.cp}/3 — ${Math.max(0, Math.ceil(rr.timer))} s left`;
      const wps = game.raceWaypoints.length ? game.raceWaypoints : [PLACES.hospital];
      game.missionTarget = wps[Math.min(rr.cp, wps.length - 1)];
    } else {
      // deliverCar: beacon points at the coupe until Nico is driving it.
      const stepNow = currentStep(game.missions);
      if (stepNow && stepNow.kind === 'deliverCar' && game.sportsCoupe && !(game.inCar && game.playerCar === game.sportsCoupe)) {
        game.missionTarget = { x: game.sportsCoupe.x, z: game.sportsCoupe.z, label: 'Sports Coupe' };
      } else {
        game.missionTarget = stepTarget(game.missions);
      }
    }
    updateBeacon(beacon, game.missionTarget, game.time);
    checkMissionProgress(dt);
    const banner = game.missions.banner;
    if (banner && game.time < banner.until && !hud.banner.classList.contains('show')) {
      showBanner(hud, banner.title, banner.text);
    }

    // --- Pause / mission brief -------------------------------------------------------
    if (input.pause) {
      game.state = 'paused';
      pauseEl.classList.add('show');
      document.exitPointerLock?.();
    }
    // M opens the full map (DESIGN §10.6) — the mission brief lives there now.
    if (input.mission) openMap(hud, game);
  }

  function updateCamera(dt) {
    const target = game.inCar && game.playerCar
      ? { x: game.playerCar.x, y: 1.6, z: game.playerCar.z }
      : { x: game.playerX, y: 1.6, z: game.playerZ };
    const dist = game.cameraDistOverride ?? (game.inCar ? 10.5 : 7.5);
    const cy = Math.sin(game.cameraPitch) * dist;
    const ch = Math.cos(game.cameraPitch) * dist;
    const cx = target.x - Math.sin(game.cameraYaw) * ch;
    const cz = target.z - Math.cos(game.cameraYaw) * ch;
    camera.position.set(cx, target.y + cy, cz);
    camera.lookAt(target.x, target.y, target.z);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
  // Debug/testing handle: the finalist review plays the game by hand, and
  // this lets an automated playtest read the same state a player would see.
  window.__game = game;
  return game;
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('load-error').textContent = `Failed to start: ${err.message}`;
  document.getElementById('load-error').style.display = 'block';
});
