// Marina Verde — missions and story. Twelve jobs in three acts, each a short
// chain of steps the game tracks: reach a place, get in a car, lose the heat,
// defeat the rival crew — plus v2 step kinds: timed (beat the clock), follow
// (tail a car without being spotted), stealth (reach a place gaining 0 stars),
// survive (stay alive for T seconds), buy (purchase a shop item), deliverCar
// (steal a specific car and deliver it) and race (checkpoint race vs a rival).
// The module owns the objective text, the beacon marker and the dialogue
// the player sees.
import * as THREE from 'three';
import { MISSIONS, PLACES } from './config.js';

export function createMissionState() {
  return {
    index: 0, // which mission of MISSIONS
    step: 0, // which step of the mission
    defeated: 0, // rivals beaten in the current defeat step
    done: false, // all missions complete
    banner: null, // {title, text, until} for the on-screen banner
    toast: null,
    // Per-step transient state, reset on every step change.
    stepState: freshStepState(),
  };
}

export function freshStepState() {
  return {
    timer: 0, // timed / survive / race countdown
    followTime: 0, // follow: seconds inside the 8–25 m band
    spottedTimer: 0, // follow: seconds inside 8 m (spotted at 3 s)
    starsAtStart: 0, // stealth: stars when the step began
    surviveTimer: 0,
    raceCp: 0, // race: checkpoints passed
    raceRival: null, // race: the rival car object
    raceWaypoints: [],
    started: false, // step setup done (timers seeded, rivals spawned)
  };
}

export function resetStepState(state) {
  state.stepState = freshStepState();
}

export function currentMission(state) {
  if (state.done || state.index >= MISSIONS.length) return null;
  return MISSIONS[state.index];
}

export function currentStep(state) {
  const m = currentMission(state);
  if (!m) return null;
  return m.steps[Math.min(state.step, m.steps.length - 1)];
}

export function objectiveText(state) {
  const m = currentMission(state);
  if (!m) return 'Free roam — Marina Verde is yours. Press M for the next job.';
  const step = currentStep(state);
  const ss = state.stepState;
  let text = step.text;
  if (step.kind === 'defeat') {
    text = `Deal with the rival crew (${Math.max(0, step.count - state.defeated)} left)`;
  } else if (step.kind === 'timed') {
    text = `${step.text} — ${Math.max(0, Math.ceil(ss.timer))} s left`;
  } else if (step.kind === 'survive') {
    text = `${step.text} — ${Math.max(0, Math.ceil(ss.timer))} s left`;
  } else if (step.kind === 'follow') {
    text = `${step.text} — ${Math.floor(ss.followTime)}/${step.seconds} s`;
  } else if (step.kind === 'race') {
    text = `${step.text} — ${Math.max(0, Math.ceil(ss.timer))} s left · checkpoint ${ss.raceCp}/${step.checkpoints.length}`;
  }
  return `${m.title}: ${text}`;
}

export function stepTarget(state) {
  const step = currentStep(state);
  if (!step) return null;
  if (step.kind === 'goto' || step.kind === 'timed' || step.kind === 'stealth' || step.kind === 'survive') {
    return PLACES[step.at] ?? null;
  }
  if (step.kind === 'buy' || step.kind === 'deliverCar') return PLACES[step.at] ?? null;
  if (step.kind === 'race') {
    const cps = step.checkpoints ?? [];
    if (state.stepState.raceCp < cps.length) return PLACES[cps[state.stepState.raceCp]] ?? null;
    return PLACES[step.at] ?? null;
  }
  return null;
}

// Advance one step; returns the mission just completed, if any.
export function advanceStep(state, game) {
  const m = currentMission(state);
  if (!m) return null;
  state.step += 1;
  state.defeated = 0;
  resetStepState(state);
  if (state.step >= m.steps.length) {
    game.money += m.reward;
    game.onMissionComplete?.(m);
    state.index += 1;
    state.step = 0;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      return m;
    }
    const next = MISSIONS[state.index];
    // Act banners on missions 5 (index 4) and 9 (index 8).
    const actTitle = state.index === 4 ? 'ACT II — HEAT RISING' : state.index === 8 ? 'ACT III — FULL TIDE' : `Job complete — $${m.reward}`;
    state.banner = {
      title: actTitle,
      text: `Next: ${next.title} — ${next.giver}: ${next.brief}`,
      until: game.time + 6,
    };
    return m;
  }
  return null;
}

export function startMission(state, game, index) {
  state.index = index;
  state.step = 0;
  state.defeated = 0;
  state.done = false;
  resetStepState(state);
  const m = MISSIONS[index];
  const actTitle = index === 4 ? 'ACT II — HEAT RISING' : index === 8 ? 'ACT III — FULL TIDE' : index === 0 ? 'ACT I — SMALL JOBS' : m.title;
  state.banner = { title: actTitle, text: `${m.giver}: ${m.brief}`, until: game.time + 7 };
}

// The glowing objective beacon: a pulsing column + a floating diamond.
export function createBeacon(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 21;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  );
  diamond.position.y = 7;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(beam, diamond, ring);
  group.visible = false;
  scene.add(group);
  return group;
}

export function updateBeacon(beacon, target, time) {
  if (!target) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  beacon.position.set(target.x, 0, target.z);
  beacon.children[1].position.y = 7 + Math.sin(time * 2.4) * 0.7;
  beacon.children[1].rotation.y = time * 1.6;
  beacon.children[0].material.opacity = 0.26 + Math.sin(time * 2.4) * 0.08;
}
