// Marina Verde — combat. A pistol with limited ammo (hitscan, tracer line,
// muzzle flash) and a close-range punch. Enemies are the rival crew peds:
// they shoot back when the player is near and armed.
import * as THREE from 'three';

export function createCombat() {
  return {
    ammo: 12,
    maxAmmo: 24,
    cooldown: 0,
    punchCooldown: 0,
    tracers: [], // {line, until}
    muzzle: null,
  };
}

export function shoot(combat, scene, from, dir, targets, onHit) {
  if (combat.cooldown > 0 || combat.ammo <= 0) return false;
  combat.cooldown = 0.28;
  combat.ammo -= 1;
  const ray = new THREE.Raycaster(from, dir);
  ray.far = 60;
  const meshes = targets.filter((t) => t.state !== 'dead').map((t) => t.mesh);
  const hits = ray.intersectObjects(meshes, true);
  // Tracer: a thin yellow line from the muzzle to the hit point or max range.
  const end = hits.length ? hits[0].point : from.clone().add(dir.clone().multiplyScalar(60));
  const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe98a }));
  scene.add(line);
  combat.tracers.push({ line, until: performance.now() / 1000 + 0.08 });
  if (hits.length) {
    let obj = hits[0].object;
    while (obj && !obj.userData.pedRef) obj = obj.parent;
    const ped = obj?.userData.pedRef;
    if (ped) {
      ped.health -= 34;
      if (ped.health <= 0 && ped.state !== 'dead') {
        ped.state = 'dead';
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.4;
        onHit?.(ped, true);
      } else {
        onHit?.(ped, false);
      }
    }
  }
  return true;
}

export function punch(combat, playerPos, playerHeading, targets, onHit) {
  if (combat.punchCooldown > 0) return false;
  combat.punchCooldown = 0.45;
  const fx = Math.sin(playerHeading);
  const fz = Math.cos(playerHeading);
  for (const t of targets) {
    if (t.state === 'dead') continue;
    const dx = t.x - playerPos.x;
    const dz = t.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.4 && dx * fx + dz * fz > 0) {
      t.health -= 25;
      // Knock the target back a step.
      t.x += (dx / (d || 1)) * 0.8;
      t.z += (dz / (d || 1)) * 0.8;
      t.mesh.position.set(t.x, 0, t.z);
      if (t.health <= 0) {
        t.state = 'dead';
        t.mesh.rotation.x = -Math.PI / 2;
        t.mesh.position.y = 0.4;
        onHit?.(t, true);
      } else {
        onHit?.(t, false);
      }
      return true;
    }
  }
  return false;
}

// Rival crew AI: stand their ground, shoot at the player when close.
export function updateRival(p, dt, playerPos, playerAlive, onShoot) {
  if (p.state === 'dead' || !p.hostile) return;
  const dx = playerPos.x - p.x;
  const dz = playerPos.z - p.z;
  const d = Math.hypot(dx, dz);
  p.heading = Math.atan2(dx, dz);
  p.mesh.rotation.y = p.heading;
  // Aim the arm at the player.
  p.mesh.userData.armR.rotation.x = -Math.PI / 2 + Math.sin(performance.now() / 300) * 0.05;
  if (d < 26 && playerAlive) {
    p.shootTimer = (p.shootTimer ?? 1.2) - dt;
    if (p.shootTimer <= 0) {
      p.shootTimer = 1.6 + Math.random() * 1.2;
      onShoot?.(p, d);
    }
  }
  // Strafe slowly to stay threatening.
  if (d > 8) {
    p.x += Math.sin(p.heading) * 1.1 * dt;
    p.z += Math.cos(p.heading) * 1.1 * dt;
    p.mesh.position.set(p.x, 0, p.z);
  }
}

export function updateTracers(combat, scene, now) {
  for (let i = combat.tracers.length - 1; i >= 0; i -= 1) {
    if (now > combat.tracers[i].until) {
      scene.remove(combat.tracers[i].line);
      combat.tracers[i].line.geometry.dispose();
      combat.tracers.splice(i, 1);
    }
  }
}
