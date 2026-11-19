// Ember Vice — combat.js
// One job: shooting and punching. Hitscan pistol fire with a tracer and
// muzzle flash, punches on foot, enemy Vultures for the dockside mission,
// and damage to the player.

import * as THREE from 'three';
import { COMBAT } from './config.js';
import { makePedMesh } from './pedestrians.js';
import { dist2 } from './config.js';

export function createCombat(scene, rng) {
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(1, 0.06, 0.06);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const enemies = [];

  function spawnEnemy(x, z) {
    const mesh = makePedMesh(0x3a1a1a, 0x222222, 0xc98d64);
    // Red bandana: a red box across the head.
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: 0xc2131a }));
    band.position.y = 1.74;
    mesh.add(band);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const e = { mesh, x, z, heading: 0, health: COMBAT.enemyHealth, shootTimer: 1 + rng() * 2, walkPhase: 0, dead: false };
    enemies.push(e);
    return e;
  }

  function clearEnemies() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
  }

  function addTracer(from, to) {
    const t = new THREE.Mesh(tracerGeo, tracerMat);
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    t.position.set(mid.x, mid.y, mid.z);
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    t.scale.x = len;
    t.lookAt(to.x, to.y, to.z);
    t.userData.life = 0.09;
    scene.add(t);
    tracers.push(t);
  }

  // Fire one hitscan shot from `origin` along `dir` (unit, xz-plane + slight
  // drop). Returns the closest thing hit, or null. `targets` is a list of
  // {x, z, radius, health, onHit, onKill, kind}.
  function shoot(origin, dir, range, targets, world) {
    const end = {
      x: origin.x + dir.x * range,
      y: origin.y + dir.y * range,
      z: origin.z + dir.z * range,
    };
    let best = null;
    let bestT = Infinity;
    for (const t of targets) {
      if (t.dead || t.health <= 0) continue;
      // Closest approach of the ray to the target's centre (2D, at chest height).
      const dx = t.x - origin.x, dz = t.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > range) continue;
      const px = origin.x + dir.x * along, pz = origin.z + dir.z * along;
      const dd = Math.hypot(t.x - px, t.z - pz);
      if (dd < (t.radius || 1.0) && along < bestT) {
        best = t; bestT = along;
      }
    }
    if (best) {
      end.x = origin.x + dir.x * bestT;
      end.y = 1.4;
      end.z = origin.z + dir.z * bestT;
      best.health -= COMBAT.pistolDamage;
      if (best.onHit) best.onHit(best);
      if (best.health <= 0 && best.onKill) best.onKill(best);
    } else {
      // Miss: the tracer ends at the range limit, low over the ground.
      end.y = Math.max(0.4, origin.y + dir.y * range);
    }
    addTracer(origin, end);
    return best;
  }

  function update(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.userData.life -= dt;
      if (t.userData.life <= 0) {
        scene.remove(t);
        tracers.splice(i, 1);
      }
    }
    // Enemies strafe toward the player and shoot back (inaccurately).
    for (const e of enemies) {
      if (e.dead) continue;
      e.shootTimer -= dt;
    }
  }

  return { enemies, spawnEnemy, clearEnemies, shoot, update, addTracer };
}

// Enemy AI step, kept beside combat: move toward the player and fire with
// poor aim; called from main.js so combat stays free of game state.
export function stepEnemy(e, dt, px, pz, onEnemyShot) {
  if (e.dead) return;
  const dx = px - e.x, dz = pz - e.z;
  const d = Math.hypot(dx, dz);
  e.heading = Math.atan2(dx, dz);
  if (d > 14) {
    e.x += Math.sin(e.heading) * 3.4 * dt;
    e.z += Math.cos(e.heading) * 3.4 * dt;
    e.walkPhase += dt * 8;
    const swing = Math.sin(e.walkPhase) * 0.5;
    const u = e.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
  }
  e.mesh.position.set(e.x, 0, e.z);
  e.mesh.rotation.y = e.heading;
  if (d < 40 && e.shootTimer <= 0) {
    e.shootTimer = 1.4 + Math.random() * 1.2;
    if (onEnemyShot) onEnemyShot(e, d);
  }
}
