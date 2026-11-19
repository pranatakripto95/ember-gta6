// Ember Vice — vehicles.js
// One job: cars. The low-poly car mesh, arcade driving physics for the
// player's car, the traffic system that drives the streets, and the parked
// cars waiting to be stolen.

import * as THREE from 'three';
import { CAR, CITY, TRAFFIC } from './config.js';
import { range, rangeInt, pick, chance } from './random.js';
import { resolveCircle } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8e4d8, 0x2a2a2e, 0xd8b13c, 0x3f7a4d, 0x7a4a8e, 0xc2702e];

// ---- Mesh -------------------------------------------------------------------
export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const bodyLen = kind === 'van' ? 4.6 : 4.2;
  const bodyH = kind === 'sport' ? 0.62 : 0.78;

  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, bodyH, 1.9), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(kind === 'van' ? 3.6 : 2.1, 0.62, 1.7), glass);
  cabin.position.set(kind === 'van' ? 0.2 : -0.25, bodyH + 0.55, 0);
  cabin.castShadow = true;
  group.add(cabin);

  // Headlights and taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const side of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.3), lightMat);
    hl.position.set(bodyLen / 2 + 0.02, 0.68, side);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.3), tailMat);
    tl.position.set(-bodyLen / 2 - 0.02, 0.68, side);
    group.add(tl);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  if (kind === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 1.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    barBase.position.set(-0.2, bodyH + 0.95, 0);
    group.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.2, bodyH + 1.0, 0.38);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.6), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(-0.2, bodyH + 1.0, -0.38);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    sign.position.set(-0.25, bodyH + 0.95, 0);
    group.add(sign);
  }

  group.userData.wheels = wheels;
  group.userData.bodyLen = bodyLen;
  return group;
}

// ---- One vehicle --------------------------------------------------------------
export function createVehicle(scene, opts) {
  const kind = opts.kind || 'sedan';
  const mesh = makeCarMesh(opts.color ?? pick(opts.rng || Math.random, CAR_COLORS), kind);
  mesh.position.set(opts.x || 0, 0, opts.z || 0);
  mesh.rotation.y = opts.heading || 0;
  scene.add(mesh);
  return {
    mesh,
    kind,
    x: opts.x || 0,
    z: opts.z || 0,
    heading: opts.heading || 0,
    speed: 0,
    steer: 0,
    parked: !!opts.parked,
    isPlayer: false,
    isPolice: kind === 'police',
    isTarget: !!opts.isTarget,   // the red Comet GT of mission 3
    driver: opts.driver !== false, // traffic cars carry a driver who flees
    radius: 2.1,
    flash: 0,
  };
}

function carForward(v) { return { x: Math.sin(v.heading), z: Math.cos(v.heading) }; }

// Arcade driving: accelerate, steer, collide with buildings and the city edge.
export function driveCar(v, input, dt, world) {
  const fwd = carForward(v);
  if (input.up) v.speed += CAR.accel * dt;
  if (input.down) {
    if (v.speed > 0.5) v.speed -= CAR.brake * dt;
    else v.speed -= CAR.reverseAccel * dt;
  }
  if (!input.up && !input.down) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 8 * dt);
  v.speed -= v.speed * CAR.drag * dt * 0.4;
  v.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, v.speed));

  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerMax = CAR.steerMax * (1 - Math.min(Math.abs(v.speed) / CAR.maxSpeed, 0.75) * 0.55);
  const steerGoal = steerTarget * steerMax;
  v.steer += (steerGoal - v.steer) * Math.min(1, 10 * dt);
  if (Math.abs(v.speed) > 0.2) {
    v.heading += (v.speed / 2.9) * Math.tan(v.steer) * dt;
  }

  const nx = v.x + Math.sin(v.heading) * v.speed * dt;
  const nz = v.z + Math.cos(v.heading) * v.speed * dt;
  // Stay inside the city and out of the ocean.
  v.x = Math.max(-CITY.bound - 4, Math.min(CITY.oceanX - 3, nx));
  v.z = Math.max(-CITY.bound - 4, Math.min(CITY.bound + 4, nz));

  // Building collision: resolve the car's centre circle out of every
  // building it overlaps, so the car slides along walls instead of sticking.
  const centre = { x: v.x, z: v.z };
  if (resolveCircle(world.colliders, centre, 1.9)) {
    if (Math.abs(v.speed) > 6) world.onCrash && world.onCrash(Math.abs(v.speed));
    v.speed *= 0.45;
    v.x = centre.x;
    v.z = centre.z;
  }

  // Car-to-car bumps with traffic and police.
  for (const other of world.cars) {
    if (other === v || other.parked) continue;
    const dx = v.x - other.x, dz = v.z - other.z;
    const d2 = dx * dx + dz * dz;
    const min = v.radius + other.radius - 0.6;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      v.x += (dx / d) * push;
      v.z += (dz / d) * push;
      other.x -= (dx / d) * push;
      other.z -= (dz / d) * push;
      if (Math.abs(v.speed) > 8) world.onCrash && world.onCrash(Math.abs(v.speed) * 0.5);
      v.speed *= 0.7;
      other.speed *= 0.7;
    }
  }

  v.mesh.position.set(v.x, 0, v.z);
  v.mesh.rotation.y = v.heading;
  // Spin the wheels; steer the front pair.
  const wheels = v.mesh.userData.wheels;
  for (let i = 0; i < wheels.length; i += 1) {
    wheels[i].rotation.z -= (v.speed * dt) / 0.38;
    if (i < 2) wheels[i].rotation.y = -v.steer * 0.9;
  }
  return fwd;
}

// ---- Traffic ------------------------------------------------------------------
export function createTraffic(scene, rng, world) {
  const cars = [];
  const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'van'];
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const axis = chance(rng, 0.5) ? 'x' : 'z';
    const line = pick(rng, CITY.streets);
    const dir = chance(rng, 0.5) ? 1 : -1;
    const along = range(rng, -200, 200);
    const v = createVehicle(scene, {
      kind: pick(rng, kinds),
      color: pick(rng, CAR_COLORS),
      x: axis === 'x' ? along : line + dir * 2.8,
      z: axis === 'x' ? line + dir * 2.8 : along,
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      rng,
    });
    v.traffic = { axis, line, dir, speed: range(rng, TRAFFIC.speedMin, TRAFFIC.speedMax), pause: 0 };
    v.speed = v.traffic.speed;
    cars.push(v);
  }
  // Parked cars along the kerbs, stealable.
  const parked = [];
  for (let i = 0; i < TRAFFIC.parked; i += 1) {
    const line = pick(rng, CITY.streets);
    const along = range(rng, -190, 190);
    const side = chance(rng, 0.5) ? 1 : -1;
    const horizontal = chance(rng, 0.5);
    const v = createVehicle(scene, {
      kind: pick(rng, ['sedan', 'sedan', 'sport']),
      color: pick(rng, CAR_COLORS),
      x: horizontal ? along : line + side * 8.6,
      z: horizontal ? line + side * 8.6 : along,
      heading: horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      parked: true,
      rng,
    });
    parked.push(v);
    cars.push(v);
  }
  // The red Comet GT for mission 3, parked by the bank.
  const comet = createVehicle(scene, {
    kind: 'sport', color: 0xc2131a,
    x: 66, z: 8, heading: Math.PI / 2, parked: true, isTarget: true, rng,
  });
  parked.push(comet);
  cars.push(comet);

  function turnAtIntersection(t) {
    const near = CITY.streets.find((s) => Math.abs(t.pos - s) < 4);
    if (near === undefined) return;
    if (!chance(rng, 0.35)) return;
    t.axis = t.axis === 'x' ? 'z' : 'x';
    t.line = near;
    t.dir = chance(rng, 0.5) ? 1 : -1;
  }

  function update(dt, playerCar) {
    for (const v of cars) {
      if (!v.traffic) continue;
      const t = v.traffic;
      if (t.pause > 0) { t.pause -= dt; continue; }
      // Slow for the car ahead in the same lane, and for the player's car.
      let want = t.speed;
      for (const other of cars) {
        if (other === v || !other.traffic) continue;
        const o = other.traffic;
        if (o.axis !== t.axis || o.line !== t.line || o.dir !== t.dir) continue;
        const gap = (t.axis === 'x' ? (other.x - v.x) * t.dir : (other.z - v.z) * t.dir);
        if (gap > 0 && gap < 10) want = Math.min(want, Math.max(0, o.speed - 1));
      }
      if (playerCar) {
        const dx = playerCar.x - v.x, dz = playerCar.z - v.z;
        const d = Math.hypot(dx, dz);
        if (d < 12) want = Math.min(want, 4);
      }
      v.speed += (want - v.speed) * Math.min(1, 3 * dt);
      const step = v.speed * t.dir * dt;
      let pos = t.axis === 'x' ? v.x + step : v.z + step;
      if (pos > CITY.bound) pos = -CITY.bound;
      if (pos < -CITY.bound) pos = CITY.bound;
      t.pos = pos;
      if (t.axis === 'x') { v.x = pos; v.z = t.line + t.dir * 2.8; }
      else { v.z = pos; v.x = t.line + t.dir * 2.8; }
      v.heading = t.axis === 'x' ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
      turnAtIntersection(t);
      // Occasional pause at an intersection, like waiting at a light.
      const near = CITY.streets.find((s) => Math.abs(t.pos - s) < 3);
      if (near !== undefined && chance(rng, dt * 0.12)) t.pause = range(rng, 1, 2.5);
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
      const wheels = v.mesh.userData.wheels;
      for (const w of wheels) w.rotation.z -= (v.speed * dt) / 0.38;
    }
  }

  return { cars, parked, comet, update };
}
