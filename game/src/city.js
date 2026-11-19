// Ember Vice — city.js
// One job: build the whole city of Solmar as three.js meshes — ground with
// painted roads, procedural buildings with lit windows, landmarks with signs,
// palms, lamps, the beach, the ocean and the marina — and hand back the
// collision boxes, collectible spots and a per-frame update (boats bob).

import * as THREE from 'three';
import { CITY, COLOURS, LANDMARKS, COLLECTIBLES } from './config.js';
import { range, rangeInt, pick, chance } from './random.js';

const WORLD = CITY.size;            // ground plane side in metres
const PX = 2048 / WORLD;            // canvas pixels per metre
const HALF = WORLD / 2;

function toPx(v) { return (v + HALF) * PX; }

// ---- Canvas textures --------------------------------------------------------
function facadeTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shade so the top reads darker against the sky.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Ground floor: darker shopfront band.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 216, 128, 40);
  // Windows: 6 columns x 12 rows, some lit warm.
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const x = 8 + col * 20, y = 10 + row * 17;
      const r = Math.random();
      g.fillStyle = r < lit ? '#ffd98a' : (r < lit + 0.25 ? '#9fb8d8' : '#20242e');
      g.fillRect(x, y, 12, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#fff7e8';
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 2048;
  const g = c.getContext('2d');
  // Base: sidewalk concrete.
  g.fillStyle = '#8d8578';
  g.fillRect(0, 0, 2048, 2048);
  // Parks (green blocks).
  const parks = [[-150, 150], [150, -150]];
  for (const [bx, bz] of parks) {
    g.fillStyle = '#4d7a45';
    g.fillRect(toPx(bx - 24), toPx(bz - 24), 48 * PX, 48 * PX);
  }
  // Central plaza.
  g.fillStyle = '#b8a98a';
  g.beginPath();
  g.arc(toPx(30), toPx(30), 22 * PX, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5d8a9e';
  g.beginPath();
  g.arc(toPx(30), toPx(30), 6 * PX, 0, Math.PI * 2);
  g.fill();
  // Beach sand, then ocean.
  g.fillStyle = '#e0c188';
  g.fillRect(toPx(CITY.beachX), 0, (CITY.oceanX - CITY.beachX) * PX, 2048);
  const ocean = g.createLinearGradient(toPx(CITY.oceanX), 0, 2048, 0);
  ocean.addColorStop(0, '#2a8aa8');
  ocean.addColorStop(1, '#14506e');
  g.fillStyle = ocean;
  g.fillRect(toPx(CITY.oceanX), 0, 2048 - toPx(CITY.oceanX), 2048);
  // Foam line at the water's edge.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(toPx(CITY.oceanX) - 2, 0, 4, 2048);
  // Roads: dark strips along every street line.
  g.fillStyle = '#33363c';
  for (const s of CITY.streets) {
    g.fillRect(toPx(s - CITY.roadHalf), 0, CITY.roadHalf * 2 * PX, 2048);
    g.fillRect(0, toPx(s - CITY.roadHalf), 2048, CITY.roadHalf * 2 * PX);
  }
  // Lane dashes: yellow centre line on each street.
  g.fillStyle = '#d8b13c';
  for (const s of CITY.streets) {
    for (let v = -HALF + 6; v < HALF - 6; v += 12) {
      g.fillRect(toPx(s) - 1, toPx(v), 2, 6 * PX);
      g.fillRect(toPx(v), toPx(s) - 1, 6 * PX, 2);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const sx of CITY.streets) {
    for (const sz of CITY.streets) {
      for (let i = -2; i <= 2; i += 1) {
        g.fillRect(toPx(sx + i * 2.2) - 2, toPx(sz - CITY.roadHalf), 4, 3 * PX);
        g.fillRect(toPx(sx + i * 2.2) - 2, toPx(sz + CITY.roadHalf - 3), 4, 3 * PX);
      }
    }
  }
  // Block tint variation so blocks read as separate lots.
  for (let i = 0; i < 36; i += 1) {
    const bx = -150 + (i % 6) * 60, bz = -150 + Math.floor(i / 6) * 60;
    g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`;
    g.fillRect(toPx(bx - 24), toPx(bz - 24), 48 * PX, 48 * PX);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---- Collision --------------------------------------------------------------
export function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Push a circle out of every box it overlaps; returns true when it hit one.
export function resolveCircle(colliders, pos, r) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 1e-6) {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - b.minX, pr = b.maxX - pos.x;
      const pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.minX - r;
      else if (m === pr) pos.x = b.maxX + r;
      else if (m === pt) pos.z = b.minZ - r;
      else pos.z = b.maxZ + r;
    } else {
      const d = Math.sqrt(d2);
      dx /= d; dz /= d;
      pos.x = cx + dx * r;
      pos.z = cz + dz * r;
    }
  }
  return hit;
}

export function pointInAnyCollider(colliders, x, z) {
  for (const b of colliders) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

// ---- City build ---------------------------------------------------------------
export function buildCity(scene, rng) {
  const colliders = [];
  const boats = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Facade materials (shared, three hues).
  const facades = [
    new THREE.MeshLambertMaterial({ map: facadeTexture('#7a6a5c', 0.28) }),
    new THREE.MeshLambertMaterial({ map: facadeTexture('#5c6a7a', 0.22) }),
    new THREE.MeshLambertMaterial({ map: facadeTexture('#8a7a6a', 0.32) }),
  ];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });

  const landmarkBlocks = new Set();
  for (const lm of LANDMARKS) {
    const bx = Math.round((lm.x + 18) / 60) * 60 - 30;
    const bz = Math.round((lm.z + 18) / 60) * 60 - 30;
    landmarkBlocks.add(bx + ',' + bz);
  }

  function addBuilding(cx, cz, w, d, h, mat, signText, signBg) {
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const roof = new THREE.Mesh(unitBox, roofMat);
    roof.scale.set(w + 0.6, 0.8, d + 0.6);
    roof.position.set(cx, h + 0.4, cz);
    group.add(roof);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    if (signText) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(22, w + 2), 5.5),
        new THREE.MeshBasicMaterial({ map: signTexture(signText, signBg || '#22303f') }),
      );
      // Face the nearest street (south side of the building).
      sign.position.set(cx, Math.min(h - 2.5, 9), cz - d / 2 - 0.15);
      sign.rotation.y = Math.PI;
      group.add(sign);
    }
    return mesh;
  }

  // Landmark buildings first (they claim their block).
  for (const lm of LANDMARKS) {
    const cx = lm.x + 18, cz = lm.z + 18;
    const mat = new THREE.MeshLambertMaterial({ map: facadeTexture('#' + lm.color.toString(16).padStart(6, '0'), 0.35) });
    addBuilding(cx, cz, 22, 16, lm.h, mat, lm.name);
  }

  // Regular blocks: 1–4 buildings per block, or a park / plaza.
  const blockCentres = [];
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 6; j += 1) blockCentres.push([-150 + i * 60, -150 + j * 60]);
  }
  for (const [bx, bz] of blockCentres) {
    const key = bx + ',' + bz;
    if (bx === 30 && bz === 30) continue;              // central plaza
    if ((bx === -150 && bz === 150) || (bx === 150 && bz === -150)) continue; // parks
    const downtown = 1 - Math.hypot(bx, bz) / 320;
    const isLandmarkBlock = landmarkBlocks.has(key);
    const lots = isLandmarkBlock ? 1 : rangeInt(rng, 2, 4);
    const used = new Set();
    for (let n = 0; n < lots; n += 1) {
      const lx = pick(rng, [-12, 12]), lz = pick(rng, [-12, 12]);
      const lk = lx + ',' + lz;
      if (used.has(lk)) continue;
      used.add(lk);
      const w = range(rng, 14, 20), d = range(rng, 14, 20);
      const h = isLandmarkBlock
        ? range(rng, 8, 12)
        : range(rng, 9, 10) + downtown * range(rng, 8, 46) + rng() * 6;
      addBuilding(bx + lx, bz + lz, w, d, Math.round(h), pick(rng, facades));
    }
  }

  // Palms: along the beach and scattered on sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  function addPalm(x, z, s = 1) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.castShadow = true;
    palm.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 7.6 * s;
    leaves.castShadow = true;
    palm.add(leaves);
    palm.position.set(x, 0, z);
    palm.scale.setScalar(s);
    group.add(palm);
  }
  for (let z = -200; z <= 200; z += 28) addPalm(232, z + range(rng, -6, 6), range(rng, 0.9, 1.3));
  for (let i = 0; i < 26; i += 1) {
    const s = pick(rng, CITY.streets);
    const along = range(rng, -200, 200);
    addPalm(s + (chance(rng, 0.5) ? 8.5 : -8.5), along, range(rng, 0.8, 1.1));
  }
  // Park trees (round canopies).
  const parkTreeGeo = new THREE.SphereGeometry(2.2, 8, 6);
  for (const [px, pz] of [[-150, 150], [150, -150]]) {
    for (let i = 0; i < 6; i += 1) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3;
      tree.add(trunk);
      const top = new THREE.Mesh(parkTreeGeo, leafMat);
      top.position.y = 7.5;
      top.castShadow = true;
      tree.add(top);
      tree.position.set(px + range(rng, -18, 18), 0, pz + range(rng, -18, 18));
      group.add(tree);
    }
  }

  // Street lamps at intersections.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const sx of CITY.streets) {
    for (const sz of CITY.streets) {
      if ((sx + sz) % 120 !== 0) continue;
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, lampMat);
      pole.position.y = 3.25;
      lamp.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.y = 6.6;
      lamp.add(bulb);
      lamp.position.set(sx + 8, 0, sz + 8);
      group.add(lamp);
    }
  }

  // Marina: wooden piers and three boats bobbing in the water.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  for (let i = 0; i < 3; i += 1) {
    const pier = new THREE.Mesh(unitBox, pierMat);
    pier.scale.set(26, 0.8, 4);
    pier.position.set(CITY.oceanX + 12, 0.4, 30 + i * 30);
    pier.castShadow = true;
    group.add(pier);
  }
  const hullColors = [0xc23b2e, 0x2e6fc2, 0xe8e4d8];
  for (let i = 0; i < 3; i += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: hullColors[i] }));
    hull.scale.set(7, 1.6, 2.6);
    hull.position.y = 0.8;
    hull.castShadow = true;
    boat.add(hull);
    const cabin = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }));
    cabin.scale.set(2.6, 1.4, 2);
    cabin.position.set(-0.5, 2.2, 0);
    boat.add(cabin);
    boat.position.set(CITY.oceanX + 16, 0, 44 + i * 30);
    group.add(boat);
    boats.push(boat);
  }

  // Collectible stashes: glowing ember crates on sidewalks and in parks.
  const collectibleSpots = [];
  const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x903a00 });
  for (let i = 0; i < COLLECTIBLES.count; i += 1) {
    let x, z, tries = 0;
    do {
      const s = pick(rng, CITY.streets);
      x = chance(rng, 0.5) ? s + 9 : range(rng, -200, 200);
      z = x === s + 9 || chance(rng, 0.5) ? range(rng, -200, 200) : s + 9;
      if (chance(rng, 0.3)) { x = range(rng, -200, 200); z = range(rng, -200, 200); }
      tries += 1;
    } while (pointInAnyCollider(colliders, x, z) && tries < 20);
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(x, 0.9, z);
    crate.castShadow = true;
    group.add(crate);
    collectibleSpots.push({ x, z, mesh: crate, taken: false });
  }

  function update(dt, t) {
    for (let i = 0; i < boats.length; i += 1) {
      boats[i].position.y = Math.sin(t * 0.9 + i * 1.7) * 0.25;
      boats[i].rotation.z = Math.sin(t * 0.7 + i) * 0.03;
    }
    for (const c of collectibleSpots) {
      if (!c.taken) c.mesh.rotation.y += dt * 1.2;
    }
  }

  return { colliders, collectibleSpots, update };
}
