// Marina Verde — cars. One factory builds every car mesh (player cars, traffic,
// police); one arcade physics step drives the player's car; one AI step drives
// traffic along the road grid.
import * as THREE from 'three';
import { CAR, PALETTE, ROAD_LINES } from './config.js';
import { mulberry32, pick, range } from './rng.js';
import { collideCircle } from './world.js';

export function makeCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 2.2), darkMat);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  // Hood + trunk hints.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.9), bodyMat);
  hood.position.set(0, 0.95, 1.75);
  group.add(hood);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights + taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const s of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), headMat);
    h.position.set(s, 0.62, 2.22);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), tailMat);
    t.position.set(s, 0.62, -2.22);
    group.add(t);
  }
  let lightBar = null;
  if (isPolice) {
    // White body with black doors is handled by the caller's colour; the light
    // bar is the giveaway, plus a roof number plate.
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.35;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.62, -0.25);
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }
  group.userData = { wheels, lightBar };
  return group;
}

export function createCar(x, z, heading, color, isPolice = false) {
  const mesh = makeCarMesh(color, isPolice);
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
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    ai: null,
    health: 100,
    stuck: 0,
  };
}

// --- Player arcade driving -------------------------------------------------
export function drivePlayerCar(car, input, dt, colliders, others) {
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const reversing = car.speed < -0.5;

  if (forward) car.speed += CAR.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
  if (!forward && !back) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));

  const steerTarget = steerInput * (reversing ? -1 : 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * CAR.grip);
  const turn = car.steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 6);
  car.heading += turn;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(colliders, nx, nz, 1.9);
  const blocked = hit.x !== nx || hit.z !== nz;
  car.x = hit.x;
  car.z = hit.z;
  if (blocked) car.speed *= 0.55;
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
  // Body roll and pitch, tiny but felt.
  car.mesh.rotation.z = -car.steer * Math.min(1, Math.abs(car.speed) / 20) * 0.05;
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
  const car = createCar(pos.x, pos.z, heading, pick(rand, PALETTE.car));
  car.driver = 'traffic';
  car.ai = {
    axis: line.axis,
    dir,
    speed: range(rand, 7, 12),
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
    const car = createCar(x, z, heading, pick(rand, PALETTE.car));
    car.driver = null;
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}
