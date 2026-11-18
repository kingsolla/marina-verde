// Marina Verde — wanted level and the marina police. Stars rise with crimes and
// fade when the player stays clean and out of sight; police cars spawn at the
// city edge, chase, ram, and try to bust the player on foot.
import { createCar } from './vehicles.js';
import { WANTED } from './config.js';
import { collideCircle } from './world.js';

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // seconds since the last crime
    seenTimer: 0, // seconds a cop has been touching the player on foot
    decayTimer: 0,
  };
}

export function addCrime(wanted, stars, reason) {
  wanted.stars = Math.min(WANTED.maxStars, wanted.stars + stars);
  wanted.heat = 0;
  wanted.decayTimer = 0;
  return reason;
}

// How many police cars the current heat calls for.
export function policeDemand(stars) {
  if (stars <= 0) return 0;
  if (stars === 1) return 1;
  if (stars === 2) return 1;
  if (stars === 3) return 2;
  if (stars === 4) return 3;
  return 4;
}

// Callsigns for the MVPD RESPONSE panel (DESIGN §10.2): UNIT 11, UNIT 12, …
let _callsign = 10;
export function spawnPoliceCar(scene, x, z, heading) {
  const car = createCar(x, z, heading, 0xf2f2f2, true);
  car.driver = 'police';
  car.callsign = `UNIT ${String((_callsign += 1)).padStart(2, '0')}`;
  car.ai = { speed: 0, ram: 0 };
  scene.add(car.mesh);
  return car;
}

// Steer a police car toward the player with a simple pursuit + ramming model.
// At 5 stars the police are 10% faster (DESIGN §3). When the player is on
// foot and the car is right on top of them it STOPS (targetSpeed 0) so the
// bust can actually land — otherwise it would drive straight through at
// 6 m/s and the 2.5 s bust timer could never complete (G-TOP2 fix).
export function updatePolice(car, dt, playerPos, playerSpeed, colliders, allCars, stars = 0, playerOnFoot = false) {
  const dx = playerPos.x - car.x;
  const dz = playerPos.z - car.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const turnRate = 2.6;
  car.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, dh));
  // Police are a touch faster than the player's top speed at high stars, and
  // they ram: full throttle when lined up, brake when very close.
  const boost = stars >= 5 ? 1.1 : 1;
  const targetSpeed = dist < 4 ? (playerOnFoot ? 0 : 6) : Math.min(40, 24 + playerSpeed * 0.55 + dist * 0.05) * boost;
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
  // Hard stop on top of an on-foot player: the car must not overshoot and
  // drive through them (that made the 2.5 s bust timer unreachable).
  if (playerOnFoot && dist < 4) car.speed = 0;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(colliders, nx, nz, 1.9);
  if (hit.x === nx && hit.z === nz) {
    car.x = nx;
    car.z = nz;
  } else {
    car.speed *= 0.4;
    car.heading += 0.6 * dt;
  }
  for (const o of allCars) {
    if (o === car) continue;
    const ox = car.x - o.x;
    const oz = car.z - o.z;
    const d2 = ox * ox + oz * oz;
    if (d2 < 12 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      car.x = o.x + (ox / d) * 3.5;
      car.z = o.z + (oz / d) * 3.5;
      car.speed *= 0.75;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels;
  for (const w of wheels) w.rotation.x += car.speed * dt * 2.4;
  // Flash the light bar: red on one beat, blue on the next.
  const bar = car.mesh.userData.lightBar;
  if (bar) {
    const phase = Math.floor(performance.now() / 260) % 2 === 0;
    bar.userData.red.material.color.setHex(phase ? 0xff2222 : 0x550000);
    bar.userData.blue.material.color.setHex(phase ? 0x002266 : 0x2266ff);
  }
  return dist;
}

// Wanted decay: only while no crime recently and no police car is close.
export function updateWanted(wanted, dt, nearestPoliceDist) {
  if (wanted.stars === 0) return false;
  wanted.heat += dt;
  if (wanted.heat > 8 && (nearestPoliceDist === null || nearestPoliceDist > 70)) {
    wanted.decayTimer += dt;
    if (wanted.decayTimer >= WANTED.decaySeconds) {
      wanted.stars -= 1;
      wanted.decayTimer = 0;
      return true;
    }
  } else {
    wanted.decayTimer = 0;
  }
  return false;
}
