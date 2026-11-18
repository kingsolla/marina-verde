// Marina Verde — keyboard + mouse input. WASD moves, mouse orbits the camera
// (pointer lock when clicked, drag fallback), E enters/exits cars, F or click
// shoots, V punches, P/Esc pauses, M shows the mission brief.
// v2: Space = handbrake/drift, Digit1–4 select weapons, Q cycles weapons,
// R cycles the radio station, M opens the full map (DESIGN §10.6).
export function createInput() {
  const input = {
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
    handbrake: false, // Space, held — drift
    interact: false, // E, edge-triggered by the game
    shoot: false, // mouse click, edge-triggered
    punch: false, // V, edge-triggered
    pause: false, // P or Esc, edge-triggered
    mission: false, // M, edge-triggered
    weaponSlot: 0, // Digit1–4, edge-triggered (0 = none this frame)
    cycleWeapon: false, // Q, edge-triggered
    radio: false, // R, edge-triggered
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    keys: {},
  };

  const KEYMAP = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    ShiftLeft: 'run',
    ShiftRight: 'run',
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    const mapped = KEYMAP[e.code];
    if (mapped) input[mapped] = true;
    if (e.code === 'Space') input.handbrake = true;
    if (e.code === 'KeyE') input.interact = true;
    if (e.code === 'KeyV') input.punch = true;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pause = true;
    if (e.code === 'KeyM') input.mission = true;
    if (e.code === 'KeyQ') input.cycleWeapon = true;
    if (e.code === 'KeyR') input.radio = true;
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 4) input.weaponSlot = n;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
    const mapped = KEYMAP[e.code];
    if (mapped) input[mapped] = false;
    if (e.code === 'Space') input.handbrake = false;
  });
  window.addEventListener('blur', () => {
    input.forward = input.back = input.left = input.right = input.run = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === document.body;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.shoot = true;
  });

  input.requestLock = function requestLock() {
    if (!input.locked) {
      try {
        document.body.requestPointerLock();
      } catch { /* pointer lock unavailable; drag still works */ }
    }
  };

  // Consume the accumulated mouse delta for this frame.
  input.consumeMouse = function consumeMouse() {
    const dx = input.mouseDX;
    const dy = input.mouseDY;
    input.mouseDX = 0;
    input.mouseDY = 0;
    return { dx, dy };
  };

  // Consume edge-triggered actions after the game reads them.
  input.consumeEdges = function consumeEdges() {
    input.interact = false;
    input.shoot = false;
    input.punch = false;
    input.pause = false;
    input.mission = false;
    input.weaponSlot = 0;
    input.cycleWeapon = false;
    input.radio = false;
  };

  return input;
}
