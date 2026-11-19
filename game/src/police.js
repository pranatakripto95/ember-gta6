// Ember Vice — police.js
// One job: the wanted system and the police who answer it. Heat rises with
// crimes and cools when no cop can see the player; stars set how many police
// cars and foot cops hunt the player, and a foot cop who stays close long
// enough makes the arrest.

import * as THREE from 'three';
import { WANTED, COMBAT, CITY } from './config.js';
import { createVehicle } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';
import { clamp, dist2 } from './config.js';
import { resolveCircle } from './city.js';

export function starsFromHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.stars.length; i += 1) {
    if (heat >= WANTED.stars[i]) stars = i;
  }
  return Math.min(stars, WANTED.maxStars);
}

export function createPolice(scene, rng) {
  let heat = 0;
  let stars = 0;
  let bustTimer = 0;
  let hiddenTimer = 0;
  const copCars = [];
  const footCops = [];

  function addCrime(amount, world) {
    heat = Math.min(320, heat + amount);
    const next = starsFromHeat(heat);
    if (next > stars && world && world.onWantedUp) world.onWantedUp(next);
    stars = next;
  }

  function spawnCopCar(world, nearX, nearZ) {
    const v = createVehicle(scene, {
      kind: 'police', color: 0xe8e8e8,
      x: nearX + (Math.random() - 0.5) * 40,
      z: nearZ + (Math.random() - 0.5) * 40,
      heading: Math.random() * Math.PI * 2,
      rng,
    });
    v.isPolice = true;
    v.chaseSpeed = 30 + stars * 1.5;
    copCars.push(v);
    world.cars.push(v);
    return v;
  }

  function spawnFootCop(world, nearX, nearZ) {
    const mesh = makePedMesh(0x1a2a4a, 0x1a2a4a, 0xc98d64);
    // Police cap: a dark box on the head.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), new THREE.MeshLambertMaterial({ color: 0x101828 }));
    cap.position.y = 1.82;
    mesh.add(cap);
    mesh.position.set(nearX + (Math.random() - 0.5) * 30, 0, nearZ + (Math.random() - 0.5) * 30);
    scene.add(mesh);
    const cop = { mesh, x: mesh.position.x, z: mesh.position.z, heading: 0, speed: 4.6, health: COMBAT.copHealth, walkPhase: 0 };
    footCops.push(cop);
    return cop;
  }

  function removeCopCar(world, v) {
    scene.remove(v.mesh);
    const i = copCars.indexOf(v);
    if (i >= 0) copCars.splice(i, 1);
    const j = world.cars.indexOf(v);
    if (j >= 0) world.cars.splice(j, 1);
  }

  function removeFootCop(cop) {
    scene.remove(cop.mesh);
    const i = footCops.indexOf(cop);
    if (i >= 0) footCops.splice(i, 1);
  }

  // Keep the deployed force matched to the wanted level.
  function syncForce(world, px, pz) {
    const wantCars = WANTED.copCars[stars];
    const wantFoot = WANTED.footCops[stars];
    while (copCars.length < wantCars) spawnCopCar(world, px, pz);
    while (copCars.length > wantCars) removeCopCar(world, copCars[copCars.length - 1]);
    while (footCops.length < wantFoot) spawnFootCop(world, px, pz);
    while (footCops.length > wantFoot) removeFootCop(footCops[footCops.length - 1]);
  }

  function update(dt, world) {
    const px = world.player.x, pz = world.player.z;
    const playerSpeed = world.playerCar ? Math.abs(world.playerCar.speed) : 0;
    const playerMoving = world.playerCar ? playerSpeed > 1 : world.player.moving;

    // Heat cools only while no police unit can see the player.
    let seen = false;
    for (const c of copCars) if (dist2(c.x, c.z, px, pz) < WANTED.sightRange * WANTED.sightRange) seen = true;
    for (const c of footCops) if (dist2(c.x, c.z, px, pz) < 45 * 45) seen = true;
    if (!seen && stars > 0) {
      hiddenTimer += dt;
      heat -= WANTED.decayHiddenPerSec * dt;
    } else {
      hiddenTimer = 0;
      if (stars > 0) heat -= WANTED.decayPerSec * dt * 0.25;
    }
    if (heat < 0) heat = 0;
    const next = starsFromHeat(heat);
    if (next !== stars) {
      stars = next;
      if (stars === 0 && world.onWantedClear) world.onWantedClear();
    }
    if (stars === 0 && copCars.length === 0 && footCops.length === 0) return;

    syncForce(world, px, pz);

    // Police cars chase: steer toward the player, ram on contact.
    for (const v of copCars) {
      const dx = px - v.x, dz = pz - v.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - v.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
      const target = d > 6 ? v.chaseSpeed : v.chaseSpeed * 0.6;
      v.speed += (target - v.speed) * Math.min(1, 2 * dt);
      v.x += Math.sin(v.heading) * v.speed * dt;
      v.z += Math.cos(v.heading) * v.speed * dt;
      // Building bump: stop and turn away.
      const before = { x: v.x, z: v.z };
      if (resolveCircle(world.colliders, before, 1.6)) {
        v.x = before.x; v.z = before.z;
        v.heading += Math.PI * 0.5;
        v.speed *= 0.4;
      }
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
      const wheels = v.mesh.userData.wheels;
      for (const w of wheels) w.rotation.z -= (v.speed * dt) / 0.38;
      // Flash the light bar.
      v.flash += dt;
      const on = Math.floor(v.flash * 4) % 2 === 0;
      if (v.mesh.userData.lightRed) v.mesh.userData.lightRed.material.color.setHex(on ? 0xff2222 : 0x551111);
      if (v.mesh.userData.lightBlue) v.mesh.userData.lightBlue.material.color.setHex(on ? 0x111155 : 0x2244ff);
      // Ram the player's car: a nudge only while the cop is closing in.
      if (world.playerCar && d < 4.2 && v.speed > world.playerCar.speed) {
        world.playerCar.speed *= 0.95;
        if (Math.abs(world.playerCar.speed) > 10 && world.onCrash) world.onCrash(6);
      }
    }

    // Foot cops run at the player; close contact starts the arrest clock.
    let closest = Infinity;
    for (const cop of footCops) {
      const dx = px - cop.x, dz = pz - cop.z;
      const d = Math.hypot(dx, dz);
      closest = Math.min(closest, d);
      const wantHeading = Math.atan2(dx, dz);
      cop.heading = wantHeading;
      const speed = d > 3 ? cop.speed : 0;
      cop.x += Math.sin(cop.heading) * speed * dt;
      cop.z += Math.cos(cop.heading) * speed * dt;
      cop.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      const u = cop.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      // A cop who catches the player on foot makes the arrest.
      if (!world.playerCar && d < WANTED.bustRadius) {
        bustTimer += dt;
        if (bustTimer >= WANTED.bustTime && world.onBusted) world.onBusted();
      }
    }
    if (closest > WANTED.bustRadius + 0.5) bustTimer = Math.max(0, bustTimer - dt * 2);
    // In a car, foot cops cannot arrest; they only chase on foot.
    if (world.playerCar) bustTimer = 0;
  }

  return {
    get heat() { return heat; },
    get stars() { return stars; },
    get hiddenTimer() { return hiddenTimer; },
    get copCars() { return copCars; },
    get footCops() { return footCops; },
    addCrime,
    update,
    // Test / screenshot hooks.
    setHeat(h, world) { heat = h; stars = starsFromHeat(h); if (world) syncForce(world, world.player.x, world.player.z); },
    clear(world) {
      heat = 0; stars = 0; bustTimer = 0;
      while (copCars.length) removeCopCar(world, copCars[0]);
      while (footCops.length) removeFootCop(footCops[0]);
    },
  };
}
