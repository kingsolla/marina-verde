// Marina Verde — HUD. Updates the DOM overlay (health, money, wanted stars,
// speed, clock, objective, banners, dialogue) and draws the 2D minimap
// canvas: roads, beach, player arrow, cars, police, peds and the mission blip.
import { ROAD_LINES, ROAD_MIN, ROAD_MAX, BEACH_Z, SEA_Z } from './config.js';

const MINIMAP_SIZE = 168;
const WORLD_SPAN = 460; // world metres shown across the minimap

function worldToMap(x, z) {
  const s = MINIMAP_SIZE / WORLD_SPAN;
  return { x: MINIMAP_SIZE / 2 + x * s, y: MINIMAP_SIZE / 2 + z * s };
}

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    money: el('money'),
    stars: el('stars'),
    speed: el('speed'),
    clock: el('clock'),
    objective: el('objective'),
    banner: el('banner'),
    bannerTitle: el('banner-title'),
    bannerText: el('banner-text'),
    toast: el('toast'),
    prompt: el('prompt'),
    ammo: el('ammo'),
    minimap: el('minimap'),
    ctx: el('minimap').getContext('2d'),
    dialog: el('dialog'),
    dialogName: el('dialog-name'),
    dialogText: el('dialog-text'),
    lastToast: 0,
  };
  return hud;
}

export function showToast(hud, text, now) {
  hud.toast.textContent = text;
  hud.toast.classList.add('show');
  hud.lastToast = now;
  setTimeout(() => hud.toast.classList.remove('show'), 2600);
}

export function showBanner(hud, title, text) {
  hud.bannerTitle.textContent = title;
  hud.bannerText.textContent = text;
  hud.banner.classList.add('show');
  setTimeout(() => hud.banner.classList.remove('show'), 6000);
}

export function showDialog(hud, name, text, seconds = 5) {
  hud.dialogName.textContent = name;
  hud.dialogText.textContent = text;
  hud.dialog.classList.add('show');
  clearTimeout(hud.dialog._t);
  hud.dialog._t = setTimeout(() => hud.dialog.classList.remove('show'), seconds * 1000);
}

export function updateHud(hud, game) {
  const hp = Math.max(0, Math.round(game.health));
  hud.healthFill.style.width = `${hp}%`;
  hud.healthFill.className = hp > 50 ? 'ok' : hp > 25 ? 'warn' : 'bad';
  hud.healthText.textContent = `${hp}`;
  hud.money.textContent = `$${game.money.toLocaleString('en-US')}`;
  hud.ammo.textContent = game.inCar ? '—' : `Ammo ${game.combat.ammo}`;
  hud.speed.textContent = game.inCar
    ? `${Math.round(Math.abs(game.playerCar.speed) * 3.6)} km/h`
    : game.onFoot ? 'On foot' : '';
  const hh = Math.floor(game.clock / 60) % 24;
  const mm = Math.floor(game.clock) % 60;
  hud.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  hud.stars.innerHTML = '★'.repeat(game.wanted.stars) + '<span class="dim">' + '★'.repeat(5 - game.wanted.stars) + '</span>';
  hud.stars.classList.toggle('hot', game.wanted.stars > 0);
  hud.objective.textContent = game.objective;
  hud.prompt.textContent = game.prompt;
  hud.prompt.classList.toggle('show', !!game.prompt);
}

export function drawMinimap(hud, game) {
  const ctx = hud.ctx;
  const S = MINIMAP_SIZE;
  ctx.clearRect(0, 0, S, S);
  // Base: dark city.
  ctx.fillStyle = 'rgba(12, 20, 28, 0.82)';
  ctx.fillRect(0, 0, S, S);
  // Sea (south).
  const sea = worldToMap(0, SEA_Z);
  ctx.fillStyle = '#1e7fa0';
  ctx.fillRect(0, sea.y, S, S - sea.y);
  // Sand band.
  const sand = worldToMap(0, BEACH_Z);
  ctx.fillStyle = '#d9bd7f';
  ctx.fillRect(0, sand.y, S, sea.y - sand.y);
  // Roads.
  ctx.strokeStyle = '#8a94a3';
  ctx.lineWidth = 3;
  for (const line of ROAD_LINES) {
    ctx.beginPath();
    if (line.axis === 'x') {
      const a = worldToMap(-200, line.at);
      const b = worldToMap(200, line.at);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else {
      const a = worldToMap(line.at, -200);
      const b = worldToMap(line.at, 200);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  // Park.
  const park = worldToMap(-78, 130);
  ctx.fillStyle = '#3f8f4f';
  ctx.fillRect(park.x - 8, park.y - 8, 16, 16);
  // Mission blip: pulsing gold diamond.
  if (game.missionTarget) {
    const m = worldToMap(game.missionTarget.x, game.missionTarget.z);
    const pulse = 4 + Math.sin(game.time * 5) * 1.5;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - pulse);
    ctx.lineTo(m.x + pulse, m.y);
    ctx.lineTo(m.x, m.y + pulse);
    ctx.lineTo(m.x - pulse, m.y);
    ctx.closePath();
    ctx.fill();
  }
  // Traffic dots.
  ctx.fillStyle = '#e8e8e8';
  for (const c of game.trafficCars) {
    const p = worldToMap(c.x, c.z);
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  // Police dots: red/blue.
  for (const c of game.policeCars) {
    const p = worldToMap(c.x, c.z);
    ctx.fillStyle = Math.floor(game.time * 4) % 2 === 0 ? '#ff4444' : '#4488ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
  }
  // Player arrow, rotated to heading.
  const p = worldToMap(game.playerX, game.playerZ);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(game.playerHeading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
