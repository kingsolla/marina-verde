// Marina Verde — pedestrians. They stroll the sidewalks, cross at corners, and
// scatter when a car comes at them or the wanted level climbs. A few are
// scripted as rival crew for the combat mission. v2: sphere heads, slightly
// rounded (cylinder) torsos, beach tourist variants with sun hats, and more
// shirt colours — 40 peds in the city.
import * as THREE from 'three';
import { mulberry32, pick, range, rangeInt, chance } from './rng.js';
import { ROAD_LINES } from './config.js';
import { collideCircle } from './world.js';

const SHIRTS = [0xff8a5c, 0x38b6a0, 0xf2c230, 0xc96fd0, 0x5a8fd0, 0xe8e8e8, 0x7a9b5a, 0xff5a8a, 0x2fd0a8, 0xffd24a];
const SKINS = [0xf2c9a0, 0xd9a066, 0x8a5a34, 0xf7d7b0];
const PANTS = [0x2a2f38, 0x4a5a7a, 0x7a6a4a, 0x3a3f46];

export function makePersonMesh(shirt, pants, skin, hostile = false, tourist = false) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pantsMat);
  legL.position.set(-0.14, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  // Rounded torso: a slightly tapered cylinder instead of a box.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.72, 12), shirtMat);
  torso.position.y = 1.16;
  torso.scale.z = 0.62;
  // Sphere head (v2 — no more box heads). Shoulder spheres were cut for the
  // draw-call budget (DESIGN §8); the rounded torso carries the silhouette.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skinMat);
  head.position.y = 1.74;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirtMat);
  armL.position.set(-0.42, 1.18, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  for (const m of [legL, legR, torso, head, armL, armR]) m.castShadow = true;
  g.add(legL, legR, torso, head, armL, armR);
  g.userData = { legL, legR, armL, armR, torso, head };
  if (hostile) {
    // Rival crew wear red bandanas: a red box on the head.
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38), new THREE.MeshLambertMaterial({ color: 0xd94040 }));
    band.position.y = 1.86;
    g.add(band);
  }
  if (tourist) {
    // Beach tourist: a straw sun hat (cone + brim disc).
    const hatMat = new THREE.MeshLambertMaterial({ color: 0xf2d8a7 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), hatMat);
    brim.position.y = 1.9;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 12), hatMat);
    top.position.y = 2.0;
    g.add(brim, top);
  }
  return g;
}

export function createPed(x, z, rand, hostile = false) {
  const tourist = !hostile && chance(rand, 0.18);
  const mesh = makePersonMesh(
    hostile ? 0xd94040 : pick(rand, SHIRTS),
    pick(rand, PANTS),
    pick(rand, SKINS),
    hostile,
    tourist,
  );
  mesh.position.set(x, 0, z);
  return {
    mesh,
    x,
    z,
    heading: range(rand, 0, Math.PI * 2),
    speed: range(rand, 0.9, 1.6),
    walkPhase: range(rand, 0, Math.PI * 2),
    state: 'walk', // walk | flee | dead | idle
    targetX: x,
    targetZ: z,
    wait: range(rand, 0, 3),
    hostile,
    tourist,
    health: hostile ? 60 : 100,
    retarget: 0,
  };
}

function randomSidewalkTarget(rand) {
  // A point just off a road, on the sidewalk band.
  const line = pick(rand, ROAD_LINES);
  const along = range(rand, -170, 170);
  const side = pick(rand, [-8.5, 8.5]);
  return line.axis === 'x' ? { x: along, z: line.at + side } : { x: line.at + side, z: along };
}

export function updatePed(p, dt, rand, colliders, threat) {
  if (p.state === 'dead') return;
  p.walkPhase += dt * (p.state === 'flee' ? 11 : 6) * Math.max(0.4, p.speed);
  const u = p.mesh.userData;
  const swing = Math.sin(p.walkPhase) * 0.55;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.7;
  u.armR.rotation.x = swing * 0.7;

  // Flee from a nearby threat (player car at speed, or high wanted level).
  if (threat) {
    const dx = p.x - threat.x;
    const dz = p.z - threat.z;
    const d = Math.hypot(dx, dz);
    if (d < 14) {
      p.state = 'flee';
      p.heading = Math.atan2(dx, dz);
      const sp = 4.2;
      const nx = p.x + Math.sin(p.heading) * sp * dt;
      const nz = p.z + Math.cos(p.heading) * sp * dt;
      const hit = collideCircle(colliders, nx, nz, 0.5);
      p.x = hit.x;
      p.z = hit.z;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      return;
    }
  }
  if (p.state === 'flee') p.state = 'walk';

  if (p.wait > 0) {
    p.wait -= dt;
    return;
  }
  p.retarget -= dt;
  const dx = p.targetX - p.x;
  const dz = p.targetZ - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 1 || p.retarget <= 0) {
    const t = randomSidewalkTarget(rand);
    p.targetX = t.x;
    p.targetZ = t.z;
    p.retarget = 20;
    p.wait = range(rand, 0, 2.5);
    return;
  }
  p.heading = Math.atan2(dx, dz);
  const nx = p.x + Math.sin(p.heading) * p.speed * dt;
  const nz = p.z + Math.cos(p.heading) * p.speed * dt;
  const hit = collideCircle(colliders, nx, nz, 0.5);
  p.x = hit.x;
  p.z = hit.z;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
}

export function spawnPeds(scene, rand, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const t = randomSidewalkTarget(rand);
    const p = createPed(t.x, t.z, rand);
    scene.add(p.mesh);
    peds.push(p);
  }
  return peds;
}
