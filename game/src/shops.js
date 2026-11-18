// Marina Verde — shops (v2). Verde Arms (weapons + ammo), Rosa's Garage
// (repair + repaint), Coral Clinic (health kit) and the Safehouse (free rest
// + save). Buildings carry canvas-texture signs and a glowing door marker;
// the shop UI is a DOM overlay (see index.html #shop) and the game pauses
// while it is open.
import * as THREE from 'three';
import { SHOPS, PLACES, PALETTE } from './config.js';
import { makeHaloSprite } from './world.js';

function signTexture(text, bgColor) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#111820';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = `#${bgColor.toString(16).padStart(6, '0')}`;
  g.lineWidth = 5;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = `#${bgColor.toString(16).padStart(6, '0')}`;
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createShops(scene, world) {
  // Sign facing (rotation.y) so each shop's sign + door face the nearest road.
  const FACING = { gunshop: -Math.PI / 2, garage: -Math.PI / 2, clinic: Math.PI / 2, safehouse: -Math.PI / 2 };
  const shops = [];
  for (const def of SHOPS) {
    const place = PLACES[def.place];
    const group = new THREE.Group();
    // Small shop building: pastel walls, flat roof, awning.
    const wallMat = new THREE.MeshLambertMaterial({ color: def.id === 'safehouse' ? 0xffe3c2 : 0xfff3d6 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 7), wallMat);
    building.position.y = 2.75;
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.6, 7.6),
      new THREE.MeshLambertMaterial({ color: def.color }),
    );
    roof.position.y = 5.8;
    group.add(roof);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 0.35, 2.4),
      new THREE.MeshLambertMaterial({ color: def.color }),
    );
    awning.position.set(0, 3.6, 4.2);
    group.add(awning);
    // Emissive sign: canvas text on a lit board above the door.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 2.1),
      new THREE.MeshStandardMaterial({
        map: signTexture(def.sign, def.color),
        emissive: 0xffffff,
        emissiveMap: signTexture(def.sign, def.color),
        emissiveIntensity: 0.55,
        roughness: 0.6,
      }),
    );
    sign.position.set(0, 4.6, 3.56);
    group.add(sign);
    // P6 halo on the sign (shared halo texture, shop colour) — the neon
    // signs read at night without a bloom pass.
    if (world.haloTex) {
      const halo = makeHaloSprite(world.haloTex, def.color, 0.3, 5);
      halo.position.set(0, 4.6, 4.1);
      group.add(halo);
    }
    // Glowing door marker ring on the ground in front of the shop.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.3, 24),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.12, 5.2);
    group.add(ring);
    group.position.set(place.x, 0, place.z);
    group.rotation.y = FACING[def.id] ?? 0;
    scene.add(group);
    // The rotated building footprint swaps axes (9 wide becomes 7 wide).
    const rotated = Math.abs(Math.sin(FACING[def.id] ?? 0)) > 0.5;
    const hx = rotated ? 3.5 : 4.5;
    const hz = rotated ? 4.5 : 3.5;
    world.colliders.push({ minX: place.x - hx, maxX: place.x + hx, minZ: place.z - hz, maxZ: place.z + hz });
    // Door marker world position: local (0, 5.2) rotated by the facing.
    const th = FACING[def.id] ?? 0;
    const doorX = place.x + 5.2 * Math.sin(th);
    const doorZ = place.z + 5.2 * Math.cos(th);
    shops.push({ ...def, x: doorX, z: doorZ, group });
  }
  return shops;
}

// Nearest shop within 6 m of the player (door marker position), or null.
export function nearestShop(shops, playerPos) {
  let best = null;
  let bestD = 6;
  for (const s of shops) {
    const d = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
