// Marina Verde — weapons (v2). Extends combat.js: four weapons with distinct
// damage, fire rate, range, pellet count, tracer colour and ammo pools.
// Pistol is Nico's starter; SMG, shotgun and rifle are bought at Verde Arms.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './config.js';

export function createArsenal() {
  return {
    current: 'pistol',
    owned: { pistol: true, smg: false, shotgun: false, rifle: false },
    ammo: { pistol: 12, smg: 0, shotgun: 0, rifle: 0 },
  };
}

export function weaponDef(id) {
  return WEAPONS[id] ?? WEAPONS.pistol;
}

export function ownedWeapons(arsenal) {
  return WEAPON_ORDER.filter((id) => arsenal.owned[id]);
}

export function selectWeapon(arsenal, id) {
  if (!arsenal.owned[id]) return false;
  arsenal.current = id;
  return true;
}

export function cycleWeapon(arsenal) {
  const owned = ownedWeapons(arsenal);
  const i = owned.indexOf(arsenal.current);
  arsenal.current = owned[(i + 1) % owned.length];
  return arsenal.current;
}

export function giveWeapon(arsenal, id) {
  arsenal.owned[id] = true;
  const def = weaponDef(id);
  arsenal.ammo[id] = Math.max(arsenal.ammo[id] ?? 0, def.ammoStart);
  arsenal.current = id;
}

// Fire the current weapon: N pellets with spread, hitscan raycasts, a tracer
// line per pellet. Reuses combat's cooldown + tracer bookkeeping so the old
// pistol path and the new weapons share one clock.
export function fireWeapon(arsenal, combat, scene, from, dir, targets, onHit) {
  const def = weaponDef(arsenal.current);
  if (combat.cooldown > 0 || (arsenal.ammo[arsenal.current] ?? 0) <= 0) return false;
  combat.cooldown = def.cooldown;
  arsenal.ammo[arsenal.current] -= 1;
  const ray = new THREE.Raycaster();
  ray.far = def.range;
  const meshes = targets.filter((t) => t.state !== 'dead').map((t) => t.mesh);
  let hitAny = false;
  for (let p = 0; p < def.pellets; p += 1) {
    const d = dir.clone();
    if (def.spread > 0) {
      d.x += (Math.random() - 0.5) * def.spread * 2;
      d.y += (Math.random() - 0.5) * def.spread * 2;
      d.z += (Math.random() - 0.5) * def.spread * 2;
      d.normalize();
    }
    ray.set(from, d);
    const hits = ray.intersectObjects(meshes, true);
    const end = hits.length ? hits[0].point : from.clone().add(d.clone().multiplyScalar(def.range));
    const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: def.tracer }));
    scene.add(line);
    combat.tracers.push({ line, until: performance.now() / 1000 + 0.08 });
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.pedRef) obj = obj.parent;
      const ped = obj?.userData.pedRef;
      if (ped) {
        ped.health -= def.damage;
        hitAny = true;
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
  }
  return hitAny || true;
}
