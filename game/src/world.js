// Marina Verde — procedural city. Builds the whole 3D world from the seed in
// config.js: road grid, pastel towers with lit windows, beach and sea, palm
// boulevards, a park, a landmark tower, a lighthouse and the marina. Also owns
// the collision boxes and the named places missions point at.
import * as THREE from 'three';
import { CITY, ROAD_MIN, ROAD_MAX, BEACH_Z, SEA_Z, CITY_HALF, PALETTE, ROAD_LINES, PLACES } from './config.js';
import { mulberry32, pick, range, rangeInt, hash2 } from './rng.js';

const STEP = CITY.BLOCK_STEP;

function windowTexture(rand) {
  // One shared canvas texture: a facade of windows, some lit warm.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 22) {
    for (let x = 8; x < 120; x += 18) {
      const lit = rand() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#2c4a63';
      g.fillRect(x, y, 11, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePalm(rand) {
  const group = new THREE.Group();
  const h = range(rand, 5, 8);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, h, 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }),
  );
  trunk.position.y = h / 2;
  trunk.rotation.z = range(rand, -0.08, 0.08);
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.9, h + 0.15, Math.sin(a) * 0.9);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    group.add(leaf);
  }
  return group;
}

export function buildWorld(scene) {
  const rand = mulberry32(CITY.SEED);
  const colliders = []; // {minX, maxX, minZ, maxZ}
  const world = { colliders, places: PLACES, palms: [] };

  // --- Sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0x9fd0e8, 320, 900);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
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

  // Sun disc + a few clouds (cheap billboards of spheres).
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
  );
  sunBall.position.set(320, 260, -420);
  scene.add(sunBall);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rand, 6, 12), 8, 8), cloudMat);
      puff.position.set(j * 9 - 14, range(rand, -2, 2), range(rand, -4, 4));
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(range(rand, -380, 380), range(rand, 120, 170), range(rand, -380, 120));
    scene.add(cloud);
  }

  // --- Ground: grass base, then city slab, sand, sea ------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 60);
  ground.receiveShadow = true;
  scene.add(ground);

  const citySlab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 24, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  citySlab.rotation.x = -Math.PI / 2;
  citySlab.position.set(0, 0, 0);
  citySlab.receiveShadow = true;
  scene.add(citySlab);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, BEACH_Z + 22);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 500),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, SEA_Z + 250);
  scene.add(sea);
  // A second, deeper band of sea for depth.
  const seaDeep = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 300),
    new THREE.MeshLambertMaterial({ color: PALETTE.seaDeep }),
  );
  seaDeep.rotation.x = -Math.PI / 2;
  seaDeep.position.set(0, -0.6, SEA_Z + 480);
  scene.add(seaDeep);

  // --- Roads ---------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5e9a8 });
  for (const line of ROAD_LINES) {
    const isX = line.axis === 'x';
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(isX ? 380 : CITY.ROAD_W, isX ? CITY.ROAD_W : 380),
      roadMat,
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(isX ? 0 : line.at, 0.03, isX ? line.at : 0);
    road.receiveShadow = true;
    scene.add(road);
    // Dashed centre line.
    for (let d = -180; d < 180; d += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(isX ? 5 : 0.5, isX ? 0.5 : 5), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(isX ? d : line.at, 0.05, isX ? line.at : d);
      scene.add(dash);
    }
  }
  // Beachfront road along the sand.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(380, CITY.ROAD_W), roadMat);
  front.rotation.x = -Math.PI / 2;
  front.position.set(0, 0.03, 182);
  front.receiveShadow = true;
  scene.add(front);
  ROAD_LINES.push({ axis: 'x', at: 182 });

  // --- Buildings -----------------------------------------------------------
  const facade = windowTexture(rand);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMats = PALETTE.wall.map(
    (c) => new THREE.MeshLambertMaterial({ color: c, map: facade }),
  );
  const roofMats = PALETTE.roof.map((c) => new THREE.MeshLambertMaterial({ color: c }));

  function addBuilding(x, z, w, d, h, wallIdx, roofIdx, isHotel = false) {
    const mat = wallMats[wallIdx % wallMats.length];
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
    scene.add(roof);
    // Rooftop AC box, for silhouette variety.
    const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x9aa4ad }));
    ac.scale.set(Math.min(4, w * 0.3), 1.2, Math.min(4, d * 0.3));
    ac.position.set(x + w * 0.2, h + 1.2, z - d * 0.15);
    scene.add(ac);
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
    new THREE.CylinderGeometry(1.2, 2.4, 22, 8),
    new THREE.MeshLambertMaterial({ color: 0x2f6f6a }),
  );
  spire.position.set(26, 78 + 11, 26);
  spire.castShadow = true;
  scene.add(spire);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 10),
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
        addBuilding(bx, bz, w, d, h, rangeInt(rand, 0, 6), rangeInt(rand, 0, 4), isHotelBlock && k === 0);
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

  // Umbrellas + towels on the sand.
  const umbCols = [0xff8a5c, 0x38b6a0, 0xf2c230, 0xc96fd0];
  for (let i = 0; i < 12; i += 1) {
    const ux = -160 + i * 28 + range(rand, -6, 6);
    const uz = BEACH_Z + 12 + range(rand, 0, 26);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    pole.position.set(ux, 1.3, uz);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1, 8),
      new THREE.MeshLambertMaterial({ color: umbCols[i % 4] }),
    );
    top.position.set(ux, 2.9, uz);
    scene.add(top);
  }

  // Palm boulevard along the beachfront road.
  for (let x = -168; x <= 168; x += 24) {
    const palm = makePalm(rand);
    palm.position.set(x, 0, 176);
    scene.add(palm);
    world.palms.push(palm);
  }
  // Random palms on sidewalks elsewhere.
  for (let i = 0; i < 24; i += 1) {
    const palm = makePalm(rand);
    palm.position.set(pick(rand, [-162, -110, -58, -6, 46, 98, 150]) + range(rand, -2, 2), 0, pick(rand, [-162, -110, -58, -6, 46, 98, 150]) + range(rand, -2, 2));
    scene.add(palm);
    world.palms.push(palm);
  }

  // Lighthouse on the west point.
  const lh = new THREE.Group();
  const lhBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 4.6, 26, 12),
    new THREE.MeshLambertMaterial({ color: 0xfff3d6 }),
  );
  lhBase.position.y = 13;
  lhBase.castShadow = true;
  lh.add(lhBase);
  const lhBand = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 3.7, 3, 12),
    new THREE.MeshLambertMaterial({ color: 0xe86a5a }),
  );
  lhBand.position.y = 18;
  lh.add(lhBand);
  const lhTop = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 3, 10),
    new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
  );
  lhTop.position.y = 27;
  lh.add(lhTop);
  const lhLamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
  );
  lhLamp.position.y = 27;
  lh.add(lhLamp);
  lh.position.set(PLACES.lighthouse.x, 0, PLACES.lighthouse.z);
  scene.add(lh);
  world.lighthouseLamp = lhLamp;
  colliders.push({ minX: -175, maxX: -165, minZ: 200, maxZ: 210 });

  // Marina: wooden pier + a white yacht.
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
    new THREE.MeshLambertMaterial({ color: 0xf8f8f8 }),
  );
  hull.position.y = 1;
  hull.castShadow = true;
  yacht.add(hull);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.2, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8f2f5 }),
  );
  cabin.position.set(0, 3, -2);
  yacht.add(cabin);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  mast.position.set(0, 7, 2);
  yacht.add(mast);
  yacht.position.set(PLACES.yacht.x, 0.2, PLACES.yacht.z);
  scene.add(yacht);
  world.yacht = yacht;

  // --- Street props: lamps, hydrants, benches ------------------------------
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  for (const line of ROAD_LINES) {
    if (line.axis !== 'x') continue;
    for (let x = -168; x <= 168; x += 52) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
      pole.position.set(x, 3, line.at + 7);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampGlowMat);
      lamp.position.set(x, 6.2, line.at + 7);
      scene.add(lamp);
    }
  }

  // --- Ocean buoys + a distant sailboat ------------------------------------
  for (let i = 0; i < 6; i += 1) {
    const buoy = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xe86a5a }),
    );
    buoy.position.set(-140 + i * 55, 0.3, SEA_Z + 40 + (i % 2) * 25);
    scene.add(buoy);
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

export function clampToCity(x, z) {
  return {
    x: Math.max(-195, Math.min(195, x)),
    z: Math.max(-195, Math.min(258, z)),
  };
}
