// Marina Verde — HUD. Updates the DOM overlay (health, money, wanted stars,
// speed, clock, objective, banners, dialogue) and draws the 2D minimap
// canvas: roads, beach, player arrow, cars, police, peds and the mission blip.
// v2: weapon slots (1–4 + ammo), radio line, district label, helicopter
// warning badge, and minimap icons for the helicopter (yellow H), shops
// (green $) and the safehouse (white house).
// v2 §10 (pre-submit package): mission panel, MVPD RESPONSE panel, REP bar,
// DAY clock + IN SIGHT badge, dialog portrait, car panel (name/CONDITION/
// gear), radio song + EQ bars, and the full map screen (M).
import { ROAD_LINES, ROAD_MIN, ROAD_MAX, BEACH_Z, SEA_Z, SHOPS, PLACES, WEAPON_ORDER, WEAPONS, MISSIONS, CAR_NAMES } from './config.js';

const MINIMAP_SIZE = 168;
const WORLD_SPAN = 460; // world metres shown across the minimap
const MAP_SIZE = 620; // full-map canvas (square, same world span)

function worldToMap(x, z) {
  const s = MINIMAP_SIZE / WORLD_SPAN;
  return { x: MINIMAP_SIZE / 2 + x * s, y: MINIMAP_SIZE / 2 + z * s };
}

function worldToBigMap(x, z) {
  const s = MAP_SIZE / WORLD_SPAN;
  return { x: MAP_SIZE / 2 + x * s, y: MAP_SIZE / 2 + z * s };
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
    dialogPortrait: el('dialog-portrait'),
    weaponSlots: el('weapon-slots'),
    radioLine: el('radio-line'),
    district: el('district'),
    heliWarning: el('heli-warning'),
    gpsDist: el('gps-dist'),
    missionPanel: el('mission-panel'),
    missionAct: el('mission-act'),
    missionName: el('mission-name'),
    missionTimer: el('mission-timer'),
    missionObjective: el('mission-objective'),
    missionStageFill: el('mission-stage-fill'),
    missionStageText: el('mission-stage-text'),
    missionNext: el('mission-next'),
    mvpdPanel: el('mvpd-panel'),
    mvpdList: el('mvpd-list'),
    mvpdCount: el('mvpd-count'),
    leftCol: el('left-col'),
    controlsHint: el('controls-hint'),
    minimapWrap: el('minimap-wrap'),
    _hintT: -1, // throttle for the hint-visibility check (v2fix A)
    _hintHidden: false,
    _hintH: 0, // cached hint height (offsetHeight is 0 while hidden)
    sightBadge: el('sight-badge'),
    repLabel: el('rep-label'),
    repFill: el('rep-fill'),
    carPanel: el('car-panel'),
    carName: el('car-name'),
    carCondition: el('car-condition'),
    carGear: el('car-gear'),
    mapScreen: el('map-screen'),
    mapCanvas: el('map-canvas'),
    mapCtx: el('map-canvas') ? el('map-canvas').getContext('2d') : null,
    mapLedger: el('map-ledger'),
    mapMissions: el('map-missions'),
    lastToast: 0,
    _c: {}, // DOM write cache: only touch the DOM when a value actually changes
    _mvpdT: -1,
  };
  return hud;
}

// Write textContent only when the value changed (per-frame DOM churn is a
// real cost on the perf budget, DESIGN §8).
function setText(hud, el, key, value) {
  if (hud._c[key] !== value) {
    hud._c[key] = value;
    el.textContent = value;
  }
}
function setHtml(hud, el, key, value) {
  if (hud._c[key] !== value) {
    hud._c[key] = value;
    el.innerHTML = value;
  }
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
  // Portrait: coloured initial circle (procedural, no image assets).
  if (hud.dialogPortrait) {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    hud.dialogPortrait.textContent = initial;
    hud.dialogPortrait.style.background = name === 'Rosa' ? '#e86a5a' : name === 'Marco' ? '#2f6fd0' : '#38b6a0';
  }
  hud.dialog.classList.add('show');
  clearTimeout(hud.dialog._t);
  hud.dialog._t = setTimeout(() => hud.dialog.classList.remove('show'), seconds * 1000);
}

// Mission panel (DESIGN §10.1): act, name, timer, objective, stage x/12, NEXT.
function updateMissionPanel(hud, game) {
  if (!hud.missionPanel) return;
  const ms = game.missions;
  const m = MISSIONS[ms.index];
  if (!m) {
    hud.missionPanel.classList.add('done');
    setText(hud, hud.missionAct, 'mact', 'ALL JOBS DONE');
    setText(hud, hud.missionName, 'mname', 'Marina Verde is yours.');
    setText(hud, hud.missionTimer, 'mtime', '');
    setText(hud, hud.missionObjective, 'mobj', 'Free roam — repeat the street race or keep the ledger growing.');
    setText(hud, hud.missionStageText, 'mstage', '12 / 12');
    hud.missionStageFill.style.width = '100%';
    setText(hud, hud.missionNext, 'mnext', 'NEXT: —');
    return;
  }
  const actNames = { 1: 'ACT I — SMALL JOBS', 2: 'ACT II — HEAT RISING', 3: 'ACT III — FULL TIDE' };
  setText(hud, hud.missionAct, 'mact', actNames[m.act] || `ACT ${m.act}`);
  setText(hud, hud.missionName, 'mname', m.title);
  const ss = ms.stepState || {};
  const step = m.steps[ms.step];
  const timed = step && (step.kind === 'timed' || step.kind === 'survive' || step.kind === 'race');
  setText(hud, hud.missionTimer, 'mtime', timed ? `⏱ ${Math.max(0, Math.ceil(ss.timer ?? 0))} s` : '');
  setText(hud, hud.missionObjective, 'mobj', step ? step.text : m.brief);
  const done = ms.index;
  setText(hud, hud.missionStageText, 'mstage', `${done} / 12`);
  if (hud._c.mfill !== done) {
    hud._c.mfill = done;
    hud.missionStageFill.style.width = `${(done / 12) * 100}%`;
  }
  const next = MISSIONS[ms.index + 1];
  setText(hud, hud.missionNext, 'mnext', next ? `NEXT: ${next.title}` : 'NEXT: FINALE');
}

// MVPD RESPONSE panel (DESIGN §10.2): one row per active unit — callsign,
// distance, status chip. Throttled to 4 Hz; hidden when no heat at all.
function updateMvpdPanel(hud, game) {
  if (!hud.mvpdPanel) return;
  if (game.time - hud._mvpdT < 0.25) return;
  hud._mvpdT = game.time;
  const rows = [];
  const px = game.playerX;
  const pz = game.playerZ;
  for (const c of game.policeCars) {
    const d = Math.round(Math.hypot(c.x - px, c.z - pz));
    const chip = d < 12 ? 'RAMMING' : d < 40 ? 'PURSUIT' : 'PURSUIT';
    rows.push({ label: c.callsign || 'UNIT ??', dist: d, chip });
  }
  for (const c of game.patrolCars || []) {
    const d = Math.round(Math.hypot(c.x - px, c.z - pz));
    rows.push({ label: c.callsign || 'PATROL', dist: d, chip: 'ROADBLOCK' });
  }
  if (game.heli && game.heli.active) {
    const hx = game.heli.mesh.position.x;
    const hz = game.heli.mesh.position.z;
    const d = Math.round(Math.hypot(hx - px, hz - pz));
    rows.push({ label: 'AIR 1 — HELICOPTER', dist: d, chip: game.heli.spotlit >= 3 ? 'SPOTLIGHT' : 'SEARCH' });
  }
  const show = rows.length > 0 && game.wanted.stars > 0;
  hud.mvpdPanel.classList.toggle('show', show);
  if (!show) return;
  const mode = (game.policeMode || 'pursuit').toUpperCase();
  setText(hud, hud.mvpdCount, 'mvpdcount', `${rows.length} UNITS • CODE ${game.wanted.stars} • ${mode}`);
  setHtml(hud, hud.mvpdList, 'mvpd', rows.map((r) => {
    const cls = r.chip === 'RAMMING' ? 'chip ram' : r.chip === 'SPOTLIGHT' ? 'chip lock' : r.chip === 'ROADBLOCK' ? 'chip block' : 'chip';
    return `<div class="mvpd-row"><span class="mvpd-unit">${r.label}</span><span class="mvpd-dist">${r.dist} m</span><span class="${cls}">${r.chip}</span></div>`;
  }).join(''));
}

// IN SIGHT / SEARCHING badge (DESIGN §10.3, G-TOP2): the badge follows the
// real police state — PURSUIT means the law has eyes on Nico, SEARCH means
// they lost line-of-sight and are sweeping the search zone.
function updateSightBadge(hud, game) {
  if (!hud.sightBadge) return;
  let key = 'off';
  if (game.wanted.stars > 0) key = game.policeMode === 'search' ? 'search' : 'sight';
  if (hud._c.sight !== key) {
    hud._c.sight = key;
    hud.sightBadge.classList.toggle('show', key !== 'off');
    hud.sightBadge.classList.toggle('sight', key === 'sight');
    hud.sightBadge.textContent = key === 'sight' ? '● IN SIGHT' : '○ SEARCHING';
  }
}

// v2fix (A): keep the controls hint from ever reaching the minimap.
// In shot mode the hint is hidden by CSS (body.shot-mode). In normal play
// the left column grows with the MVPD panel; when its bottom would cross
// the minimap's top edge, hide the WHOLE hint (no clipped text) and only
// show it again once there is room for its full height. Throttled to 4 Hz
// — the MVPD panel only changes at that rate anyway. No overflow:hidden on
// #left-col: clipping mission/police info would be the same failure mode.
function updateHintVisibility(hud, game) {
  if (!hud.controlsHint || !hud.leftCol || !hud.minimapWrap) return;
  if (game.time - hud._hintT < 0.25) return;
  hud._hintT = game.time;
  if (document.body.classList.contains('shot-mode')) {
    if (!hud._hintHidden) { hud._hintHidden = true; hud.controlsHint.classList.add('hidden'); }
    return;
  }
  const colBottom = hud.leftCol.getBoundingClientRect().bottom;
  const mmTop = hud.minimapWrap.getBoundingClientRect().top;
  if (!hud._hintHidden) {
    hud._hintH = hud.controlsHint.offsetHeight;
    if (colBottom > mmTop - 8) {
      hud._hintHidden = true;
      hud.controlsHint.classList.add('hidden');
    }
  } else if (mmTop - colBottom > (hud._hintH || 100) + 8) {
    // Column (hint currently hidden) leaves room for the full hint again.
    hud._hintHidden = false;
    hud.controlsHint.classList.remove('hidden');
  }
}

export function updateHud(hud, game) {
  const hp = Math.max(0, Math.round(game.health));
  if (hud._c.hp !== hp) {
    hud._c.hp = hp;
    hud.healthFill.style.width = `${hp}%`;
    hud.healthFill.className = hp > 50 ? 'ok' : hp > 25 ? 'warn' : 'bad';
    hud.healthText.textContent = `${hp}`;
  }
  setText(hud, hud.money, 'money', `$${game.money.toLocaleString('en-US')}`);
  const arsenal = game.arsenal;
  const cur = arsenal ? arsenal.current : 'pistol';
  const ammo = arsenal ? (arsenal.ammo[cur] ?? 0) : game.combat.ammo;
  setText(hud, hud.ammo, 'ammo', game.inCar ? '—' : `${WEAPONS[cur].name} · Ammo ${ammo}`);
  setText(hud, hud.speed, 'speed', game.inCar
    ? `${Math.round(Math.abs(game.playerCar.speed) * 3.6)} km/h`
    : game.onFoot ? 'On foot' : '');
  // Car panel (DESIGN §10.5): name, CONDITION %, gear. Hidden on foot.
  if (hud.carPanel) {
    const inCar = game.inCar && game.playerCar;
    hud.carPanel.classList.toggle('show', !!inCar);
    if (inCar) {
      const car = game.playerCar;
      setText(hud, hud.carName, 'carname', CAR_NAMES[car.isPolice ? 'police' : car.style] || 'CAR');
      setText(hud, hud.carCondition, 'carcond', `CONDITION ${Math.max(0, Math.round(car.health ?? 100))}%`);
      const maxSp = 34 * (car.maxSpeedMul ?? 1);
      const ratio = Math.abs(car.speed) / maxSp;
      const gear = Math.abs(car.speed) < 0.5 ? 'N' : `G${Math.min(5, 1 + Math.floor(ratio * 5))}`;
      setText(hud, hud.carGear, 'cargear', gear);
    }
  }
  const day = 1 + Math.floor(game.clock / 1440);
  const hh = Math.floor(game.clock / 60) % 24;
  const mm = Math.floor(game.clock) % 60;
  setText(hud, hud.clock, 'clock', `DAY ${day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  setHtml(hud, hud.stars, 'stars', '★'.repeat(game.wanted.stars) + '<span class="dim">' + '★'.repeat(5 - game.wanted.stars) + '</span>');
  hud.stars.classList.toggle('hot', game.wanted.stars > 0);
  setText(hud, hud.prompt, 'prompt', game.prompt);
  hud.prompt.classList.toggle('show', !!game.prompt);
  // v2: district label, radio line, helicopter warning, weapon slots.
  if (hud.district) setText(hud, hud.district, 'district', game.district || 'Marina Verde');
  // Turf Ledger REP bar (DESIGN §10.4): rep = acts completed, 0–3.
  if (hud.repLabel && game.ledger) {
    const rep = game.ledger.rep ?? 0;
    setText(hud, hud.repLabel, 'rep', `REP ${rep} / 3 — TURF LEDGER`);
    if (hud._c.repfill !== rep) {
      hud._c.repfill = rep;
      hud.repFill.style.width = `${(rep / 3) * 100}%`;
    }
  }
  // Radio line (DESIGN §10.4): station + now-playing song + EQ bars.
  if (hud.radioLine && game.radio) {
    const song = game.radio.currentSong ? game.radio.currentSong() : '';
    setHtml(hud, hud.radioLine, 'radio', `♪ ${game.radio.currentName()} — ${song} <span class="eq"><i></i><i></i><i></i><i></i><i></i></span>`);
  }
  updateMissionPanel(hud, game);
  updateMvpdPanel(hud, game);
  updateHintVisibility(hud, game);
  updateSightBadge(hud, game);
  if (game.state === 'map') drawMap(hud, game);
  // GPS (DESIGN §9.2): distance + direction arrow to the objective.
  if (hud.gpsDist) {
    const t = game.missionTarget;
    if (t) {
      const dx = t.x - game.playerX;
      const dz = t.z - game.playerZ;
      const dist = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, dz);
      let rel = bearing - game.playerHeading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
      const arrow = arrows[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
      setText(hud, hud.gpsDist, 'gps', `▸ ${arrow} ${Math.round(dist)} m${t.label ? ` → ${t.label}` : ''}`);
    } else {
      setText(hud, hud.gpsDist, 'gps', '');
    }
  }
  if (hud.heliWarning) {
    const heliOn = game.heli && game.heli.active;
    const warnKey = heliOn ? (game.heli.spotlit >= 3 ? 'lock' : 'over') : 'off';
    if (hud._c.heli !== warnKey) {
      hud._c.heli = warnKey;
      hud.heliWarning.classList.toggle('show', !!heliOn);
      if (heliOn) hud.heliWarning.textContent = warnKey === 'lock' ? 'HELICOPTER OVERHEAD — SPOTLIGHT LOCKED!' : 'HELICOPTER OVERHEAD';
    }
  }
  if (hud.weaponSlots && arsenal) {
    setHtml(hud, hud.weaponSlots, 'slots', WEAPON_ORDER.map((id, i) => {
      const owned = arsenal.owned[id];
      const cls = id === cur ? 'slot current' : owned ? 'slot' : 'slot locked';
      return `<span class="${cls}">${i + 1} ${WEAPONS[id].name}${owned ? ` ${arsenal.ammo[id]}` : ''}</span>`;
    }).join(''));
  }
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
  // v2: shop icons (green $) and safehouse (white house glyph).
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // G-TOP2: police search zone — dashed red circle around last-seen.
  if (game.searchZone) {
    const zp = worldToMap(game.searchZone.x, game.searchZone.z);
    const zr = game.searchZone.r * (MINIMAP_SIZE / WORLD_SPAN);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ff6a5c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(zp.x, zp.y, zr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 106, 92, 0.15)';
    ctx.fill();
    ctx.fillStyle = '#ff8a7a';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('?', zp.x, zp.y);
    ctx.restore();
  }
  for (const shop of SHOPS) {
    const place = PLACES[shop.place];
    const p = worldToMap(place.x, place.z);
    if (shop.id === 'safehouse') {
      ctx.fillStyle = '#ffffff';
      ctx.fillText('⌂', p.x, p.y);
    } else {
      ctx.fillStyle = '#7be495';
      ctx.fillText('$', p.x, p.y);
    }
  }
  // Mission blip: pulsing gold diamond.
  if (game.missionTarget) {
    // GPS route line (DESIGN §9.2): dashed gold line from the player to
    // the objective on the minimap.
    const pp = worldToMap(game.playerX, game.playerZ);
    const tp = worldToMap(game.missionTarget.x, game.missionTarget.z);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.restore();
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
  // v2: helicopter (yellow H).
  if (game.heli && game.heli.active) {
    const p = worldToMap(game.heli.mesh.position.x, game.heli.mesh.position.z);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('H', p.x, p.y);
  }
  // v2: follow target (orange) and race rival (purple).
  if (game.followTarget) {
    const p = worldToMap(game.followTarget.x, game.followTarget.z);
    ctx.fillStyle = '#ff8a5c';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.raceRival) {
    const p = worldToMap(game.raceRival.x, game.raceRival.z);
    ctx.fillStyle = '#c96fd0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
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

// --- Full map screen (DESIGN §10.6) ----------------------------------------
// District rectangles for the big map (same bounds as districtAt in config).
const MAP_DISTRICTS = [
  { name: 'BEACHFRONT', x0: -230, x1: 230, z0: 182, z1: 230, color: 'rgba(217, 189, 127, 0.25)' },
  { name: 'MARINA', x0: 104, x1: 230, z0: 156, z1: 230, color: 'rgba(56, 182, 160, 0.22)' },
  { name: 'LIGHTHOUSE POINT', x0: -230, x1: -104, z0: 104, z1: 230, color: 'rgba(159, 216, 232, 0.18)' },
  { name: 'PALM ROW', x0: -104, x1: 104, z0: 104, z1: 182, color: 'rgba(242, 194, 48, 0.14)' },
  { name: 'OLD MARKET', x0: -52, x1: 52, z0: -104, z1: -52, color: 'rgba(242, 194, 48, 0.16)' },
  { name: 'DOWNTOWN', x0: -104, x1: 104, z0: -104, z1: 104, color: 'rgba(159, 216, 232, 0.14)' },
  { name: 'NORTHGATE', x0: -104, x1: 104, z0: -230, z1: -104, color: 'rgba(201, 111, 208, 0.16)' },
  { name: 'WEST END', x0: -230, x1: -104, z0: -104, z1: 104, color: 'rgba(123, 228, 149, 0.14)' },
  { name: 'EASTSIDE', x0: 104, x1: 230, z0: -104, z1: 156, color: 'rgba(255, 138, 92, 0.14)' },
];

export function openMap(hud, game) {
  if (!hud.mapScreen) return;
  game.state = 'map';
  hud.mapScreen.classList.add('show');
  drawMap(hud, game);
}

export function closeMap(hud, game) {
  if (!hud.mapScreen) return;
  hud.mapScreen.classList.remove('show');
  game.state = 'playing';
}

export function drawMap(hud, game) {
  const ctx = hud.mapCtx;
  if (!ctx) return;
  const S = MAP_SIZE;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0c141c';
  ctx.fillRect(0, 0, S, S);
  // Sea (south) + sand band.
  const sea = worldToBigMap(0, SEA_Z);
  ctx.fillStyle = '#1e7fa0';
  ctx.fillRect(0, sea.y, S, S - sea.y);
  const sand = worldToBigMap(0, BEACH_Z);
  ctx.fillStyle = '#d9bd7f';
  ctx.fillRect(0, sand.y, S, sea.y - sand.y);
  // District fills + labels.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of MAP_DISTRICTS) {
    const a = worldToBigMap(d.x0, d.z0);
    const b = worldToBigMap(d.x1, d.z1);
    ctx.fillStyle = d.color;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(d.name, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  // Roads.
  ctx.strokeStyle = '#8a94a3';
  ctx.lineWidth = 5;
  for (const line of ROAD_LINES) {
    ctx.beginPath();
    if (line.axis === 'x') {
      const a = worldToBigMap(-230, line.at);
      const b = worldToBigMap(230, line.at);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else {
      const a = worldToBigMap(line.at, -230);
      const b = worldToBigMap(line.at, 230);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  // GPS route: dashed gold line from the player to the objective.
  if (game.missionTarget) {
    const pp = worldToBigMap(game.playerX, game.playerZ);
    const tp = worldToBigMap(game.missionTarget.x, game.missionTarget.z);
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.restore();
  }
  // G-TOP2: police search zone on the big map.
  if (game.searchZone) {
    const zp = worldToBigMap(game.searchZone.x, game.searchZone.z);
    const zr = game.searchZone.r * (MAP_SIZE / WORLD_SPAN);
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#ff6a5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(zp.x, zp.y, zr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 106, 92, 0.12)';
    ctx.fill();
    ctx.fillStyle = '#ff8a7a';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SEARCH ZONE', zp.x, zp.y);
    ctx.restore();
  }
  // Shops ($) + safehouse (house) + race marker (flag).
  ctx.font = 'bold 16px sans-serif';
  for (const shop of SHOPS) {
    const place = PLACES[shop.place];
    const p = worldToBigMap(place.x, place.z);
    if (shop.id === 'safehouse') {
      ctx.fillStyle = '#ffffff';
      ctx.fillText('⌂', p.x, p.y);
    } else {
      ctx.fillStyle = '#7be495';
      ctx.fillText('$', p.x, p.y);
    }
  }
  if (PLACES.raceStart) {
    const p = worldToBigMap(PLACES.raceStart.x, PLACES.raceStart.z);
    ctx.fillStyle = '#c96fd0';
    ctx.fillText('⚑', p.x, p.y);
  }
  // Mission target diamond.
  if (game.missionTarget) {
    const m = worldToBigMap(game.missionTarget.x, game.missionTarget.z);
    const pulse = 8 + Math.sin(game.time * 5) * 2;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - pulse);
    ctx.lineTo(m.x + pulse, m.y);
    ctx.lineTo(m.x, m.y + pulse);
    ctx.lineTo(m.x - pulse, m.y);
    ctx.closePath();
    ctx.fill();
  }
  // Police dots + heli H.
  for (const c of game.policeCars) {
    const p = worldToBigMap(c.x, c.z);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.heli && game.heli.active) {
    const p = worldToBigMap(game.heli.mesh.position.x, game.heli.mesh.position.z);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('H', p.x, p.y);
  }
  // Player arrow.
  const p = worldToBigMap(game.playerX, game.playerZ);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(game.playerHeading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(9, 10);
  ctx.lineTo(0, 5);
  ctx.lineTo(-9, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Side panels: Turf Ledger + mission list.
  const ledger = game.ledger || { jobsByDistrict: {}, rep: 0, races: { played: 0, wins: 0, bestMs: 0 } };
  const jobs = ledger.jobsByDistrict || {};
  const totalJobs = Object.values(jobs).reduce((a, b) => a + b, 0);
  const discount = Math.min(15, (ledger.rep ?? 0) * 5);
  setHtml(hud, hud.mapLedger, 'mapledger', `<h3>TURF LEDGER — REP ${ledger.rep ?? 0} / 3</h3>`
    + `<div>Jobs done: <b>${totalJobs} / 12</b> · Shop discount: <b>${discount}%</b></div>`
    + Object.entries(jobs).map(([d, n]) => `<div class="map-row"><span>${d}</span><span>${n} job${n === 1 ? '' : 's'}</span></div>`).join('')
    + `<div class="map-row"><span>Street races</span><span>${ledger.races?.played ?? 0} played · ${ledger.races?.wins ?? 0} wins</span></div>`);
  setHtml(hud, hud.mapMissions, 'mapmissions', `<h3>MISSIONS — ${game.missions.index >= 12 || game.missions.done ? '12 / 12' : `${game.missions.index} / 12`} DONE</h3>`
    + MISSIONS.map((m, i) => {
      const st = i < game.missions.index || game.missions.done ? '✓' : i === game.missions.index ? '▶' : '🔒';
      const cls = i === game.missions.index ? 'map-row active' : 'map-row';
      return `<div class="${cls}"><span>${st} ${m.title}</span><span>$${m.reward}</span></div>`;
    }).join(''));
}
