// Marina Verde — graphics polish round 2 (POLISH2-DESIGN §3, Sol verdik B).
// Shared helpers only: NO EffectComposer/bloom, NO extra shadow lights,
// NO planar reflections. One shared radial halo texture; halo sprites are
// additive, depthTest on, depthWrite off, never castShadow. Halo budget:
// at most 16 individual halos visible at once (billboard 1 + beachfront
// lamp halos 4 + heli nav 1 + player tail glow 2 + police lightbar glow
// <= 5 = 13 worst case). Shot presets live here so the chase-cover camera
// is ONLY reachable through an explicit capture mode (?shot=cover); the
// gameplay camera defaults in main.js are untouched, and the preset is
// never written to a save.
import * as THREE from 'three';

// --- Shared halo texture (one canvas, built once) ---------------------------
let _haloTex = null;
export function getHaloTexture() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _haloTex = t;
  return t;
}

export const HALO_BUDGET = 16;

const _glowMats = new Map(); // `${color}|${opacity}` -> shared SpriteMaterial
export function makeGlowSprite(color, opacity, scale) {
  const key = `${color}|${opacity}`;
  let mat = _glowMats.get(key);
  if (!mat) {
    mat = new THREE.SpriteMaterial({
      map: getHaloTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    _glowMats.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

// --- Shot presets (capture mode ONLY) ---------------------------------------
// 'chase-cover': low camera right behind the car, car big in frame — the
// Top-1/concept-1 composition. Gameplay NEVER uses this: main.js only
// applies it when game.shotMode === 'cover', and cameraDistOverride is a
// runtime field that saveGame() never serialises.
export function getShotPreset(name) {
  if (name === 'chase-cover') return { dist: 10.5, pitch: 0.22 };
  if (name === 'chase-night') return { dist: 9.5, pitch: 0.20 };
  return null;
}

// --- Title save summary (read-only) ----------------------------------------
// Parses a raw save string and returns a one-line summary, or null when
// there is no save / the JSON is corrupt / fields are missing. Never writes.
export function formatSaveSummary(raw, missions) {
  if (!raw) return null;
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!s || typeof s !== 'object') return null;
  const idx = typeof s.missionIndex === 'number' ? Math.max(0, Math.min((missions?.length ?? 12) - 1, s.missionIndex)) : 0;
  const title = missions?.[idx]?.title ?? `Job ${idx + 1}`;
  const money = typeof s.money === 'number' ? s.money : 0;
  const clock = typeof s.clock === 'number' ? s.clock : 16 * 60 + 40;
  const day = 1 + Math.floor(clock / 1440);
  const hh = String(Math.floor(clock / 60) % 24).padStart(2, '0');
  const mm = String(Math.floor(clock) % 60).padStart(2, '0');
  return `Ch. ${idx + 1} · ${title} · $${money.toLocaleString('en-US')} · Day ${day}, ${hh}:${mm}`;
}

// --- Ferris wheel (static landmark, Beachfront) -----------------------------
// A few meshes only: rim + hub + 2 instanced batches (spokes, gondolas) +
// 2 support legs. No animation loop. Bounding spheres are computed after
// the final instance matrices are in. Colours are our own (teal rim,
// multi-colour gondolas). Positioned on the sand, clear of the road.
export function buildFerrisWheel(scene, colliders, x, z) {
  const group = new THREE.Group();
  const R = 13;
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x38b6a0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 32), rimMat);
  rim.position.y = R + 3;
  rim.castShadow = true;
  group.add(rim);
  const spokeGeo = new THREE.BoxGeometry(0.35, R, 0.35);
  const spokes = new THREE.InstancedMesh(spokeGeo, rimMat, 8);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    eul.set(0, 0, (i / 8) * Math.PI * 2);
    q.setFromEuler(eul);
    // Spoke centre sits halfway out from the hub along its own direction:
    // a box rotated by a around Z points along (-sin a, cos a).
    const a = (i / 8) * Math.PI * 2;
    const pos = new THREE.Vector3(-Math.sin(a) * (R / 2), R + 3 + Math.cos(a) * (R / 2), 0);
    m4.compose(pos, q, one);
    spokes.setMatrixAt(i, m4);
  }
  spokes.count = 8;
  spokes.instanceMatrix.needsUpdate = true;
  spokes.computeBoundingSphere();
  group.add(spokes);
  // Gondolas: one InstancedMesh, 8 coloured cabins on the rim.
  const gondolaGeo = new THREE.BoxGeometry(1.7, 1.5, 1.5);
  const gondolaMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const gondolas = new THREE.InstancedMesh(gondolaGeo, gondolaMat, 8);
  const cols = [0xff8a5c, 0x38b6a0, 0xf2c230, 0xc96fd0, 0xff5a8a, 0x2f6fd0, 0x7be495, 0xe86a5a];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const pos = new THREE.Vector3(-Math.sin(a) * R, R + 3 + Math.cos(a) * R, 0);
    m4.compose(pos, new THREE.Quaternion(), one);
    gondolas.setMatrixAt(i, m4);
    gondolas.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  gondolas.count = 8;
  gondolas.instanceMatrix.needsUpdate = true;
  if (gondolas.instanceColor) gondolas.instanceColor.needsUpdate = true;
  gondolas.computeBoundingSphere();
  gondolas.castShadow = true;
  group.add(gondolas);
  // A-frame legs: one InstancedMesh (2 instances), one draw call.
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, R + 4, 0.8), legMat, 2);
  for (const [i, s] of [-1, 1].entries()) {
    eul.set(0, 0, -s * 0.28);
    q.setFromEuler(eul);
    m4.compose(new THREE.Vector3(s * 4.5, (R + 3) / 2, 0), q, one);
    legs.setMatrixAt(i, m4);
  }
  legs.count = 2;
  legs.instanceMatrix.needsUpdate = true;
  legs.computeBoundingSphere();
  legs.castShadow = true;
  group.add(legs);
  group.position.set(x, 0, z);
  scene.add(group);
  if (colliders) colliders.push({ minX: x - 7, maxX: x + 7, minZ: z - 2, maxZ: z + 2 });
  return group;
}
