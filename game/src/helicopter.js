// Marina Verde — police helicopter (v2). Spawns at wanted 4–5 stars, orbits
// the player at 26 m radius and 30 m height with a searchlight. A player on
// foot caught in the spotlight for 3 s continuously gets their busted timer
// accelerated (x2). The helicopter is invulnerable — no shooting it down.
import * as THREE from 'three';

export function helicopterDemand(stars) {
  return stars >= 4 ? 1 : 0;
}

export function createHelicopter(scene, haloTex = null) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8dee2, roughness: 0.45, metalness: 0.3 });
  // Rounded body: cylinder with sphere ends (capsule-ish), not a box.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.2, 16), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);
  // Red stripe along the body so the heli reads against dark buildings —
  // v2 polish P3: wider + taller (was 3.1 x 0.5) so it is more than a
  // hairline at screenshot distance. Body colour stays (design: body tetap).
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.8, 3.6),
    new THREE.MeshLambertMaterial({ color: 0xd94040 }),
  );
  stripe.position.y = -0.2;
  group.add(stripe);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), bodyMat);
  nose.position.z = 2.1;
  group.add(nose);
  const tailCap = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), bodyMat);
  tailCap.position.z = -2.1;
  group.add(tailCap);
  // Glass cockpit.
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.15, metalness: 0.4 }),
  );
  glass.scale.set(1, 0.75, 0.9);
  glass.position.set(0, 0.35, 1.9);
  group.add(glass);
  // Tail boom + tail rotor.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 5.5, 12), bodyMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.z = -4.6;
  group.add(boom);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x888888 }));
  tailRotor.position.set(0.4, 0.4, -7);
  group.add(tailRotor);
  // Main rotor: two blades + a translucent blur disc when spinning.
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const s of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.55), bladeMat);
    blade.position.x = s * 5.5;
    rotor.add(blade);
  }
  rotor.position.y = 1.7;
  group.add(rotor);
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = 1.72;
  group.add(blur);
  // Skids.
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.4), skidMat);
    skid.position.set(s * 1.1, -1.55, 0);
    group.add(skid);
  }
  // Searchlight cone (translucent) + red navigation light.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 30, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  group.add(cone);
  const navLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  navLight.position.set(0, -1.6, -1);
  group.add(navLight);
  if (haloTex) {
    // P6 halo on the nav light (red glow, rides with the heli).
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex, color: 0xff4444, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(2.4, 2.4, 1);
    halo.position.set(0, -1.6, -1);
    group.add(halo);
  }
  group.visible = false;
  scene.add(group);
  return {
    mesh: group,
    rotor,
    tailRotor,
    cone,
    navLight,
    angle: 0,
    active: false,
    height: 30, // orbit height (m); shots may stage it lower for framing
    radius: 26, // orbit radius (m)
    spotlit: 0, // seconds the player has been continuously inside the spotlight
  };
}

export function updateHelicopter(heli, dt, playerPos, onFoot, time) {
  if (!heli.active) {
    heli.mesh.visible = false;
    return;
  }
  heli.mesh.visible = true;
  heli.angle += dt * 0.5; // 0.5 rad/s orbit
  const x = playerPos.x + Math.cos(heli.angle) * heli.radius;
  const z = playerPos.z + Math.sin(heli.angle) * heli.radius;
  heli.mesh.position.set(x, heli.height, z);
  heli.mesh.rotation.y = Math.atan2(playerPos.x - x, playerPos.z - z);
  heli.rotor.rotation.y += dt * 22;
  heli.tailRotor.rotation.z += dt * 30;
  heli.navLight.material.color.setHex(Math.floor(time * 2) % 2 === 0 ? 0xff2222 : 0x550000);
  // Aim the searchlight cone from the heli down at the player: the cone's
  // apex (+Y end) points at the heli, its base at the ground below.
  const dx = playerPos.x - x;
  const dz = playerPos.z - z;
  const toHeli = new THREE.Vector3(-dx, heli.height, -dz).normalize();
  heli.cone.position.set(dx / 2, heli.height / 2, dz / 2);
  heli.cone.scale.set(1, heli.height / 30, 1);
  heli.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toHeli);
  // Spotlight exposure: the searchlight tracks the player, so an on-foot
  // player under an active helicopter is lit the whole time. After 3 s of
  // continuous exposure the busted timer runs twice as fast (see main.js).
  if (onFoot) {
    heli.spotlit += dt;
  } else {
    heli.spotlit = 0;
  }
  return heli.spotlit;
}
