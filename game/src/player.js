// Ember Vice — player.js
// One job: Dario Cruz on foot and behind the wheel — movement, jumping,
// the third-person camera, getting in and out of cars, and aiming the pistol.
// The game loop owns the rules; this owns the body and the camera.

import * as THREE from 'three';
import { PLAYER, COMBAT, CITY } from './config.js';
import { clamp, dist2 } from './config.js';
import { makePedMesh } from './pedestrians.js';
import { resolveCircle } from './city.js';
import { driveCar } from './vehicles.js';

export function createPlayer(scene, startX, startZ) {
  const mesh = makePedMesh(0x2e4a6b, 0x2a2e38, 0xc98d64);
  // Dario's jacket: bright red so the hero reads against the city.
  const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  jacket.position.y = 1.18;
  mesh.add(jacket);
  mesh.position.set(startX, 0, startZ);
  scene.add(mesh);
  return {
    mesh,
    x: startX,
    z: startZ,
    heading: Math.PI * 0.75,
    camYaw: Math.PI * 0.75,
    camPitch: 0.32,
    vy: 0,
    grounded: true,
    health: PLAYER.health,
    moving: false,
    walkPhase: 0,
    ammo: COMBAT.pistolAmmo,
    reserve: COMBAT.pistolReserve,
    reloading: 0,
    fireCooldown: 0,
    punchCooldown: 0,
  };
}

// On-foot step: WASD relative to the camera, mouse orbits, Space jumps.
export function stepOnFoot(p, input, dt, world) {
  const k = input.keys;
  p.camYaw -= input.mouseDX * 0.0032;
  p.camPitch = clamp(p.camPitch + input.mouseDY * 0.0022, -0.15, 0.9);

  let fx = 0, fz = 0;
  const fwdX = Math.sin(p.camYaw), fwdZ = Math.cos(p.camYaw);
  const rightX = Math.cos(p.camYaw), rightZ = -Math.sin(p.camYaw);
  if (k.up) { fx += fwdX; fz += fwdZ; }
  if (k.down) { fx -= fwdX; fz -= fwdZ; }
  if (k.left) { fx -= rightX; fz -= rightZ; }
  if (k.right) { fx += rightX; fz += rightZ; }
  const len = Math.hypot(fx, fz);
  p.moving = len > 0;
  if (p.moving) {
    fx /= len; fz /= len;
    const speed = k.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = p.x + fx * speed * dt;
    const nz = p.z + fz * speed * dt;
    const pos = { x: nx, z: nz };
    resolveCircle(world.colliders, pos, 0.55);
    p.x = Math.max(-CITY.bound - 4, Math.min(CITY.oceanX - 3, pos.x));
    p.z = Math.max(-CITY.bound - 4, Math.min(CITY.bound + 4, pos.z));
    p.heading = Math.atan2(fx, fz);
    p.walkPhase += dt * speed * 1.6;
  }
  // Jump + gravity (ground is flat, y = 0).
  if (input.pressed.jump && p.grounded) {
    p.vy = PLAYER.jumpSpeed;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.vy -= PLAYER.gravity * dt;
    const y = p.mesh.position.y + p.vy * dt;
    if (y <= 0) {
      p.mesh.position.y = 0;
      p.vy = 0;
      p.grounded = true;
    } else {
      p.mesh.position.y = y;
    }
  }
  // Walk-cycle limbs.
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const u = p.mesh.userData;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = swing * 0.8;
  p.mesh.position.x = p.x;
  p.mesh.position.z = p.z;
  p.mesh.rotation.y = p.heading;

  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const need = COMBAT.pistolAmmo - p.ammo;
      const take = Math.min(need, p.reserve);
      p.ammo += take;
      p.reserve -= take;
    }
  }
}

// Driving step: hand the input to the car physics.
export function stepDriving(car, input, dt, world) {
  const k = input.keys;
  driveCar(car, { up: !!k.up, down: !!k.down, left: !!k.left, right: !!k.right }, dt, world);
  return car;
}

// Third-person camera: behind the player on foot, chase cam in a car.
export function updateCamera(camera, p, car, dt, world) {
  const target = car || null;
  let cx, cy, cz, tx, ty, tz;
  if (target) {
    const back = 11.5, up = 4.6;
    const hx = Math.sin(target.heading), hz = Math.cos(target.heading);
    cx = target.x - hx * back;
    cz = target.z - hz * back;
    cy = up;
    tx = target.x + hx * 6;
    ty = 1.2;
    tz = target.z + hz * 6;
    // Keep the chase camera out of buildings.
    const pos = { x: cx, z: cz };
    resolveCircle(world.colliders, pos, 0.6);
    cx = pos.x; cz = pos.z;
  } else {
    const dist = 7.5;
    const cp = p.camPitch;
    cx = p.x - Math.sin(p.camYaw) * Math.cos(cp) * dist;
    cz = p.z - Math.cos(p.camYaw) * Math.cos(cp) * dist;
    cy = 1.8 + Math.sin(cp) * dist;
    tx = p.x;
    ty = 1.5;
    tz = p.z;
    const pos = { x: cx, z: cz };
    resolveCircle(world.colliders, pos, 0.6);
    cx = pos.x; cz = pos.z;
    cy = Math.max(cy, 1.2);
  }
  const snap = 1 - Math.exp(-dt * 14);
  camera.position.x += (cx - camera.position.x) * snap;
  camera.position.y += (cy - camera.position.y) * snap;
  camera.position.z += (cz - camera.position.z) * snap;
  camera.lookAt(tx, ty, tz);
}

// Find the nearest stealable car within reach of the player.
export function nearestCar(cars, x, z, maxD) {
  let best = null;
  let bestD = maxD * maxD;
  for (const c of cars) {
    if (c.isPlayer) continue;
    const d = dist2(c.x, c.z, x, z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
