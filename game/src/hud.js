// Ember Vice — hud.js
// One job: everything the player reads — the DOM HUD (cash, health, wanted
// stars, speed, ammo, objective, messages, timer) and the live minimap
// canvas that draws the city, the player, the cops and the mission marker.

import { CITY, fmtCash, fmtTime } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  const el = {};
  for (const id of ['cash', 'health-fill', 'health-text', 'stars', 'speed', 'ammo', 'objective', 'message', 'timer', 'hint', 'crosshair', 'wanted-label']) {
    el[id] = document.getElementById(id);
  }
  const map = document.getElementById('minimap');
  const mctx = map.getContext('2d');
  const MAP = 180; // canvas pixels
  const SCALE = MAP / (CITY.size + 40);

  let messageTimer = 0;
  let lastObjective = '';

  function toMap(x, z) {
    return [(x + CITY.size / 2 + 20) * SCALE, (z + CITY.size / 2 + 20) * SCALE];
  }

  function drawMinimap(world) {
    const g = mctx;
    g.clearRect(0, 0, MAP, MAP);
    g.fillStyle = 'rgba(12,16,22,0.85)';
    g.fillRect(0, 0, MAP, MAP);
    // Ocean.
    const [ox] = toMap(CITY.oceanX, 0);
    g.fillStyle = '#1d6f8f';
    g.fillRect(ox, 0, MAP - ox, MAP);
    // Beach.
    const [bx] = toMap(CITY.beachX, 0);
    g.fillStyle = '#c9a86a';
    g.fillRect(bx, 0, ox - bx, MAP);
    // Roads.
    g.strokeStyle = '#5a6068';
    g.lineWidth = 3;
    for (const s of CITY.streets) {
      const [sx] = toMap(s, 0);
      const [, sz] = toMap(0, s);
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, MAP); g.stroke();
      g.beginPath(); g.moveTo(0, sz); g.lineTo(MAP, sz); g.stroke();
    }
    // Buildings.
    g.fillStyle = '#3a3f47';
    for (const b of world.colliders) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      g.fillRect(x1, z1, Math.max(1.5, x2 - x1), Math.max(1.5, z2 - z1));
    }
    // Mission marker.
    const target = world.missionTarget && world.missionTarget();
    if (target) {
      const [mx, mz] = toMap(target.x, target.z);
      g.fillStyle = '#ffc21f';
      g.beginPath(); g.arc(mx, mz, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffc21f';
      g.beginPath(); g.arc(mx, mz, 8 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); g.stroke();
    }
    // Traffic dots.
    g.fillStyle = '#c8cdd4';
    for (const c of world.cars) {
      if (c.parked || c.isPlayer) continue;
      const [cx, cz] = toMap(c.x, c.z);
      g.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    // Police dots (blue, flashing).
    if (Math.floor(performance.now() / 400) % 2 === 0) g.fillStyle = '#3a86ff';
    else g.fillStyle = '#ff3a3a';
    for (const c of world.policeCopCars || []) {
      const [cx, cz] = toMap(c.x, c.z);
      g.beginPath(); g.arc(cx, cz, 3.5, 0, Math.PI * 2); g.fill();
    }
    // Player arrow.
    const [px, pz] = toMap(world.player.x, world.player.z);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.atan2(Math.sin(world.player.heading), Math.cos(world.player.heading)) * 0 + world.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.restore();
    // North tick.
    g.fillStyle = '#ffffff';
    g.font = 'bold 11px system-ui, sans-serif';
    g.fillText('N', MAP - 12, 12);
  }

  return {
    setObjective(text) {
      if (text === lastObjective) return;
      lastObjective = text;
      el.objective.textContent = text;
    },
    setTimer(sec) {
      if (sec === null || sec === undefined) { el.timer.textContent = ''; return; }
      el.timer.textContent = '⏱ ' + fmtTime(Math.max(0, sec));
      el.timer.style.color = sec < 30 ? '#ff5a4e' : '#ffd21f';
    },
    say(text, seconds) {
      el.message.textContent = text;
      el.message.style.opacity = '1';
      messageTimer = seconds || 4;
    },
    setHint(text) { el.hint.textContent = text || ''; },
    showCrosshair(on) { el.crosshair.style.display = on ? 'block' : 'none'; },
    update(dt, world) {
      if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) el.message.style.opacity = '0';
      }
      el.cash.textContent = fmtCash(world.cash);
      const hp = Math.max(0, Math.round(world.player.health));
      el['health-fill'].style.width = hp + '%';
      el['health-fill'].style.background = hp > 50 ? '#3fce6b' : hp > 25 ? '#ffc21f' : '#ff5a4e';
      el['health-text'].textContent = 'HP ' + hp;
      const stars = world.police ? world.police.stars : 0;
      let starText = '';
      for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
      el.stars.textContent = starText;
      el.stars.style.color = stars >= 3 ? '#ff5a4e' : '#ffd21f';
      el['wanted-label'].textContent = stars > 0
        ? (world.police.hiddenTimer > 2 ? 'HIDDEN — stay out of sight' : 'WANTED')
        : '';
      const car = world.playerCar;
      if (car) {
        const kmh = Math.round(Math.abs(car.speed) * 3.6);
        el.speed.textContent = kmh + ' km/h';
        el.speed.style.display = 'block';
        el.ammo.textContent = '';
      } else {
        el.speed.style.display = 'none';
        el.ammo.textContent = world.player.reloading > 0
          ? 'RELOADING…'
          : '🔫 ' + world.player.ammo + ' / ' + world.player.reserve;
      }
      drawMinimap(world);
    },
  };
}
