// Marina Verde — missions and story. Five jobs in order, each a short chain of
// steps the game tracks: reach a place, get in a car, lose the heat, or defeat
// the rival crew. The module owns the objective text, the beacon marker and
// the dialogue the player sees.
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
  };
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
  let text = step.text;
  if (step.kind === 'defeat') {
    text = `Deal with the rival crew (${Math.max(0, step.count - state.defeated)} left)`;
  }
  return `${m.title}: ${text}`;
}

export function stepTarget(state) {
  const step = currentStep(state);
  if (!step || step.kind !== 'goto') return null;
  return PLACES[step.at] ?? null;
}

// Advance one step; returns the mission just completed, if any.
export function advanceStep(state, game) {
  const m = currentMission(state);
  if (!m) return null;
  state.step += 1;
  state.defeated = 0;
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
    state.banner = {
      title: `Job complete — $${m.reward}`,
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
  const m = MISSIONS[index];
  state.banner = { title: m.title, text: `${m.giver}: ${m.brief}`, until: game.time + 7 };
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
