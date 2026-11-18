// Marina Verde — cars. One factory builds every car mesh (player cars, traffic,
// police); one arcade physics step drives the player's car; one AI step drives
// traffic along the road grid. v2 adds body styles (sedan / sport / van),
// a handbrake/drift (Space), smoother 16-segment wheels and a beveled look
// (sloped windshield, fenders, spoiler on the sport style).
import * as THREE from 'three';
import { CAR, PALETTE, ROAD_LINES } from './config.js';
import { mulberry32, pick, range } from './rng.js';
import { collideCircle } from './world.js';
import { makeGlowSprite } from './graphics-polish.js';

// Shared geometries + trim materials (P7 cleanup): every car reuses the
// same boxes/cylinders instead of allocating its own per car — fewer unique
// geometries in the scene, zero visual change (rotation/scale live on the
// meshes, never on the geometry). The BODY material stays per-car: repaint,
// the garage and the follow-target grey sedan all mutate bodyMat.color.
const SHARED_GEO = {
  body: {
    sedan: new THREE.BoxGeometry(2, 0.7, 4.4),
    sport: new THREE.BoxGeometry(2, 0.55, 5.0),
    van: new THREE.BoxGeometry(2, 1.15, 4.8),
  },
  shield: new THREE.BoxGeometry(1.7, 0.08, 1.1),
  cabin: {
    sedan: new THREE.BoxGeometry(1.7, 0.62, 2.2),
    van: new THREE.BoxGeometry(1.7, 0.9, 2.6),
  },
  hood: new THREE.BoxGeometry(1.9, 0.16, 0.9),
  spoiler: new THREE.BoxGeometry(1.8, 0.08, 0.4),
  strut: new THREE.BoxGeometry(0.1, 0.35, 0.1),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.3, 16),
  lightBar: new THREE.BoxGeometry(1.5, 0.18, 0.1),
};
const SHARED_MAT = {
  dark: new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  wheel: new THREE.MeshLambertMaterial({ color: 0x141414 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff6c0 }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
};

// Polish 2 Q1: lower / wider / sleeker proportions via MESH TRANSFORMS
// only — the shared BoxGeometry/CylinderGeometry above is never mutated,
// so every car sharing it keeps its own look, and the collider / root /
// wheel references / Box3 collision are untouched. opts.glow adds tail
// glow sprites, but ONLY for the hero sports coupe and police cars (halo
// budget: at most 2 + 5 sprites; traffic never gets them).
export function makeCarMesh(color, isPolice = false, style = 'sedan', opts = {}) {
  const group = new THREE.Group();
  const isSport = style === 'sport';
  const isVan = style === 'van';
  // v2 polish P4 (Sol correction): ALL styles MeshStandardMaterial, but
  // metalness LOW — without an env map, metalness 0.35 darkens the paint
  // (diffuse is taken away and nothing reflects back). Start 0-0.1 with
  // roughness 0.35-0.45; the hero coupe is verified in the cover capture.
  // Glass / tyres / trim stay OUT of the paint material (darkMat, as before).
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.4, metalness: isSport ? 0.1 : 0.05,
  });
  const darkMat = SHARED_MAT.dark;
  const len = isSport ? 5.0 : isVan ? 4.8 : 4.4;
  const bodyH = isVan ? 1.15 : isSport ? 0.55 : 0.7;
  const bodyY = isVan ? 0.85 : isSport ? 0.44 : 0.52;
  // Visual body height after the mesh-scale below (sport is squashed
  // flatter, sedan slightly lower); part positions use this, not bodyH.
  const visH = bodyH * (isSport ? 0.8 : isVan ? 1 : 0.92);
  const body = new THREE.Mesh(SHARED_GEO.body[style] ?? SHARED_GEO.body.sedan, bodyMat);
  body.position.y = bodyY;
  if (isSport) body.scale.set(1.08, 0.8, 1.02);
  else if (!isVan) body.scale.set(1.03, 0.92, 1);
  body.castShadow = true;
  group.add(body);
  // Sloped windshield plane + cabin (beveled look, not a plain box).
  const shield = new THREE.Mesh(SHARED_GEO.shield, darkMat);
  shield.position.set(0, bodyY + visH / 2 + 0.28, isSport ? 0.95 : 0.85);
  shield.rotation.x = isSport ? 0.62 : 0.5;
  group.add(shield);
  const cabin = new THREE.Mesh(
    isVan ? SHARED_GEO.cabin.van : SHARED_GEO.cabin.sedan,
    isVan ? bodyMat : darkMat,
  );
  cabin.position.set(0, bodyY + visH / 2 + (isVan ? 0.45 : 0.28), isVan ? 0 : isSport ? -0.35 : -0.25);
  if (isSport) cabin.scale.set(1, 0.85, 0.95);
  cabin.castShadow = true;
  group.add(cabin);
  // Fender half-cylinders were cut for draw-call budget (DESIGN §8): the
  // body + sloped windshield + spoiler already give the car its shape.
  // Hood + trunk hints.
  const hood = new THREE.Mesh(SHARED_GEO.hood, bodyMat);
  hood.position.set(0, bodyY + visH / 2 + 0.02, len / 2 - 0.45);
  if (isSport) { hood.rotation.x = 0.08; hood.scale.set(1.04, 1, 1.15); }
  group.add(hood);
  if (isSport) {
    // Spoiler on the sport style — wider + deeper wing, on taller struts.
    const spoiler = new THREE.Mesh(SHARED_GEO.spoiler, darkMat);
    spoiler.scale.set(1.12, 1, 1.7);
    spoiler.position.set(0, bodyY + 0.72, -len / 2 + 0.25);
    group.add(spoiler);
    for (const s of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(SHARED_GEO.strut, darkMat);
      strut.scale.set(1, 1.25, 1);
      strut.position.set(s, bodyY + 0.55, -len / 2 + 0.25);
      group.add(strut);
    }
    // (No extra splitter mesh: the sport look comes from the transforms
    // above — one more mesh per sport car would cost ~8 draw calls city-wide.)
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(SHARED_GEO.wheel, SHARED_MAT.wheel);
    wheel.rotation.z = Math.PI / 2;
    // Bigger, more visible wheels (transform only): radius 0.36 -> ~0.40.
    wheel.scale.set(1.1, 1.1, 1.1);
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlight + taillight bars (one mesh each — draw-call budget, DESIGN §8).
  const headBar = new THREE.Mesh(SHARED_GEO.lightBar, SHARED_MAT.head);
  headBar.position.set(0, bodyY, len / 2 + 0.02);
  if (isSport) headBar.scale.set(1.06, 1.3, 1);
  group.add(headBar);
  const tailBar = new THREE.Mesh(SHARED_GEO.lightBar, SHARED_MAT.tail);
  tailBar.position.set(0, bodyY, -len / 2 - 0.02);
  if (isSport) tailBar.scale.set(1.06, 2.0, 1);
  group.add(tailBar);
  // Tail glow (hero coupe only): two red halo sprites at the tail corners.
  // Traffic / parked sports get none — halo budget (max 16 visible).
  if (opts.glow && isSport) {
    for (const s of [-0.7, 0.7]) {
      const glow = makeGlowSprite(0xff2a2a, 0.65, 2.6);
      glow.position.set(s, bodyY, -len / 2 - 0.15);
      group.add(glow);
    }
  }
  let lightBar = null;
  if (isPolice) {
    // White body with black doors is handled by the caller's colour; the light
    // bar is the giveaway, plus a roof number plate.
    // v2 polish: the bar sits HIGH (centre +0.78 over the body top, boxes
    // 0.4 tall) so it clears the cabin roofline (1.49) — at +0.55 it was
    // embedded in the cabin and invisible from behind/side. It must read
    // as red/blue at night from 20 m.
    // The two boxes run ALONG the car's length (not across its width):
    // from a side view only one width-wise box faces the camera, and half
    // the time it is the dim flash phase; length-wise both boxes stay
    // visible, so one bright + one dim always reads as a light bar.
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.35), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.z = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.35), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.z = 0.3;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, bodyY + visH / 2 + 0.78, -0.25);
    lightBar.userData = { red, blue };
    group.add(lightBar);
    // One glow sprite over the light bar (police only): reads as a flashing
    // beacon at night from 20 m. Halo budget counts it (<= 5 police).
    if (opts.glow) {
      const barGlow = makeGlowSprite(0xff5566, 0.35, 3.2);
      barGlow.position.set(0, bodyY + visH / 2 + 0.78, -0.25);
      group.add(barGlow);
    }
  }
  group.userData = { wheels, lightBar, bodyMat, style };
  return group;
}

export function createCar(x, z, heading, color, isPolice = false, style = 'sedan', opts = {}) {
  const mesh = makeCarMesh(color, isPolice, style, opts);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    mesh,
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    color,
    isPolice,
    style,
    // Sport is +15% top speed, van is -15%.
    maxSpeedMul: style === 'sport' ? 1.15 : style === 'van' ? 0.85 : 1,
    handicap: 1, // mission damage (mission 11 in v1 design) lowers this
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    ai: null,
    health: 100,
    stuck: 0,
  };
}

// --- Player arcade driving -------------------------------------------------
// input.handbrake (Space): turn rate x1.6, speed decays faster, grip drops so
// the rear slides — a drift.
export function drivePlayerCar(car, input, dt, colliders, others) {
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const reversing = car.speed < -0.5;
  const handbrake = !!input.handbrake;
  const maxSpeed = CAR.maxSpeed * (car.maxSpeedMul ?? 1) * (car.handicap ?? 1);

  if (forward) car.speed += CAR.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
  if (!forward && !back) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (handbrake ? 20 : 8) * dt);
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
  car.speed = Math.max(-CAR.maxReverse, Math.min(maxSpeed, car.speed));

  const steerTarget = steerInput * (reversing ? -1 : 1);
  const grip = handbrake ? CAR.grip * 0.45 : CAR.grip;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * grip);
  const turnRate = CAR.turnRate * (handbrake ? 1.6 : 1);
  const turn = car.steer * turnRate * dt * Math.min(1, Math.abs(car.speed) / 6);
  car.heading += turn;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(colliders, nx, nz, 1.9);
  const blocked = hit.x !== nx || hit.z !== nz;
  car.x = hit.x;
  car.z = hit.z;
  // Hard wall hit: the car's CONDITION (health) drops — the car panel shows
  // it, Rosa's Garage repairs it (DESIGN §10.5).
  if (blocked) {
    if (Math.abs(car.speed) > 8) car.health = Math.max(0, car.health - Math.min(8, Math.abs(car.speed) * 0.3));
    car.speed *= 0.55;
  }
  // Soft bumps against other cars.
  for (const o of others) {
    if (o === car) continue;
    const dx = car.x - o.x;
    const dz = car.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 12 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      car.x = o.x + (dx / d) * 3.5;
      car.z = o.z + (dz / d) * 3.5;
      car.speed *= 0.7;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Wheel spin + front-wheel steer for life.
  const wheels = car.mesh.userData.wheels;
  for (let i = 0; i < wheels.length; i += 1) {
    wheels[i].rotation.x += car.speed * dt * 2.4;
    if (i < 2) wheels[i].rotation.y = car.steer * 0.32;
  }
  // Body roll and pitch, tiny but felt; a handbrake slide leans harder.
  car.mesh.rotation.z = -car.steer * Math.min(1, Math.abs(car.speed) / 20) * (handbrake ? 0.09 : 0.05);
  car.mesh.rotation.x = -Math.min(1, Math.abs(car.speed) / 30) * 0.02 * (car.speed >= 0 ? 1 : -1);
  return car.speed;
}

// --- Traffic AI ------------------------------------------------------------
// A traffic car drives along one road, and at each intersection may turn.
export function makeTrafficCar(rand, x, z) {
  const lines = ROAD_LINES.filter((l) => Math.abs(l.at) <= 156);
  const line = pick(rand, lines);
  const alongX = line.axis === 'x';
  const dir = rand() < 0.5 ? 1 : -1;
  const lane = range(rand, -2.4, 2.4);
  const pos = alongX
    ? { x: range(rand, -170, 170), z: line.at + lane }
    : { x: line.at + lane, z: range(rand, -170, 170) };
  const heading = alongX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  const style = rand() < 0.18 ? 'sport' : rand() < 0.18 ? 'van' : 'sedan';
  const car = createCar(pos.x, pos.z, heading, pick(rand, PALETTE.car), false, style);
  car.driver = 'traffic';
  car.ai = {
    axis: line.axis,
    dir,
    speed: range(rand, 7, 12) * (style === 'sport' ? 1.1 : style === 'van' ? 0.9 : 1),
    turnAt: null,
    wait: 0,
  };
  return car;
}

function nearestLine(value) {
  let best = ROAD_LINES[0];
  let bestD = Infinity;
  for (const l of ROAD_LINES) {
    const d = Math.abs(l.at - value);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

export function updateTraffic(car, dt, rand, colliders, allCars) {
  const ai = car.ai;
  if (!ai) return;
  if (ai.wait > 0) {
    ai.wait -= dt;
    return;
  }
  // Slow down for a car ahead on the same lane.
  let targetSpeed = ai.speed;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const o of allCars) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 9 && side < 2.6) targetSpeed = Math.min(targetSpeed, 0);
  }
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const along = ai.axis === 'x' ? car.x : car.z;
  const cross = ai.axis === 'x' ? car.z : car.x;
  const line = nearestLine(cross);
  if (Math.abs(cross - line.at) < 1.2 && (ai.turnAt === null || Math.abs(along - ai.turnAt) > 40)) {
    ai.turnAt = along;
    if (rand() < 0.35) {
      const newDir = rand() < 0.5 ? 1 : -1;
      const oldAxis = ai.axis;
      ai.axis = oldAxis === 'x' ? 'z' : 'x';
      ai.dir = newDir;
      car.heading = ai.axis === 'x' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : newDir > 0 ? 0 : Math.PI;
      // Snap onto the new road's lane so the car stays centred.
      if (oldAxis === 'x') car.z = line.at + (newDir > 0 ? 2.4 : -2.4);
      else car.x = line.at + (newDir > 0 ? 2.4 : -2.4);
      ai.wait = 0.1;
    }
  }
  // Loop back at the city edge.
  if (car.x > 185 || car.x < -185 || car.z > 195 || car.z < -185) {
    car.x = -car.x * 0.9;
    car.z = -car.z * 0.9;
    car.heading += Math.PI;
    ai.dir = -ai.dir;
  }
  const hit = collideCircle(colliders, car.x, car.z, 1.9);
  car.x = hit.x;
  car.z = hit.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels;
  for (const w of wheels) w.rotation.x += car.speed * dt * 2.4;
}

export function spawnParkedCars(scene, rand, count) {
  const cars = [];
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const line = pick(rand, ROAD_LINES.filter((l) => Math.abs(l.at) <= 156));
    const alongX = line.axis === 'x';
    const t = range(rand, -170, 170);
    const side = rand() < 0.5 ? 4.6 : -4.6;
    const x = alongX ? t : line.at + side;
    const z = alongX ? line.at + side : t;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) continue;
    spots.push({ x, z });
    const heading = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
    const style = rand() < 0.18 ? 'sport' : rand() < 0.18 ? 'van' : 'sedan';
    const car = createCar(x, z, heading, pick(rand, PALETTE.car), false, style);
    car.driver = null;
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}
