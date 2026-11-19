// Ember Vice — pedestrians.js
// One job: the people of Solmar. Low-poly walkers who stroll the sidewalks,
// cross at intersections, and run away from gunfire and speeding cars.

import * as THREE from 'three';
import { CITY, PEDS } from './config.js';
import { range, rangeInt, pick, chance } from './random.js';
import { pointInAnyCollider } from './city.js';

const SHIRTS = [0xd8e4f0, 0xe8b13c, 0x7a4a8e, 0x3f7a4d, 0xc23b2e, 0x2e6fc2, 0xe8e4d8, 0x8e5a2e];
const PANTS = [0x2a2e38, 0x4a3a2a, 0x3a4a5a, 0x5a5a5a];

export function makePedMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.24), pantsMat);
  legL.position.set(0, 0.34, 0.14);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.24), pantsMat);
  legR.position.set(0, 0.34, -0.14);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), shirtMat);
  armL.position.set(0, 1.05, 0.26);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), shirtMat);
  armR.position.set(0, 1.05, -0.26);
  group.add(armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export function createPeds(scene, rng, colliders) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const mesh = makePedMesh(
      pick(rng, SHIRTS), pick(rng, PANTS),
      pick(rng, [0xc98d64, 0x8a5a34, 0xe8b88a, 0x6b4226]),
    );
    let x, z, tries = 0;
    do {
      x = range(rng, -200, 200);
      z = range(rng, -200, 200);
      tries += 1;
    } while (pointInAnyCollider(colliders, x, z) && tries < 30);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z,
      heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, 1.0, 1.8),
      walkPhase: range(rng, 0, 6),
      retarget: range(rng, 2, 8),
      fleeing: 0,
      fallen: 0,
      dead: false,
    });
  }

  // A ped hit by a car or a bullet falls and stays down for a while.
  function knockDown(p, hard) {
    if (p.fallen > 0) return;
    p.fallen = hard ? 6 : 3;
    p.mesh.rotation.x = -Math.PI / 2;
    p.mesh.position.y = 0.35;
  }

  function update(dt, danger) {
    for (const p of peds) {
      if (p.dead) continue;
      if (p.fallen > 0) {
        p.fallen -= dt;
        if (p.fallen <= 0) {
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
        }
        continue;
      }
      // Flee from the danger point (gunfire, a speeding car).
      if (danger) {
        const dx = p.x - danger.x, dz = p.z - danger.z;
        const d = Math.hypot(dx, dz);
        if (d < 22) {
          p.fleeing = 2.5;
          p.heading = Math.atan2(dx, dz);
        }
      }
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        p.speed = 4.2;
      } else {
        p.speed += (1.4 - p.speed) * Math.min(1, dt);
        p.retarget -= dt;
        if (p.retarget <= 0) {
          p.retarget = range(rng, 3, 9);
          // Walk along a street, or cross at an intersection.
          if (chance(rng, 0.6)) {
            const street = pick(rng, CITY.streets);
            if (chance(rng, 0.5)) { p.x = street + (chance(rng, 0.5) ? 8.5 : -8.5); p.heading = chance(rng, 0.5) ? 0 : Math.PI; }
            else { p.z = street + (chance(rng, 0.5) ? 8.5 : -8.5); p.heading = chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2; }
          } else {
            p.heading = range(rng, 0, Math.PI * 2);
          }
        }
      }
      const nx = p.x + Math.sin(p.heading) * p.speed * dt;
      const nz = p.z + Math.cos(p.heading) * p.speed * dt;
      if (!pointInAnyCollider(colliders, nx, nz) && Math.abs(nx) < 208 && Math.abs(nz) < 208 && nx < CITY.oceanX - 2) {
        p.x = nx; p.z = nz;
      } else {
        p.heading += Math.PI / 2;
      }
      p.walkPhase += dt * p.speed * 2.4;
      const swing = Math.sin(p.walkPhase) * 0.5;
      const u = p.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  return { peds, update, knockDown };
}
