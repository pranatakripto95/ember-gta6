// Ember Vice — missions.js
// One job: the story. Five missions in a chain, each with a target marker,
// a timer where the story needs one, and rewards. The system owns the
// mission state machine; main.js owns the player and the world it acts on.

import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { fmtCash } from './config.js';

export function createMissions(scene) {
  let index = 0;              // next mission to start
  let active = null;          // { def, stage, timer, enemiesLeft }
  let completed = 0;
  let allDone = false;

  // The gold waypoint ring + floating beacon column.
  const ringGeo = new THREE.TorusGeometry(2.2, 0.18, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc21f });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 40, 10, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.visible = false;
  scene.add(beam);

  function currentDef() { return MISSIONS[index] || null; }

  function start(world) {
    const def = currentDef();
    if (!def) { allDone = true; return null; }
    active = { def, stage: 'go', timer: def.timeLimit || 0, enemiesLeft: def.enemies || 0 };
    if (def.type === 'eliminate') {
      world.spawnMissionEnemies(def);
    }
    if (def.type === 'steal-deliver') {
      world.markTargetCar();
    }
    world.say(def.intro, 6);
    world.hud.setObjective(def.title + ' — ' + def.brief);
    showMarker(targetPos());
    return active;
  }

  function targetPos() {
    if (!active) return null;
    const def = active.def;
    if (active.stage === 'deliver' && def.target) return def.target;
    if (active.stage === 'escape' && def.escape) return def.escape;
    if (active.stage === 'pickup' && def.pickup) return def.pickup;
    if (def.type === 'steal-deliver' && active.stage === 'go') return def.carSpot;
    return def.target || def.pickup || null;
  }

  // Where the next mission begins (walk into this marker to start it).
  function startPos() {
    const def = currentDef();
    if (!def) return null;
    if (def.type === 'pickup-deliver') return def.pickup;
    if (def.type === 'steal-deliver') return def.carSpot;
    return def.target || def.pickup || null;
  }

  function showMarker(pos) {
    if (!pos) { ring.visible = false; beam.visible = false; return; }
    ring.visible = true;
    beam.visible = true;
    ring.position.set(pos.x, 0.25, pos.z);
    beam.position.set(pos.x, 20, pos.z);
  }

  function hideMarker() { ring.visible = false; beam.visible = false; }

  function complete(world) {
    const def = active.def;
    world.cash += def.reward;
    world.say(def.outro + '  +' + fmtCash(def.reward), 6);
    world.audio.cash();
    world.audio.missionDone();
    completed += 1;
    index += 1;
    active = null;
    hideMarker();
    world.hud.setObjective(completed >= MISSIONS.length
      ? 'Story complete — Solmar is yours. Free roam, collect stashes, cause chaos.'
      : 'Job done. The next gold ring marks where the story continues.');
    if (index >= MISSIONS.length) {
      allDone = true;
      world.hud.setObjective('STORY COMPLETE — Solmar is yours. Free roam!');
    }
    world.saveGame();
  }

  function fail(world, reason) {
    world.say(reason, 5);
    active = null;
    hideMarker();
    world.hud.setObjective('Job failed. Drive back to the gold ring to try again.');
    // Retry: the same mission starts again when the player reaches its start.
    world.missionRetryAt = targetPos();
  }

  // Called every frame while a mission is active. Returns nothing; talks to
  // the world through the callbacks main.js provides.
  function update(dt, world) {
    if (!active) {
      // Idle: show the next mission's start marker so the player can walk in.
      const def = currentDef();
      if (def && !allDone) showMarker(startPos());
      return;
    }
    const def = active.def;
    const px = world.player.x, pz = world.player.z;
    const inCar = !!world.playerCar;
    const target = targetPos();
    if (target) showMarker(target);
    ring.rotation.z += dt * 0.8;

    if (def.timeLimit && active.stage !== 'done') {
      active.timer -= dt;
      world.hud.setTimer(active.timer);
      if (active.timer <= 0) {
        fail(world, 'Too slow — the job fell through. Try again.');
        return;
      }
    } else {
      world.hud.setTimer(null);
    }

    const near = (pos, r) => {
      const dx = px - pos.x, dz = pz - pos.z;
      return dx * dx + dz * dz < r * r;
    };

    switch (def.type) {
      case 'goto':
        if (target && near(target, def.radius) && !inCar) complete(world);
        break;
      case 'pickup-deliver':
        if (active.stage === 'go' && def.pickup && near(def.pickup, def.radius)) {
          active.stage = 'deliver';
          world.say('Package secured. Now the motel — fast.', 4);
          world.audio.pickup();
        } else if (active.stage === 'deliver' && near(def.target, def.radius)) {
          complete(world);
        }
        break;
      case 'steal-deliver': {
        const gotCar = world.playerCar && world.playerCar.isTarget;
        if (active.stage === 'go' && gotCar) {
          active.stage = 'deliver';
          world.say('The Comet is yours. Get it to Vega Garage.', 4);
        } else if (active.stage === 'deliver' && gotCar && near(def.target, def.radius)) {
          complete(world);
        }
        break;
      }
      case 'eliminate':
        if (active.enemiesLeft <= 0) complete(world);
        break;
      case 'rob-escape':
        if (active.stage === 'go' && near(def.target, def.radius) && !inCar) {
          active.stage = 'escape';
          world.say('Cash grabbed! Lose the cops and reach the safehouse!', 5);
          world.audio.cash();
          world.police.addCrime(120, world);
        } else if (active.stage === 'escape' && near(def.escape, def.radius)) {
          if (world.police.stars <= 1) complete(world);
          else world.hud.setObjective('Lose the cops first — wanted level must drop to 1 star or less!');
        }
        break;
      default:
        break;
    }
  }

  // The player walked into the idle start marker: begin the mission.
  function tryStart(world) {
    if (active || allDone) return false;
    const def = currentDef();
    if (!def) return false;
    const pos = startPos();
    if (!pos) return false;
    const dx = world.player.x - pos.x, dz = world.player.z - pos.z;
    if (dx * dx + dz * dz < (def.radius + 2) * (def.radius + 2)) {
      start(world);
      return true;
    }
    return false;
  }

  function onEnemyKilled() {
    if (active && active.def.type === 'eliminate') active.enemiesLeft -= 1;
  }

  return {
    get index() { return index; },
    get completed() { return completed; },
    get allDone() { return allDone; },
    get active() { return active; },
    start, update, tryStart, complete, fail, onEnemyKilled, targetPos, startPos,
    // Save / load.
    serialize() { return { index, completed, allDone }; },
    restore(data) {
      if (!data) return;
      index = data.index || 0;
      completed = data.completed || 0;
      allDone = !!data.allDone;
    },
  };
}
