// Marina Verde — procedural city. Builds the whole 3D world from the seed in
// config.js: road grid, pastel towers with lit windows, beach and sea, palm
// boulevards, a park, a landmark tower, a lighthouse and the marina. Also owns
// the collision boxes and the named places missions point at.
// v2 visual polish (DESIGN §6): procedural canvas textures everywhere (facade
// variants with lit-window emissive maps, asphalt speckle + cracks, sidewalk
// tiles, sand speckle, animated water shimmer, roof tiles), a gradient sky
// sphere instead of a flat background colour, smoother geometry (16+ segment
// cylinders, sphere heads handled in peds.js), and MeshStandardMaterial on
// the hero pieces (yacht, tower spire).
import * as THREE from 'three';
import { CITY, ROAD_MIN, ROAD_MAX, BEACH_Z, SEA_Z, CITY_HALF, PALETTE, ROAD_LINES, PLACES } from './config.js';
import { mulberry32, pick, range, rangeInt, hash2, chance } from './rng.js';
import { buildFerrisWheel } from './graphics-polish.js';

const STEP = CITY.BLOCK_STEP;

function canvasTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

// v2 polish P6 — fake glow (no bloom module exists): ONE shared radial halo
// texture; sprites are additive, depthTest on (never shine through walls),
// depthWrite off, small on screen (low overdraw). Exported for shops.js
// (sign halos) and helicopter.js (nav-light halo).
export function makeHaloTexture() {
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
  return t;
}

const _haloMats = new Map(); // `${color}|${opacity}` -> shared SpriteMaterial
export function makeHaloSprite(tex, color, opacity, scale) {
  const key = `${color}|${opacity}`;
  let mat = _haloMats.get(key);
  if (!mat) {
    mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    _haloMats.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

// Facade variant: per-floor window variation, balconies, shutters, AC units.
// Returns {map, emissive} — the emissive canvas holds only the lit windows.
function facadeTextures(rand) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const e = document.createElement('canvas');
  e.width = 128;
  e.height = 256;
  const eg = e.getContext('2d');
  g.fillStyle = '#f5f0e8';
  g.fillRect(0, 0, 128, 256);
  eg.fillStyle = '#000000';
  eg.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 22) {
    const floorTint = 235 + Math.floor(rand() * 20);
    g.fillStyle = `rgb(${floorTint},${floorTint - 6},${floorTint - 14})`;
    g.fillRect(0, y - 4, 128, 22);
    for (let x = 8; x < 120; x += 18) {
      const lit = rand() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#2c4a63';
      g.fillRect(x, y, 11, 14);
      // Shutters on some windows, balconies on others.
      if (rand() < 0.3) {
        g.fillStyle = 'rgba(60,70,80,0.55)';
        g.fillRect(x - 2, y + 2, 3, 10);
        g.fillRect(x + 10, y + 2, 3, 10);
      }
      if (rand() < 0.22) {
        g.fillStyle = 'rgba(90,90,90,0.6)';
        g.fillRect(x - 3, y + 14, 17, 2);
      }
      if (rand() < 0.12) {
        g.fillStyle = '#9aa4ad';
        g.fillRect(x + 12, y + 6, 5, 5);
      }
      if (lit) {
        eg.fillStyle = '#ffd98a';
        eg.fillRect(x, y, 11, 14);
      }
    }
  }
  return { map: canvasTexture(c), emissive: canvasTexture(e) };
}

// v2 polish P2: lighter base (#484e57, was #3a3f46) + same speckle count
// (Sol cut the count increase; contrast is widened on the SAME draws so the
// world RNG stream is untouched) + lane markings BAKED in (Sol: no separate
// planes — no extra calls, no z-fighting). `axis` picks the marking
// orientation: X roads run along canvas-U, Z roads along canvas-V.
function asphaltTexture(rand, axis = 'x') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#484e57';
  g.fillRect(0, 0, 256, 256);
  // Speckle noise (same 2600 draws as v2 — only the value range widens).
  for (let i = 0; i < 2600; i += 1) {
    const v = 30 + Math.floor(rand() * 85);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(rand() * 256, rand() * 256, 1.6, 1.6);
  }
  // Cracks and patches.
  for (let i = 0; i < 7; i += 1) {
    g.strokeStyle = 'rgba(20,22,26,0.7)';
    g.lineWidth = 1.4;
    g.beginPath();
    let x = rand() * 256;
    let y = rand() * 256;
    g.moveTo(x, y);
    for (let j = 0; j < 5; j += 1) {
      x += (rand() - 0.5) * 60;
      y += (rand() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 4; i += 1) {
    g.fillStyle = 'rgba(28,30,34,0.5)';
    g.fillRect(rand() * 200, rand() * 200, 30 + rand() * 40, 18 + rand() * 30);
  }
  // Baked markings: double yellow centre line (continuous) + white edge
  // lines. Horizontal in canvas = along-road for X roads; vertical = along
  // road for Z roads (their texture repeat runs the other way).
  // Polish 2 Q3: a PAINTED specular streak (stylised highlight, not a
  // reflection) — a soft warm band down the middle of the road that reads
  // as wet asphalt catching the sunset. Fixed geometry, NO rand() draws,
  // so the world RNG stream is untouched.
  {
    const streak = g.createLinearGradient(0, 96, 0, 160);
    streak.addColorStop(0, 'rgba(255,225,170,0)');
    streak.addColorStop(0.5, 'rgba(255,225,170,0.14)');
    streak.addColorStop(1, 'rgba(255,225,170,0)');
    g.fillStyle = streak;
    if (axis === 'x') g.fillRect(0, 96, 256, 64);
    else g.fillRect(96, 0, 64, 256);
  }
  const line = (x, y, w, h) => g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(245,200,60,0.85)';
  if (axis === 'x') {
    line(0, 118, 256, 4);
    line(0, 134, 256, 4);
  } else {
    line(118, 0, 4, 256);
    line(134, 0, 4, 256);
  }
  g.fillStyle = 'rgba(235,235,235,0.8)';
  if (axis === 'x') {
    line(0, 6, 256, 4);
    line(0, 246, 256, 4);
  } else {
    line(6, 0, 4, 256);
    line(246, 0, 4, 256);
  }
  return canvasTexture(c, 16, 1);
}

function sidewalkTexture(rand) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc4ae';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i += 1) {
    const v = 180 + Math.floor(rand() * 40);
    g.fillStyle = `rgb(${v},${v - 12},${v - 40})`;
    g.fillRect(rand() * 128, rand() * 128, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(110,95,70,1.0)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i += 1) {
    g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke();
  }
  return canvasTexture(c, 28, 28);
}

function sandTexture(rand) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2d8a7';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i += 1) {
    const v = 185 + Math.floor(rand() * 70);
    g.fillStyle = `rgb(${v},${Math.floor(v * 0.82)},${Math.floor(v * 0.55)})`;
    g.fillRect(rand() * 256, rand() * 256, 1.6, 1.6);
  }
  // Subtle ripple bands.
  g.strokeStyle = 'rgba(210,175,110,0.6)';
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 18) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
    g.stroke();
  }
  return canvasTexture(c, 10, 3);
}

function waterTexture(rand) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1e9bb5';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i += 1) {
    g.strokeStyle = `rgba(255,255,255,${0.08 + rand() * 0.16})`;
    g.lineWidth = 1.5 + rand() * 2;
    g.beginPath();
    const y = rand() * 128;
    g.moveTo(rand() * 40, y);
    g.bezierCurveTo(40, y + (rand() - 0.5) * 8, 90, y + (rand() - 0.5) * 8, 128, y);
    g.stroke();
  }
  return canvasTexture(c, 10, 6);
}

function roofTexture(rand, base = 0xb5654a) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const r = (base >> 16) & 0xff;
  const gg = (base >> 8) & 0xff;
  const b = base & 0xff;
  g.fillStyle = `rgb(${r},${gg},${b})`;
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 12) {
    for (let x = 0; x < 128; x += 16) {
      const v = 0.85 + rand() * 0.3;
      g.fillStyle = `rgb(${Math.min(255, r * v) | 0},${Math.min(255, gg * v) | 0},${Math.min(255, b * v) | 0})`;
      g.fillRect(x + (y % 24 === 0 ? 8 : 0), y, 15, 11);
    }
  }
  return canvasTexture(c, 3, 3);
}

// v2 polish P1: 8 fronds (was 5), longer (3.4, was 2.6) and wider (0.7,
// was 0.55) for a broad crown; tilt 1.65 rad so the frond tips droop just
// below horizontal instead of pointing up like spears (Sol: check the cone's
// local orientation first — the cone apex is +Y, so tilt > PI/2 tips it
// outward-DOWN). Trunk slightly slimmer at the tip (0.12/0.22).
// Coconut cluster + trunk rings: CUT per Sol review (invisible at 720p).
// No new rand() draws here, so the world RNG stream is untouched.
function makePalm(rand) {
  const group = new THREE.Group();
  const h = range(rand, 5, 8);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.22, h, 12),
    new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }),
  );
  trunk.position.y = h / 2;
  trunk.rotation.z = range(rand, -0.08, 0.08);
  trunk.userData.batchKey = 'palmTrunk';
  trunk.userData.unitH = h; // batch uses a unit-height cylinder, scaled by h
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const leafGeo = new THREE.ConeGeometry(0.7, 3.4, 4);
  for (let i = 0; i < 8; i += 1) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    const a = (i / 8) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.0, h + 0.15, Math.sin(a) * 1.0);
    leaf.rotation.set(Math.sin(a) * 1.65, 0, -Math.cos(a) * 1.65);
    leaf.userData.batchKey = 'palmLeaf';
    group.add(leaf);
  }
  return group;
}

export function buildWorld(scene) {
  const rand = mulberry32(CITY.SEED);
  const colliders = []; // {minX, maxX, minZ, maxZ}
  const world = { colliders, places: PLACES, palms: [], waterTextures: [] };
  // P6: one shared halo texture for all fake-glow sprites (lamps, billboard,
  // heli nav light, shop signs). Created once, before any user of it.
  world.haloTex = makeHaloTexture();

  // --- Gradient sky sphere (shader) + sun, fog -----------------------------
  // A large inverted sphere: golden horizon fading to blue zenith. No flat
  // scene.background colour in v2.
  const skyGeo = new THREE.SphereGeometry(950, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = normalize(vP).y; float t = clamp(h * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  world.sky = sky;
  scene.fog = new THREE.Fog(0x9fd0e8, 320, 900);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  world.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xffe8b8, 2.1);
  sun.position.set(120, 180, -80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  world.sun = sun;
  // P3 (revised after perf measurement — see note in setSkyMode): NO extra
  // directional fill. A third light raised SwiftShader frame times ~25%
  // (every lit fragment pays for every light), so the lift comes from the
  // hemisphere light instead — same visual goal, zero new lights.

  // Sun disc + a few clouds (cheap billboards of spheres).
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  sunBall.position.set(320, 260, -420);
  scene.add(sunBall);
  world.sunBall = sunBall;

  // --- Sky modes (DESIGN §10.7): day (golden hour), sunset, night. The
  // gradient shader uniforms + fog + lights switch together; the road
  // roughness drops at sunset/night for a slight wet sheen (no real
  // reflections — that is stated honestly in the report).
  // P3 lift WITHOUT a third light: the hemisphere intensity is raised per
  // mode (day 0.95->1.15, sunset 0.7->0.9, night 0.85->1.0) so shadowed
  // faces and the road stop going black. A shadowless directional fill was
  // tried first and REMOVED: perf-mjs showed frame median 2483->3117 ms
  // and p95 3317->5100 ms with it (SwiftShader pays per light per fragment).
  // The sky top/horizon/fog/sun values below are UNTOUCHED (playtest pins them).
  const SKY_MODES = {
    day: { top: 0x3f7fc9, horizon: 0xffd9a0, fog: 0x9fd0e8, sun: 0xffe8b8, sunI: 2.1, hemiI: 1.15, ball: 0xfff2c0, roadRough: 0.9, glint: 0.15, sunPos: [120, 180, -80] },
    // Polish 2 Q3: warmer sunset horizon (pink-orange, was 0xff9a5c) and a
    // LOW sun position so shadows stretch long at golden hour. Top colours
    // are pinned by the playtest — only horizon + sun position move.
    sunset: { top: 0x5a4a8a, horizon: 0xff8a6e, fog: 0xd88a6a, sun: 0xffb36a, sunI: 1.6, hemiI: 0.9, ball: 0xffc46a, roadRough: 0.5, glint: 0.3, sunPos: [230, 95, -30] },
    night: { top: 0x0d1738, horizon: 0x24365f, fog: 0x16233f, sun: 0x8aa8ff, sunI: 0.8, hemiI: 1.0, ball: 0xd8e4ff, roadRough: 0.45, glint: 0.06, sunPos: [90, 190, 60] },
  };
  world.skyMode = 'day';
  world.setSkyMode = function setSkyMode(mode) {
    const m = SKY_MODES[mode];
    if (!m) return;
    world.skyMode = mode;
    skyMat.uniforms.top.value.setHex(m.top);
    skyMat.uniforms.horizon.value.setHex(m.horizon);
    scene.fog.color.setHex(m.fog);
    sun.color.setHex(m.sun);
    sun.intensity = m.sunI;
    sun.position.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]);
    hemi.intensity = m.hemiI;
    sunBall.material.color.setHex(m.ball);
    if (world.glintMat) world.glintMat.opacity = m.glint;
    for (const rm of world.roadMats ?? []) rm.roughness = m.roadRough;
  };
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const pr = range(rand, 6, 12);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(pr, 7, 6), cloudMat);
      puff.position.set(j * 9 - 14, range(rand, -2, 2), range(rand, -4, 4));
      puff.scale.y = 0.55;
      puff.userData.batchKey = 'cloud';
      puff.userData.unitR = pr; // batch uses a unit sphere, scaled by radius
      cloud.add(puff);
    }
    cloud.position.set(range(rand, -380, 380), range(rand, 120, 170), range(rand, -380, 120));
    scene.add(cloud);
  }

  // --- Ground: grass base, then city slab, sand, sea ------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 780),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -160); // ends at z=230 so the sea stays visible
  ground.receiveShadow = true;
  scene.add(ground);

  const citySlab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 24, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: sidewalkTexture(rand) }),
  );
  citySlab.rotation.x = -Math.PI / 2;
  citySlab.position.set(0, 0, 0);
  citySlab.receiveShadow = true;
  scene.add(citySlab);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: sandTexture(rand) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, BEACH_Z + 22);
  sand.receiveShadow = true;
  scene.add(sand);

  // Sea: two overlapping planes with a scrolling shimmer texture.
  const seaTex = waterTexture(rand);
  const seaTex2 = waterTexture(rand);
  world.waterTextures.push(seaTex, seaTex2);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 500),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: seaTex, transparent: true, opacity: 0.96 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, SEA_Z + 250);
  scene.add(sea);
  const seaDeep = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 300),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: seaTex2, transparent: true, opacity: 0.9 }),
  );
  seaDeep.rotation.x = -Math.PI / 2;
  seaDeep.position.set(0, -0.6, SEA_Z + 480);
  scene.add(seaDeep);

  // v2 polish P2 — sun glint on the sea (Sol: a soft mask stretched along
  // the sun path, opacity per sky mode, depthWrite off, lifted clear of the
  // water to avoid z-fighting) + a darker wet-sand strip at the waterline.
  {
    const gc = document.createElement('canvas');
    gc.width = 64;
    gc.height = 256;
    const gg = gc.getContext('2d');
    const lg = gg.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, 'rgba(255,200,140,0)');
    lg.addColorStop(0.7, 'rgba(255,200,140,0.35)');
    lg.addColorStop(1, 'rgba(255,220,160,0.9)');
    gg.fillStyle = lg;
    gg.fillRect(0, 0, 64, 256);
    gg.globalCompositeOperation = 'destination-in';
    const sg = gg.createLinearGradient(0, 0, 64, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.5, 'rgba(0,0,0,1)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    gg.fillStyle = sg;
    gg.fillRect(0, 0, 64, 256);
    const glintTex = new THREE.CanvasTexture(gc);
    glintTex.colorSpace = THREE.SRGBColorSpace;
    const glintMat = new THREE.MeshBasicMaterial({
      map: glintTex, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(36, 180), glintMat);
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(36, -0.32, 330); // bright end toward the horizon (south)
    scene.add(glint);
    world.glintMat = glintMat;
    const wet = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 6),
      new THREE.MeshLambertMaterial({ color: 0xa8875a, transparent: true, opacity: 0.8 }),
    );
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(0, 0.05, 232);
    wet.receiveShadow = true;
    scene.add(wet);
  }

  // --- Roads ---------------------------------------------------------------
  const asphaltX = asphaltTexture(rand, 'x');
  const asphaltZ = asphaltTexture(rand, 'z');
  asphaltZ.repeat.set(1, 16);
  // Standard material (not Lambert) so the sky modes can lower the roughness
  // for a wet-road sheen at sunset/night (DESIGN §10.7).
  const roadMatX = new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphaltX, roughness: 0.9, metalness: 0.05 });
  const roadMatZ = new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphaltZ, roughness: 0.9, metalness: 0.05 });
  world.roadMats = [roadMatX, roadMatZ];
  for (const line of ROAD_LINES) {
    const isX = line.axis === 'x';
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(isX ? 380 : CITY.ROAD_W, isX ? CITY.ROAD_W : 380),
      isX ? roadMatX : roadMatZ,
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(isX ? 0 : line.at, 0.03, isX ? line.at : 0);
    road.receiveShadow = true;
    scene.add(road);
    // Centre-line dashes are baked into the asphalt texture (draw-call
    // budget, DESIGN §8) — no per-dash meshes.
  }
  // Beachfront road along the sand.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(380, CITY.ROAD_W), roadMatX);
  front.rotation.x = -Math.PI / 2;
  front.position.set(0, 0.03, 182);
  front.receiveShadow = true;
  scene.add(front);
  ROAD_LINES.push({ axis: 'x', at: 182 });

  // Zebra crossings at the two beachfront intersections (P2): one mesh each
  // with a striped canvas texture. A crossing must sit at ONE place, so it
  // cannot be baked into the repeating asphalt texture (Sol's bake rule is
  // for lane markings, which do repeat).
  {
    const zc = document.createElement('canvas');
    zc.width = 128;
    zc.height = 256;
    const zg = zc.getContext('2d');
    zg.clearRect(0, 0, 128, 256);
    zg.fillStyle = 'rgba(240,240,235,0.92)';
    for (let y = 8; y < 256; y += 42) zg.fillRect(0, y, 128, 18);
    const zebraTex = new THREE.CanvasTexture(zc);
    zebraTex.colorSpace = THREE.SRGBColorSpace;
    for (const zx of [-52, 52]) {
      const zebra = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 12),
        new THREE.MeshLambertMaterial({ map: zebraTex, transparent: true, opacity: 0.9 }),
      );
      zebra.rotation.x = -Math.PI / 2;
      zebra.position.set(zx, 0.05, 182);
      zebra.receiveShadow = true;
      scene.add(zebra);
    }
  }

  // --- Buildings -----------------------------------------------------------
  // Three facade variants (window layout + lit windows differ per variant).
  const facades = [facadeTextures(rand), facadeTextures(rand), facadeTextures(rand)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMats = [];
  for (const c of PALETTE.wall) {
    for (const f of facades) {
      wallMats.push(new THREE.MeshLambertMaterial({
        color: c,
        map: f.map,
        emissive: 0xffffff,
        emissiveMap: f.emissive,
        emissiveIntensity: 0.5,
      }));
    }
  }
  const roofMats = PALETTE.roof.map(
    (c) => new THREE.MeshLambertMaterial({ color: 0xffffff, map: roofTexture(rand, c) }),
  );

  function addBuilding(x, z, w, d, h, wallIdx, roofIdx, isHotel = false) {
    const baseMat = wallMats[wallIdx % wallMats.length];
    // Clone the facade textures per building so windows repeat by size
    // instead of stretching across a 26 m tower face.
    const mat = baseMat.clone();
    const mapClone = baseMat.map.clone();
    mapClone.needsUpdate = true;
    mapClone.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12)));
    const emClone = baseMat.emissiveMap.clone();
    emClone.needsUpdate = true;
    emClone.repeat.copy(mapClone.repeat);
    mat.map = mapClone;
    mat.emissiveMap = emClone;
    const b = new THREE.Mesh(boxGeo, mat);
    b.scale.set(w, h, d);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    const roof = new THREE.Mesh(roofGeo, roofMats[roofIdx % roofMats.length]);
    roof.scale.set(w + 0.6, 0.8, d + 0.6);
    roof.position.set(x, h + 0.4, z);
    roof.castShadow = true;
    roof.userData.batchKey = 'roof';
    scene.add(roof);
    // Rooftop AC box + sometimes a water tank, for silhouette variety.
    // (The parapet lip was cut for the draw-call budget, DESIGN §8.)
    const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x9aa4ad }));
    ac.scale.set(Math.min(4, w * 0.3), 1.2, Math.min(4, d * 0.3));
    ac.position.set(x + w * 0.2, h + 1.2, z - d * 0.15);
    ac.userData.batchKey = 'acBox';
    scene.add(ac);
    if (chance(rand, 0.4)) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 2.4, 16),
        new THREE.MeshLambertMaterial({ color: 0x7a9bb5 }),
      );
      tank.position.set(x - w * 0.25, h + 1.9, z + d * 0.2);
      tank.castShadow = true;
      tank.userData.batchKey = 'tank';
      scene.add(tank);
      const tankTop = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 0.9, 16),
        new THREE.MeshLambertMaterial({ color: 0x5a7a9a }),
      );
      tankTop.position.set(x - w * 0.25, h + 3.5, z + d * 0.2);
      tankTop.userData.batchKey = 'tankTop';
      scene.add(tankTop);
    }
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (isHotel) {
      // Coral Hotel sign: a glowing band on the roof.
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 2.2, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xff7f6e }),
      );
      sign.position.set(x, h + 2.4, z + d / 2 + 0.2);
      scene.add(sign);
    }
    return b;
  }

  // Landmark: Verde Tower at the city centre — the tallest building. It sits
  // on the central block, clear of the roads.
  addBuilding(26, 26, 26, 26, 78, 3, 1);
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2.4, 22, 16),
    new THREE.MeshStandardMaterial({ color: 0x2f6f6a, roughness: 0.5, metalness: 0.3 }),
  );
  spire.position.set(26, 78 + 11, 26);
  spire.castShadow = true;
  scene.add(spire);
  // Rooftop antennas on the tower.
  for (const [ax, az] of [[20, 20], [32, 32]]) {
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
    );
    ant.position.set(ax, 82, az);
    scene.add(ant);
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  );
  beacon.position.set(26, 101, 26);
  scene.add(beacon);
  world.beacon = beacon;

  // Blocks: block centres sit BETWEEN the roads, so no building ever stands
  // on a road. Each block gets 1-3 buildings, except the park block and the
  // market block (alley) which stay low and open.
  for (let bi = -3; bi <= 2; bi += 1) {
    for (let bj = -3; bj <= 2; bj += 1) {
      if (bi === 0 && bj === 0) continue; // tower block
      const cx = (bi + 0.5) * STEP;
      const cz = (bj + 0.5) * STEP;
      const isPark = bi === -2 && bj === 2;
      const isMarket = bi === 0 && bj === -2;
      const isHotelBlock = bi === -2 && bj === -1;
      if (isPark) {
        // Central park: lawn, paths, palms, benches.
        const lawn = new THREE.Mesh(
          new THREE.CircleGeometry(15, 24),
          new THREE.MeshLambertMaterial({ color: 0x5da85e }),
        );
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(cx, 0.06, cz);
        lawn.receiveShadow = true;
        scene.add(lawn);
        for (let p = 0; p < 7; p += 1) {
          const palm = makePalm(rand);
          const a = (p / 7) * Math.PI * 2;
          palm.position.set(cx + Math.cos(a) * 11, 0, cz + Math.sin(a) * 11);
          scene.add(palm);
          world.palms.push(palm);
        }
        const pond = new THREE.Mesh(
          new THREE.CircleGeometry(5, 20),
          new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
        );
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(cx, 0.07, cz);
        scene.add(pond);
        continue;
      }
      if (isMarket) {
        // Low market stalls around the alley.
        for (let s = 0; s < 4; s += 1) {
          const sx = cx - 10 + (s % 2) * 20;
          const sz = cz - 8 + Math.floor(s / 2) * 16;
          addBuilding(sx, sz, 9, 7, range(rand, 4, 6), rangeInt(rand, 0, 6), rangeInt(rand, 0, 4));
          const awning = new THREE.Mesh(
            new THREE.BoxGeometry(9.5, 0.4, 3),
            new THREE.MeshLambertMaterial({ color: pick(rand, [0xff8a5c, 0x38b6a0, 0xf2c230]) }),
          );
          awning.position.set(sx, 3.4, sz + 4.4);
          scene.add(awning);
        }
        continue;
      }
      const n = rangeInt(rand, 1, 3);
      for (let k = 0; k < n; k += 1) {
        const w = range(rand, 12, 22);
        const d = range(rand, 12, 22);
        const h = range(rand, 9, bi === 0 || bj === 0 ? 46 : 30);
        const ox = n === 1 ? 0 : (k - (n - 1) / 2) * 14;
        const oz = n === 1 ? 0 : ((k * 7) % 3 - 1) * 8;
        const bx = cx + ox;
        const bz = cz + oz;
        // Keep buildings inside the block, clear of the roads.
        if (Math.abs(bx - cx) + w / 2 > 20 || Math.abs(bz - cz) + d / 2 > 20) continue;
        // Keep clear of the shop buildings (gunshop/garage/clinic/safehouse).
        const nearShop = [PLACES.gunshop, PLACES.garage, PLACES.clinic, PLACES.safehouse]
          .some((s) => Math.hypot(bx - s.x, bz - s.z) < 13);
        if (nearShop) continue;
        // Facade variant varies per block (hash of block coords) so the city
        // is not one repeating texture.
        const variant = Math.floor(hash2(bi + 10, bj + 10) * 3);
        const wallBase = rangeInt(rand, 0, PALETTE.wall.length - 1) * 3 + variant;
        addBuilding(bx, bz, w, d, h, wallBase, rangeInt(rand, 0, 4), isHotelBlock && k === 0);
      }
    }
  }

  // --- Beach props: kiosk, umbrellas, palms, lighthouse, marina ------------
  // Beach kiosk (mission pickup).
  const kiosk = new THREE.Group();
  const kioskBase = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.4, 4),
    new THREE.MeshLambertMaterial({ color: 0xfff3d6 }),
  );
  kioskBase.position.y = 1.7;
  kioskBase.castShadow = true;
  kiosk.add(kioskBase);
  const kioskRoof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 2.2, 4),
    new THREE.MeshLambertMaterial({ color: 0xe86a5a }),
  );
  kioskRoof.position.y = 4.5;
  kioskRoof.rotation.y = Math.PI / 4;
  kiosk.add(kioskRoof);
  kiosk.position.set(PLACES.kiosk.x, 0, PLACES.kiosk.z);
  scene.add(kiosk);
  colliders.push({ minX: 75, maxX: 81, minZ: 194, maxZ: 198 });

  // Neon billboard "MARINA VERDE" on the north side of the beachfront road
  // (DESIGN §10.7): procedural canvas texture, unlit so it glows at night.
  {
    const bc = document.createElement('canvas');
    bc.width = 512;
    bc.height = 256;
    const b = bc.getContext('2d');
    b.fillStyle = '#160a24';
    b.fillRect(0, 0, 512, 256);
    b.strokeStyle = '#ff5fa2';
    b.lineWidth = 6;
    b.strokeRect(10, 10, 492, 236);
    b.textAlign = 'center';
    b.fillStyle = '#ff5fa2';
    b.font = '900 84px sans-serif';
    b.fillText('MARINA', 256, 104);
    b.fillStyle = '#ffd24a';
    b.font = '900 84px sans-serif';
    b.fillText('VERDE', 256, 188);
    // Polish 2 Q3: the board is the Verde FM neon billboard now.
    b.fillStyle = '#9fd8e8';
    b.font = '700 30px sans-serif';
    b.fillText('· VERDE FM 88.1 ·', 256, 234);
    const bTex = new THREE.CanvasTexture(bc);
    bTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 9),
      new THREE.MeshBasicMaterial({ map: bTex }),
    );
    board.position.set(60, 7.5, 176);
    scene.add(board);
    // P6 halo on the billboard's road-facing side (pink neon glow).
    const boardHalo = makeHaloSprite(world.haloTex, 0xff5fa2, 0.3, 11);
    boardHalo.position.set(60, 7.5, 176.6);
    scene.add(boardHalo);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    for (const px of [52, 68]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7.5, 8), postMat);
      post.position.set(px, 3.75, 176);
      scene.add(post);
    }
    colliders.push({ minX: 51, maxX: 69, minZ: 175, maxZ: 177 });
  }

  // Umbrellas + towels on the sand.
  const umbCols = [0xff8a5c, 0x38b6a0, 0xf2c230, 0xc96fd0];
  for (let i = 0; i < 12; i += 1) {
    const ux = -160 + i * 28 + range(rand, -6, 6);
    const uz = BEACH_Z + 12 + range(rand, 0, 26);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    pole.position.set(ux, 1.3, uz);
    pole.userData.batchKey = 'umbPole';
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1, 8),
      new THREE.MeshLambertMaterial({ color: umbCols[i % 4] }),
    );
    top.position.set(ux, 2.9, uz);
    top.userData.batchKey = 'umbTop';
    top.userData.instColor = umbCols[i % 4]; // batch uses a white base + setColorAt
    scene.add(top);
  }

  // Palm boulevard along the beachfront road.
  for (let x = -168; x <= 168; x += 24) {
    const palm = makePalm(rand);
    palm.position.set(x, 0, 176);
    scene.add(palm);
    world.palms.push(palm);
  }
  // Polish 2 Q4: tall framing palms flanking the cover shot's palm gap
  // (x 24-48, z 176): 1.45x taller, framing the chase instead of blocking
  // it. A dedicated seeded rand keeps the world RNG stream untouched.
  {
    const tallRand = mulberry32(CITY.SEED + 101);
    for (const tx of [-12, 12, 72, 96]) {
      const palm = makePalm(tallRand);
      palm.scale.y = 1.45;
      palm.position.set(tx, 0, 176);
      scene.add(palm);
      world.palms.push(palm);
    }
  }
  // Polish 2 Q9: ferris wheel landmark on the west beach (static, a few
  // batched meshes — visible from the beachfront road and the cover shot).
  buildFerrisWheel(scene, colliders, -138, 208);
  // Random palms on sidewalks elsewhere (fewer, for the draw-call budget).
  for (let i = 0; i < 12; i += 1) {
    const palm = makePalm(rand);
    palm.position.set(pick(rand, [-162, -110, -58, -6, 46, 98, 150]) + range(rand, -2, 2), 0, pick(rand, [-162, -110, -58, -6, 46, 98, 150]) + range(rand, -2, 2));
    scene.add(palm);
    world.palms.push(palm);
  }

  // Lighthouse on the west point.
  const lh = new THREE.Group();
  const lhBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 4.6, 26, 16),
    new THREE.MeshLambertMaterial({ color: 0xfff3d6 }),
  );
  lhBase.position.y = 13;
  lhBase.castShadow = true;
  lh.add(lhBase);
  const lhBand = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 3.7, 3, 16),
    new THREE.MeshLambertMaterial({ color: 0xe86a5a }),
  );
  lhBand.position.y = 18;
  lh.add(lhBand);
  const lhTop = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 3, 16),
    new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
  );
  lhTop.position.y = 27;
  lh.add(lhTop);
  const lhLamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
  );
  lhLamp.position.y = 27;
  lh.add(lhLamp);
  lh.position.set(PLACES.lighthouse.x, 0, PLACES.lighthouse.z);
  scene.add(lh);
  world.lighthouseLamp = lhLamp;
  colliders.push({ minX: -175, maxX: -165, minZ: 200, maxZ: 210 });

  // Marina: wooden pier + a white yacht (hero piece, Standard material).
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 60),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }),
  );
  pier.position.set(PLACES.marina.x, 0.4, 195);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  const yacht = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(7, 2.4, 22),
    new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.35, metalness: 0.1 }),
  );
  hull.position.y = 1;
  hull.castShadow = true;
  yacht.add(hull);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8f2f5, roughness: 0.5, metalness: 0.05 }),
  );
  cabin.position.set(0, 3, -2);
  yacht.add(cabin);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 9, 16),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  mast.position.set(0, 7, 2);
  yacht.add(mast);
  yacht.position.set(PLACES.yacht.x, 0.2, PLACES.yacht.z);
  scene.add(yacht);
  world.yacht = yacht;

  // Street-race start gantry (DESIGN §9.3): checkered banner over the
  // beachfront road at the race marker + a green ring on the asphalt.
  const checker = document.createElement('canvas');
  checker.width = 128;
  checker.height = 32;
  const cg = checker.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      cg.fillStyle = (i + j) % 2 === 0 ? '#111111' : '#f8f8f8';
      cg.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const checkerTex = new THREE.CanvasTexture(checker);
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  for (const pz of [PLACES.raceStart.z - 6, PLACES.raceStart.z + 6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5.5, 12), poleMat);
    pole.position.set(PLACES.raceStart.x, 2.75, pz);
    pole.castShadow = true;
    scene.add(pole);
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 1.6),
    new THREE.MeshLambertMaterial({ map: checkerTex, side: THREE.DoubleSide }),
  );
  banner.rotation.y = Math.PI / 2; // spans the road (z axis)
  banner.position.set(PLACES.raceStart.x, 5.2, PLACES.raceStart.z);
  scene.add(banner);
  const raceRing = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0x7be495, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  raceRing.rotation.x = -Math.PI / 2;
  raceRing.position.set(PLACES.raceStart.x, 0.12, PLACES.raceStart.z);
  scene.add(raceRing);
  world.raceRing = raceRing;

  // --- Street props: lamps, hydrants, benches ------------------------------
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  for (const line of ROAD_LINES) {
    if (line.axis !== 'x') continue;
    for (let x = -156; x <= 156; x += 104) { // every other block (draw-call budget)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 16), lampMat);
      pole.position.set(x, 3, line.at + 7);
      pole.userData.batchKey = 'lampPole';
      scene.add(pole);
      if (line.at === 182) {
        // Beachfront hero lamps (P6): halo sprite INSTEAD of the solid glow
        // ball — Sol: don't draw both without a visual reason.
        const halo = makeHaloSprite(world.haloTex, 0xffe9a0, 0.32, 3.2);
        halo.position.set(x, 6.2, line.at + 7);
        scene.add(halo);
      } else {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampGlowMat);
        lamp.position.set(x, 6.2, line.at + 7);
        lamp.userData.batchKey = 'lampGlow';
        scene.add(lamp);
      }
    }
  }

  // Polish 2 Q3: light pools under the beachfront lamps — ONE InstancedMesh
  // of additive quads (a decal, NOT a PointLight per lamp), depthWrite off.
  {
    const poolGeo = new THREE.PlaneGeometry(7, 7);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const xs = [-156, -52, 52, 156];
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, xs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    xs.forEach((x, i) => {
      m4.compose(new THREE.Vector3(x, 0.06, 189), q, new THREE.Vector3(1, 1, 1));
      pools.setMatrixAt(i, m4);
    });
    pools.count = xs.length;
    pools.instanceMatrix.needsUpdate = true;
    pools.computeBoundingSphere();
    scene.add(pools);
    world.lightPools = pools;
  }

  // --- Ocean buoys + a distant sailboat ------------------------------------
  for (let i = 0; i < 6; i += 1) {
    const buoy = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xe86a5a }),
    );
    buoy.position.set(-140 + i * 55, 0.3, SEA_Z + 40 + (i % 2) * 25);
    buoy.userData.batchKey = 'buoy';
    scene.add(buoy);
  }

  // --- P7 instancing (Sol corrections, applied as a final pass) ------------
  // Meshes flagged with userData.batchKey are collected by WORLD matrix and
  // replaced with InstancedMesh batches. Rules enforced here:
  // - matrices are WORLD matrices (updateMatrixWorld, then copy matrixWorld;
  //   the batch itself sits at the scene root with an identity transform, so
  //   inverse(batch.matrixWorld) x oldMesh.matrixWorld == oldMesh.matrixWorld).
  // - NO negative scale / shear anywhere (every source transform is plain
  //   translate / rotate / axis scale).
  // - one batch per (geometry + material + shadow settings + QUADRANT zone),
  //   never one city-wide batch: a single bounding sphere would keep the
  //   whole city in the vertex pipeline. Zones are city quadrants (x>=0 /
  //   z>=0) — small enough to cull, big enough to still save calls.
  // - count == number of live instances; every slot is filled; needsUpdate
  //   set; computeBoundingSphere() called after the matrices are in.
  // - setColorAt is only an RGB multiplier: the umbrella-top batch uses a
  //   WHITE base material and stores the final colour per instance.
  // - the world RNG stream is untouched (this pass draws nothing from rand).
  // - building BOXES are deliberately NOT batched: each carries a cloned
  //   facade texture with a per-building repeat (window size), and batching
  //   would stretch the windows. Roofs/AC/tanks share materials, so they batch.
  {
    const zoneOf = (x, z) => (x >= 0 ? 'E' : 'W') + (z >= 0 ? 'S' : 'N');
    const matSig = (o) => {
      if (o.userData.batchKey === 'umbTop') return 'white';
      const m = o.material;
      const col = m.color ? m.color.getHexString() : 'nocol';
      return `${m.type}|${col}|${m.map ? m.map.uuid : ''}|${m.emissiveMap ? m.emissiveMap.uuid : ''}|${m.transparent ? 1 : 0}|${m.opacity}`;
    };
    // Polish 2 Q10 (Sol correctness): the batch identity is geometry +
    // material + castShadow + receiveShadow + renderOrder. Geometry is
    // keyed by type + parameters (NOT uuid: every `new BoxGeometry` gets
    // its own uuid, which would split identical boxes into own batches).
    // 'cloud' / 'palmTrunk' are exempt: their per-instance size lives in
    // unitR/unitH and the batch uses ONE unit geometry for all of them.
    const geoSig = (o) => {
      if (o.userData.batchKey === 'cloud' || o.userData.batchKey === 'palmTrunk') return 'unit';
      const g = o.geometry;
      return `${g.type}|${JSON.stringify(g.parameters ?? {})}`;
    };
    const groups = new Map();
    const doomed = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.userData.batchKey) return;
      o.updateWorldMatrix(true, false);
      const wp = o.getWorldPosition(new THREE.Vector3());
      const key = `${o.userData.batchKey}|${zoneOf(wp.x, wp.z)}|${matSig(o)}|${geoSig(o)}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          batchKey: o.userData.batchKey, geo: o.geometry, mat: o.material,
          cast: o.castShadow, recv: o.receiveShadow, items: [],
        };
        groups.set(key, g);
      }
      g.items.push({
        matrix: o.matrixWorld.clone(),
        instColor: o.userData.instColor,
        unitR: o.userData.unitR,
        unitH: o.userData.unitH,
      });
      doomed.push(o);
    });
    for (const o of doomed) o.parent.remove(o);
    // Unit geometries for the two cases whose source geometries differ per
    // instance: cloud puffs (radius varies) and palm trunks (height varies).
    const unitGeo = (batchKey) => {
      if (batchKey === 'cloud') return new THREE.SphereGeometry(1, 7, 6);
      if (batchKey === 'palmTrunk') return new THREE.CylinderGeometry(0.12, 0.22, 1, 12);
      return null;
    };
    const m4 = new THREE.Matrix4();
    const s4 = new THREE.Matrix4();
    world.batchStats = {};
    for (const g of groups.values()) {
      const geo = unitGeo(g.batchKey) ?? g.geo;
      let mat = g.mat;
      if (g.batchKey === 'umbTop') mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const im = new THREE.InstancedMesh(geo, mat, g.items.length);
      g.items.forEach((it, i) => {
        m4.copy(it.matrix);
        if (it.unitR !== undefined) m4.multiply(s4.makeScale(it.unitR, it.unitR, it.unitR));
        if (it.unitH !== undefined) m4.multiply(s4.makeScale(1, it.unitH, 1));
        im.setMatrixAt(i, m4);
        if (it.instColor !== undefined) im.setColorAt(i, new THREE.Color(it.instColor));
      });
      im.count = g.items.length;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = g.cast;
      im.receiveShadow = g.recv;
      scene.add(im);
      world.batchStats[g.batchKey] = (world.batchStats[g.batchKey] ?? 0) + 1;
    }
    world.batchMeshes = doomed.length;
    world.batchCalls = groups.size;
  }

  return world;
}

// Circle (x, z, r) vs AABB colliders — push the circle out. Returns corrected x/z.
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - c.minX;
        const pr = c.maxX - x;
        const pt = z - c.minZ;
        const pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r;
        else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
  }
  return { x, z };
}

// Line-of-sight (G-TOP2): true when the segment (x1,z1)-(x2,z2) is not
// blocked by any building AABB. 2D slab test; a segment starting inside a
// box counts as blocked. Used by the police SEARCH state.
export function hasLineOfSight(colliders, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  for (const c of colliders) {
    // Shrink the box by a small margin: grazing a corner still counts as seen.
    const minX = c.minX + 0.4;
    const maxX = c.maxX - 0.4;
    const minZ = c.minZ + 0.4;
    const maxZ = c.maxZ - 0.4;
    if (minX >= maxX || minZ >= maxZ) continue;
    let tmin = 0;
    let tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < minX || x1 > maxX) continue;
    } else {
      let t1 = (minX - x1) / dx;
      let t2 = (maxX - x1) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (z1 < minZ || z1 > maxZ) continue;
    } else {
      let t1 = (minZ - z1) / dz;
      let t2 = (maxZ - z1) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return false; // the segment crosses this building
  }
  return true;
}

export function clampToCity(x, z) {
  return {
    x: Math.max(-195, Math.min(195, x)),
    z: Math.max(-195, Math.min(258, z)),
  };
}
