// Ember Vice — main.js
// One job: wire everything together. Boots the three.js renderer, owns the
// game object every system talks through, runs the fixed-step loop, the
// menu / pause / busted / wasted screens, and the ?shot= screenshot mode.
//
// ?seed=N fixes the city. ?shot=drive|street|chase|marina (with &seed=N)
// stages that scene, plays it forward a few seconds and sets
// window.__shotReady for a screenshot.

import * as THREE from 'three';
import { CITY, COLOURS, PLAYER, COMBAT, WANTED, MISSIONS, fmtCash } from './config.js';
import { makeRng } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave, clearSave, hasSave } from './save.js';
import { buildCity, resolveCircle, pointInAnyCollider } from './city.js';
import { createTraffic, driveCar, createVehicle } from './vehicles.js';
import { createPeds } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat, stepEnemy } from './combat.js';
import { createMissions } from './missions.js';
import { createPlayer, stepOnFoot, stepDriving, updateCamera, nearestCar } from './player.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const rng = makeRng(seed);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

// ---- Renderer / scene ---------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLOURS.fog, 130, 460);

// Golden-hour sky dome: a gradient canvas on the inside of a big sphere.
{
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f6fb2');
  grad.addColorStop(0.55, '#e8a06a');
  grad.addColorStop(0.75, '#ffc98a');
  grad.addColorStop(1, '#f2b27d');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
}

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-40, 12, -30);

const sun = new THREE.DirectionalLight(COLOURS.sun, COLOURS.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(COLOURS.hemiSky, COLOURS.hemiGround, 1.5);
scene.add(hemi);
// Soft warm fill so the shadow sides of buildings never go black.
const fill = new THREE.AmbientLight(0xffe0b8, 0.4);
scene.add(fill);
const SUN_DIR = new THREE.Vector3(-0.62, 0.5, 0.35).normalize();

// ---- World --------------------------------------------------------------------
const city = buildCity(scene, rng);
const traffic = createTraffic(scene, rng, null);
const peds = createPeds(scene, rng, city.colliders);
const police = createPolice(scene, rng);
const combat = createCombat(scene, rng);
const missions = createMissions(scene);
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);
const player = createPlayer(scene, PLAYER.startPos.x, PLAYER.startPos.z);

// The game object every system talks through.
const g = {
  scene, camera, renderer, rng,
  colliders: city.colliders,
  cars: traffic.cars,
  player, playerCar: null,
  traffic, peds, police, combat, missions, hud, audio,
  cash: PLAYER.startCash,
  screen: 'menu',
  lastDamageAt: -100,
  lastShot: null,
  saveTimer: 0,
  elapsed: 0,
  cometBeacon: null,
  missionRetryAt: null,

  say(text, seconds) { hud.say(text, seconds); statusEl.textContent = text; },
  missionTarget() {
    if (missions.active) return missions.targetPos();
    if (!missions.allDone) return missions.startPos();
    return null;
  },
  get policeCopCars() { return police.copCars; },

  onCrash(speed) {
    audio.crash();
    if (speed > 24) g.damagePlayer(4);
  },
  onWantedUp(stars) {
    hud.say(stars >= 3 ? 'The whole Solmar PD is after you!' : 'The cops are onto you — lose them!', 4);
  },
  onWantedClear() { hud.say('You lost them. For now.', 4); },
  onBusted() { endRun('BUSTED', 'The Solmar PD took you in.'); },
  damagePlayer(amount) {
    if (g.screen !== 'playing') return;
    player.health -= amount;
    g.lastDamageAt = g.elapsed;
    if (player.health <= 0) {
      player.health = 0;
      endRun('WASTED', 'Dario is down. Solmar General patches him up — for a fee.');
    }
  },

  setPlayerPos(x, z, heading) {
    player.x = x; player.z = z;
    player.heading = heading;
    player.camYaw = heading;
    player.mesh.position.set(x, 0, z);
    player.mesh.rotation.y = heading;
  },
  nearestParkedCar(x, z) {
    let best = null, bestD = Infinity;
    for (const c of traffic.parked) {
      const dx = c.x - x, dz = c.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  },
  putPlayerInCar(car) {
    if (g.playerCar) return;
    car.isPlayer = true;
    car.parked = false;
    car.traffic = null;
    car.driver = false;
    g.playerCar = car;
    player.mesh.visible = false;
  },
  exitCar() {
    const car = g.playerCar;
    if (!car) return;
    car.isPlayer = false;
    car.speed *= 0.25;
    g.playerCar = null;
    const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
    g.setPlayerPos(car.x + sideX * 2.6, car.z + sideZ * 2.6, car.heading);
    player.mesh.visible = true;
  },
  spawnMissionEnemies(def) {
    combat.clearEnemies();
    const base = def.target;
    const spots = [[-8, -6], [6, -10], [10, 6], [-4, 10]];
    for (const [dx, dz] of spots) {
      const e = combat.spawnEnemy(base.x + dx, base.z + dz);
      e.shootTimer = 1 + Math.random() * 2;
    }
  },
  markTargetCar() {
    if (g.cometBeacon) return;
    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 1.8, 4),
      new THREE.MeshBasicMaterial({ color: 0xffc21f }),
    );
    beacon.rotation.x = Math.PI;
    scene.add(beacon);
    g.cometBeacon = beacon;
  },
  saveGame() {
    writeSave({
      cash: g.cash,
      mission: missions.serialize(),
      taken: city.collectibleSpots.map((c) => c.taken),
      player: { x: player.x, z: player.z, health: player.health },
      ammo: player.ammo, reserve: player.reserve,
    });
  },
  loadGame(data) {
    if (!data) return;
    g.cash = data.cash ?? PLAYER.startCash;
    missions.restore(data.mission);
    if (Array.isArray(data.taken)) {
      data.taken.forEach((t, i) => {
        if (t && city.collectibleSpots[i]) {
          city.collectibleSpots[i].taken = true;
          city.collectibleSpots[i].mesh.visible = false;
        }
      });
    }
    if (data.player) {
      g.setPlayerPos(data.player.x, data.player.z, player.heading);
      player.health = data.player.health ?? PLAYER.health;
    }
    player.ammo = data.ammo ?? COMBAT.pistolAmmo;
    player.reserve = data.reserve ?? COMBAT.pistolReserve;
  },

  // One fixed step of the playing game. `inp` is the input object.
  step(dt, inp) {
    g.elapsed += dt;
    const k = inp.keys;

    // Enter / exit a car.
    if (inp.pressed.enter) {
      if (g.playerCar) {
        g.exitCar();
      } else {
        const car = nearestCar(g.cars, player.x, player.z, 3.6);
        if (car) {
          const copNear = police.copCars.some((c) => {
            const dx = c.x - player.x, dz = c.z - player.z;
            return dx * dx + dz * dz < 60 * 60;
          }) || police.footCops.some((c) => {
            const dx = c.x - player.x, dz = c.z - player.z;
            return dx * dx + dz * dz < 40 * 40;
          });
          police.addCrime(copNear ? WANTED.crimeSteal : WANTED.crimeStealQuiet, g);
          if (car.traffic) {
            g.say(car.driver ? 'Driver bailed! The car is yours.' : 'You jacked the car.', 3);
          } else {
            g.say('You took the car.', 3);
          }
          g.putPlayerInCar(car);
          audio.click();
        }
      }
    }

    if (g.playerCar) {
      stepDriving(g.playerCar, inp, dt, g);
      // Running over pedestrians is a crime.
      for (const p of peds.peds) {
        if (p.fallen > 0 || p.dead) continue;
        const dx = p.x - g.playerCar.x, dz = p.z - g.playerCar.z;
        if (dx * dx + dz * dz < 2.3 * 2.3 && Math.abs(g.playerCar.speed) > 3) {
          peds.knockDown(p, true);
          police.addCrime(WANTED.crimeHitPed, g);
          audio.crash();
          g.say('You hit a pedestrian! The cops saw that.', 3);
        }
      }
    } else {
      stepOnFoot(player, inp, dt, g);
      // Pistol fire: mouse held, aimed where the camera looks.
      if (inp.mouseDown && player.fireCooldown <= 0 && player.reloading <= 0) {
        if (player.ammo > 0) {
          player.ammo -= 1;
          player.fireCooldown = COMBAT.fireInterval;
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          const origin = new THREE.Vector3(player.x, 1.4, player.z);
          const targets = [];
          for (const e of combat.enemies) {
            if (!e.dead) targets.push({ x: e.x, z: e.z, radius: 1.0, health: e.health, kind: 'enemy', ref: e });
          }
          for (const c of police.footCops) {
            targets.push({ x: c.x, z: c.z, radius: 1.0, health: c.health, kind: 'cop', ref: c });
          }
          for (const p of peds.peds) {
            if (p.fallen <= 0) targets.push({ x: p.x, z: p.z, radius: 0.9, health: 100, kind: 'ped', ref: p });
          }
          const hit = combat.shoot(origin, dir, COMBAT.pistolRange, targets, g);
          audio.gunshot();
          police.addCrime(6, g);
          g.lastShot = { x: player.x, z: player.z, at: g.elapsed };
          if (hit) {
            if (hit.kind === 'enemy') {
              hit.ref.health = hit.health;
              if (hit.health <= 0) {
                hit.ref.dead = true;
                hit.ref.mesh.rotation.x = -Math.PI / 2;
                hit.ref.mesh.position.y = 0.35;
                missions.onEnemyKilled();
                g.say('Vulture down.', 2);
              }
            } else if (hit.kind === 'cop') {
              hit.ref.health = hit.health;
              if (hit.health <= 0) {
                police.addCrime(WANTED.crimeKillCop, g);
                const i = police.footCops.indexOf(hit.ref);
                if (i >= 0) police.footCops.splice(i, 1);
                scene.remove(hit.ref.mesh);
                g.say('You shot a cop. That was a mistake.', 3);
              }
            } else if (hit.kind === 'ped') {
              peds.knockDown(hit.ref, false);
              police.addCrime(20, g);
            }
          }
        } else if (player.reserve > 0) {
          player.reloading = COMBAT.reloadTime;
        }
      }
      // Punch.
      if (inp.pressed.punch && player.punchCooldown <= 0) {
        player.punchCooldown = 0.5;
        audio.punch();
        const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
        for (const list of [combat.enemies, police.footCops, peds.peds]) {
          for (const t of list) {
            const dx = t.x - player.x, dz = t.z - player.z;
            const d = Math.hypot(dx, dz);
            if (d < COMBAT.punchRange && dx * fx + dz * fz > 0) {
              if (t.health !== undefined) t.health -= COMBAT.punchDamage;
              if (t.mesh) { /* enemies and cops */ }
              if (list === peds.peds) peds.knockDown(t, false);
            }
          }
        }
      }
      if (inp.pressed.reload && player.reserve > 0 && player.ammo < COMBAT.pistolAmmo && player.reloading <= 0) {
        player.reloading = COMBAT.reloadTime;
      }
    }

    // Traffic, pedestrians, police, combat, missions.
    traffic.update(dt, g.playerCar);
    const danger = g.lastShot && g.elapsed - g.lastShot.at < 3 ? g.lastShot : null;
    peds.update(dt, danger);
    police.update(dt, g);
    combat.update(dt);
    for (const e of combat.enemies) {
      stepEnemy(e, dt, player.x, player.z, (enemy, d) => {
        // A Vulture shoots back: tracer + a chance to hit.
        const from = new THREE.Vector3(enemy.x, 1.4, enemy.z);
        const to = new THREE.Vector3(player.x, 1.3, player.z);
        combat.addTracer(from, to);
        audio.gunshot();
        if (Math.random() < 0.34) g.damagePlayer(7 + Math.random() * 7);
      });
    }
    missions.update(dt, g);
    missions.tryStart(g);

    // Ember stash collectibles.
    for (const c of city.collectibleSpots) {
      if (c.taken) continue;
      const dx = c.x - player.x, dz = c.z - player.z;
      if (dx * dx + dz * dz < 1.8 * 1.8) {
        c.taken = true;
        c.mesh.visible = false;
        g.cash += 250;
        audio.pickup();
        g.say('Ember stash found! +$250', 3);
        g.saveGame();
      }
    }

    // Comet beacon follows the target car.
    if (g.cometBeacon) {
      const comet = traffic.comet;
      g.cometBeacon.position.set(comet.x, 3.2 + Math.sin(g.elapsed * 3) * 0.3, comet.z);
      g.cometBeacon.rotation.y = g.elapsed * 2;
      if (g.playerCar === comet) g.cometBeacon.visible = false;
    }

    // Health slowly recovers out of combat.
    if (g.elapsed - g.lastDamageAt > 8 && player.health > 0 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 3 * dt);
    }

    // Sun follows the player; shadows stay local.
    sun.position.set(player.x + SUN_DIR.x * 160, SUN_DIR.y * 160, player.z + SUN_DIR.z * 160);
    sun.target.position.set(player.x, 0, player.z);
    sun.target.updateMatrixWorld();

    city.update(dt, g.elapsed);
    updateCamera(camera, player, g.playerCar, dt, g);
    hud.update(dt, g);
    audio.update({
      driving: !!g.playerCar,
      speed01: g.playerCar ? Math.abs(g.playerCar.speed) / 42 : 0,
      wanted: police.stars,
    });

    // Periodic autosave.
    g.saveTimer += dt;
    if (g.saveTimer > 25) {
      g.saveTimer = 0;
      g.saveGame();
    }
    inp.endFrame();
  },
};

window.__game = g;

// ---- Screens ------------------------------------------------------------------
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const endEl = document.getElementById('end');
const endTitle = document.getElementById('end-title');
const endText = document.getElementById('end-text');
const btnContinue = document.getElementById('btn-continue');

function showOnly(which) {
  menuEl.style.display = which === 'menu' ? 'flex' : 'none';
  pauseEl.style.display = which === 'pause' ? 'flex' : 'none';
  endEl.style.display = which === 'over' ? 'flex' : 'none';
  document.getElementById('hud').style.display = which === 'playing' ? 'block' : 'none';
}

function startNewGame() {
  clearSave();
  g.cash = PLAYER.startCash;
  g.setPlayerPos(PLAYER.startPos.x, PLAYER.startPos.z, Math.PI * 0.75);
  player.health = PLAYER.health;
  player.ammo = COMBAT.pistolAmmo;
  player.reserve = COMBAT.pistolReserve;
  police.clear(g);
  combat.clearEnemies();
  missions.restore({ index: 0, completed: 0, allDone: false });
  hud.setObjective('Drive to the gold ring — Lena is waiting at The Rusty Anchor.');
  g.screen = 'playing';
  showOnly('playing');
  audio.unlock();
  audio.click();
  g.say('Solmar City. Lena is waiting at The Rusty Anchor — follow the gold ring.', 6);
  statusEl.textContent = 'Playing Ember Vice.';
}

function continueGame() {
  const data = loadSave();
  g.loadGame(data);
  police.clear(g);
  combat.clearEnemies();
  g.screen = 'playing';
  showOnly('playing');
  audio.unlock();
  audio.click();
  hud.setObjective(missions.active ? missions.active.def.brief : 'Follow the gold ring to the next job.');
  g.say('Welcome back to Solmar, Dario.', 4);
}

function endRun(title, text) {
  if (g.screen !== 'playing') return;
  const fine = title === 'BUSTED' ? Math.min(g.cash, 200) : Math.min(g.cash, 150);
  g.cash -= fine;
  g.screen = 'over';
  endTitle.textContent = title;
  endText.textContent = text + ' You lost ' + fmtCash(fine) + '.';
  showOnly('over');
  audio.busted();
  statusEl.textContent = title + '.';
  g.saveGame();
}

function respawn() {
  player.health = PLAYER.health;
  if (g.playerCar) { g.playerCar.isPlayer = false; g.playerCar = null; player.mesh.visible = true; }
  g.setPlayerPos(8, 112, Math.PI); // outside Solmar General Hospital
  police.clear(g);
  g.screen = 'playing';
  showOnly('playing');
  g.say('Patched up and back on the street. The jobs are still waiting.', 4);
}

document.getElementById('btn-new').addEventListener('click', startNewGame);
btnContinue.addEventListener('click', continueGame);
document.getElementById('btn-how').addEventListener('click', () => {
  const how = document.getElementById('howto');
  how.style.display = how.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('btn-resume').addEventListener('click', () => {
  g.screen = 'playing';
  showOnly('playing');
  audio.click();
});
document.getElementById('btn-quit').addEventListener('click', () => {
  g.saveGame();
  g.screen = 'menu';
  showOnly('menu');
  refreshMenu();
});
document.getElementById('btn-retry').addEventListener('click', respawn);

function refreshMenu() {
  btnContinue.style.display = hasSave() ? 'inline-block' : 'none';
  const save = loadSave();
  if (save) {
    document.getElementById('menu-save').textContent =
      'Saved game: ' + fmtCash(save.cash) + ' — ' + (save.mission ? save.mission.completed : 0) + ' of ' + MISSIONS.length + ' jobs done.';
  }
}

// ---- Ambient menu backdrop ----------------------------------------------------
let menuAngle = 0;
function stepAmbient(dt) {
  traffic.update(dt, null);
  peds.update(dt, null);
  city.update(dt, g.elapsed);
  g.elapsed += dt;
  menuAngle += dt * 0.05;
  const cx = 30 + Math.sin(menuAngle) * 70;
  const cz = 30 + Math.cos(menuAngle) * 70;
  camera.position.set(cx, 34, cz);
  camera.lookAt(30, 4, 30);
  sun.position.set(30 + SUN_DIR.x * 160, SUN_DIR.y * 160, 30 + SUN_DIR.z * 160);
  sun.target.position.set(30, 0, 30);
  sun.target.updateMatrixWorld();
}

// ---- Main loop ------------------------------------------------------------------
let accumulator = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  if (input.pressed.mute) {
    const muted = audio.toggleMute();
    g.say(muted ? 'Sound off.' : 'Sound on.', 2);
  }

  if (g.screen === 'playing') {
    if (input.pressed.pause) {
      g.screen = 'paused';
      showOnly('pause');
      g.saveGame();
    } else {
      accumulator += dt;
      while (accumulator >= STEP) {
        g.step(STEP, input);
        accumulator -= STEP;
      }
      if (accumulator > STEP) accumulator = 0;
    }
  } else if (g.screen === 'paused') {
    if (input.pressed.pause || input.pressed.confirm) {
      g.screen = 'playing';
      showOnly('playing');
    }
    input.endFrame();
  } else if (g.screen === 'menu') {
    stepAmbient(dt);
    input.endFrame();
    if (input.pressed.confirm) startNewGame();
  } else if (g.screen === 'over') {
    input.endFrame();
    if (input.pressed.confirm) respawn();
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && g.screen === 'playing') {
    g.screen = 'paused';
    showOnly('pause');
    g.saveGame();
  }
});

// ---- Boot ---------------------------------------------------------------------
if (shotName) {
  // Screenshot mode: hide the menu, pose the scene, play it forward, then
  // render a few frames and signal readiness.
  menuEl.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  g.screen = 'playing';
  hud.setObjective('Ember Vice — Solmar City');
  stageShot(g, shotName);
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  refreshMenu();
  showOnly('menu');
  hud.setObjective('Drive to the gold ring — Lena is waiting at The Rusty Anchor.');
  statusEl.textContent = 'Ember Vice. Press Enter or click New Game to start.';
  requestAnimationFrame(frame);
}
