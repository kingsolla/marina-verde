// Marina Verde — the game itself. Boots three.js, builds the city, and runs the
// loop: on-foot third-person movement, arcade driving, traffic, pedestrians,
// police and wanted level, five story missions, combat, HUD + minimap, save,
// pause, and the screenshot staging hook (?shot=...).
import * as THREE from 'three';
import { CITY, PLAYER, PLACES, STORY_INTRO, MISSIONS } from './config.js';
import { mulberry32, pick, range } from './rng.js';
import { buildWorld, collideCircle, clampToCity } from './world.js';
import { createCar, drivePlayerCar, makeTrafficCar, updateTraffic, spawnParkedCars } from './vehicles.js';
import { createPed, updatePed, spawnPeds, makePersonMesh } from './peds.js';
import { createWanted, addCrime, policeDemand, spawnPoliceCar, updatePolice, updateWanted } from './police.js';
import { createMissionState, currentMission, currentStep, objectiveText, stepTarget, advanceStep, startMission, createBeacon, updateBeacon } from './missions.js';
import { createCombat, shoot, punch, updateRival, updateTracers } from './combat.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud, updateHud, drawMinimap, showToast, showBanner, showDialog } from './hud.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'marina-verde-save-v1';

export function createGame() {
  const game = {
    time: 0,
    clock: 16 * 60 + 40, // 16:40, golden hour
    state: 'title', // title | playing | paused | busted | wasted
    money: 250,
    health: PLAYER.maxHealth,
    wanted: createWanted(),
    missions: createMissionState(),
    combat: createCombat(),
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
    rivalSpawned: false,
    shotMode: null,
  };
  return game;
}

function buildPlayerMesh() {
  const mesh = makePersonMesh(0x2f8f8a, 0x2a2f38, 0xf2c9a0);
  // Nico Vale: teal jacket, dark jeans, a cap.
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.12, 0.38),
    new THREE.MeshLambertMaterial({ color: 0xf2c230 }),
  );
  cap.position.y = 1.92;
  mesh.add(cap);
  return mesh;
}

export async function boot() {
  const params = new URLSearchParams(location.search);
  const shotName = params.get('shot');
  const game = createGame();
  game.shotMode = shotName;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  const world = buildWorld(scene);
  const rand = mulberry32(CITY.SEED + 7);

  const audio = createAudio();
  const input = createInput();
  const hud = createHud();
  const beacon = createBeacon(scene);

  // --- Player --------------------------------------------------------------
  const playerMesh = buildPlayerMesh();
  playerMesh.position.set(game.playerX, 0, game.playerZ);
  scene.add(playerMesh);
  game.playerMesh = playerMesh;
  let walkPhase = 0;

  // --- Cars ------------------------------------------------------------------
  const allCars = [];
  const parked = spawnParkedCars(scene, rand, 12);
  allCars.push(...parked);
  const trafficCars = [];
  for (let i = 0; i < 14; i += 1) {
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
  const peds = spawnPeds(scene, rand, 26);
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
    const want = policeDemand(game.wanted.stars);
    while (policeCars.length < want) {
      // Spawn at a road edge away from the player.
      const angle = range(rand, 0, Math.PI * 2);
      const x = game.playerX + Math.cos(angle) * 70;
      const z = game.playerZ + Math.sin(angle) * 70;
      const clamped = clampToCity(x, z);
      const car = spawnPoliceCar(scene, clamped.x, clamped.z, Math.atan2(game.playerX - clamped.x, game.playerZ - clamped.z));
      policeCars.push(car);
      allCars.push(car);
    }
    while (policeCars.length > want) {
      const car = policeCars.pop();
      scene.remove(car.mesh);
      const i = allCars.indexOf(car);
      if (i >= 0) allCars.splice(i, 1);
    }
  }

  function enterCar(car) {
    if (car.driver === 'traffic') {
      addCrime(game.wanted, 1, 'stolen car');
      showToast(hud, 'Car stolen! The police are on their way.', game.time);
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

  function spawnRivals() {
    if (game.rivalSpawned) return;
    game.rivalSpawned = true;
    for (let i = 0; i < 2; i += 1) {
      const p = createPed(PLACES.alley.x + (i - 0.5) * 5, PLACES.alley.z + 4, rand, true);
      p.mesh.userData.pedRef = p;
      scene.add(p.mesh);
      rivals.push(p);
      peds.push(p);
    }
    showDialog(hud, 'Marco', 'There they are — the crew guarding the drop. Take them down, Nico.', 6);
  }

  function afterMissionEvent() {
    const m = currentMission(game.missions);
    if (!m) {
      if (game.missions.done) {
        showBanner(hud, 'MARINA VERDE COMPLETE', 'All five jobs done. Nico Vale is a legend of the coast. Free roam — the city is yours.');
        audio.cash();
      }
      return;
    }
    const step = currentStep(game.missions);
    if (m.id === 'heat-wave' && step.kind === 'loseWanted') {
      game.wanted.stars = 3;
      game.wanted.heat = 0;
      spawnPoliceIfNeeded();
      showDialog(hud, 'Marco', 'Three stars, Nico. Break line of sight, stay clean, and let the heat die down.', 6);
      audio.startSiren();
    }
    if (m.id === 'the-drop' && step.kind === 'goto' && step.at === 'alley') {
      spawnRivals();
    }
    if (m.id === 'grand-getaway') {
      game.wanted.stars = 4;
      game.wanted.heat = 0;
      spawnPoliceIfNeeded();
      audio.startSiren();
      showDialog(hud, 'Rosa', 'The whole force is coming. Drive to the yacht — don\'t stop for anything.', 6);
    }
  }

  function onMissionComplete(m) {
    showBanner(hud, `Job complete — $${m.reward}`, m.id === 'grand-getaway' ? 'You made it to the yacht. Marina Verde is yours.' : 'Money banked. The next job is waiting.');
    audio.cash();
    audio.stopSiren();
  }
  game.onMissionComplete = onMissionComplete;

  function checkMissionProgress() {
    const m = currentMission(game.missions);
    if (!m) return;
    const step = currentStep(game.missions);
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
    }
  }

  function respawn(reason) {
    game.health = PLAYER.maxHealth;
    game.wanted.stars = 0;
    game.wanted.decayTimer = 0;
    audio.stopSiren();
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
  }

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
      game.playerX = s.x ?? PLACES.spawn.x;
      game.playerZ = s.z ?? PLACES.spawn.z;
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

  // --- Shot staging ----------------------------------------------------------
  if (shotName) {
    titleEl.classList.remove('show');
    game.state = 'playing';
    startMission(game.missions, game, 0);
    stageShot(shotName, game, { scene, camera, hud, world, rand, enterCar, spawnPoliceIfNeeded, spawnRivals, audio });
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

  function animate() {
    requestAnimationFrame(animate);
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
      update(dt);
    }
    // Camera + render always run, so the title screen shows the city behind it.
    updateCamera(dt);
    updateHud(hud, game);
    drawMinimap(hud, game);
    world.beacon.material.opacity = 0.6 + Math.sin(game.time * 3) * 0.25;
    if (world.lighthouseLamp) world.lighthouseLamp.material.color.setHex(Math.floor(game.time * 1.4) % 2 === 0 ? 0xfff2a0 : 0xffe08a);
    renderer.render(scene, camera);
    input.consumeEdges();
  }

  function update(dt) {
    game.clock += dt * 0.5; // one game minute every 2 seconds
    if (game.health < PLAYER.maxHealth) game.health = Math.min(PLAYER.maxHealth, game.health + dt * 1.2);

    // Camera orbit from the mouse.
    const { dx, dy } = input.consumeMouse();
    game.cameraYaw -= dx * 0.0032;
    game.cameraPitch = Math.max(0.05, Math.min(1.1, game.cameraPitch + dy * 0.0022));

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

      // Prompt + enter a car. Clear the edge trigger right away: the driving
      // branch below runs in the same frame and would otherwise read the
      // same E press as "exit the car".
      const near = nearestCar(4.2);
      game.prompt = near ? (near.driver === 'traffic' ? 'Press E to steal the car' : near.driver === 'police' ? 'Press E to steal the police car' : 'Press E to get in the car') : '';
      if (input.interact && near) {
        enterCar(near);
        input.interact = false;
      }

      // Combat on foot.
      game.combat.cooldown = Math.max(0, game.combat.cooldown - dt);
      game.combat.punchCooldown = Math.max(0, game.combat.punchCooldown - dt);
      if (input.shoot && game.combat.ammo > 0) {
        const from = new THREE.Vector3(game.playerX, 1.5, game.playerZ);
        const dir = new THREE.Vector3(Math.sin(game.playerHeading), 0.02, Math.cos(game.playerHeading)).normalize();
        const fired = shoot(game.combat, scene, from, dir, rivals, (ped, killed) => {
          if (killed) {
            game.missions.defeated += 1;
            addCrime(game.wanted, 1, 'rival down');
            showToast(hud, 'Rival down.', game.time);
            const step = currentStep(game.missions);
            if (step && step.kind === 'defeat' && game.missions.defeated >= step.count) {
              advanceStep(game.missions, game);
              afterMissionEvent();
            }
          }
        });
        if (fired) {
          audio.gunshot();
          addCrime(game.wanted, 0, 'shot fired');
        }
      } else if (input.shoot) {
        showToast(hud, 'Out of ammo — find the green pickup crates.', game.time);
      }
      if (input.punch) {
        const hitAnyone = punch(game.combat, { x: game.playerX, z: game.playerZ }, game.playerHeading, rivals, (ped, killed) => {
          if (killed) {
            game.missions.defeated += 1;
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
      if (input.interact) exitCar();
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

    // --- Police + wanted ---------------------------------------------------------
    spawnPoliceIfNeeded();
    let nearestPolice = null;
    const playerPos = { x: game.playerX, z: game.playerZ };
    const playerSpeed = game.inCar && game.playerCar ? Math.abs(game.playerCar.speed) : 0;
    for (const pc of policeCars) {
      const d = updatePolice(pc, dt, playerPos, playerSpeed, world.colliders, allCars);
      if (nearestPolice === null || d < nearestPolice) nearestPolice = d;
      // Ramming the player hurts; touching the player on foot busts them.
      if (d < 3.4) {
        if (game.inCar && game.playerCar) {
          game.playerCar.speed *= 0.92;
          game.health -= dt * 4;
          if (game.health <= 0) respawn('wasted');
        } else {
          game.bustedTimer += dt;
          game.prompt = 'The police are grabbing you… run!';
          if (game.bustedTimer > 2.5) respawn('busted');
        }
      } else {
        game.bustedTimer = 0;
      }
    }
    if (game.wanted.stars > 0) {
      const faded = updateWanted(game.wanted, dt, nearestPolice);
      if (faded) {
        showToast(hud, game.wanted.stars === 0 ? 'You lost the heat.' : `Heat dropping — ${game.wanted.stars} star${game.wanted.stars > 1 ? 's' : ''} left.`, game.time);
        if (game.wanted.stars === 0) audio.stopSiren();
      }
      if (game.wanted.stars > 0 && !audio.sirenOsc) audio.startSiren();
    }

    // --- Missions ------------------------------------------------------------------
    game.objective = objectiveText(game.missions);
    game.missionTarget = stepTarget(game.missions);
    updateBeacon(beacon, game.missionTarget, game.time);
    checkMissionProgress();
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
    if (input.mission) {
      const m = currentMission(game.missions);
      if (m) showDialog(hud, m.giver, `${m.title} — ${m.brief}`, 7);
    }
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
