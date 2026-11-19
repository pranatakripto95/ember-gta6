// Ember Vice — input.js
// One job: keyboard + mouse state, exposed as a plain object the player
// controller reads each frame. Pointer lock on click, drag fallback.

export function createInput(canvas) {
  const input = {
    keys: Object.create(null),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    locked: false,
    // Edge-triggered presses, consumed by the game loop each frame.
    pressed: Object.create(null),
  };

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'jump',
    KeyE: 'enter',
    KeyF: 'punch',
    KeyR: 'reload',
    KeyM: 'mute',
    KeyP: 'pause', Escape: 'pause',
    Enter: 'confirm',
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const name = KEYMAP[e.code];
    if (name) {
      input.keys[name] = true;
      input.pressed[name] = true;
      if (name === 'jump' || name === 'pause') e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const name = KEYMAP[e.code];
    if (name) input.keys[name] = false;
  });
  window.addEventListener('blur', () => { input.keys = Object.create(null); });

  canvas.addEventListener('mousedown', (e) => {
    input.mouseDown = true;
    if (e.button === 0 && !input.locked) {
      try { canvas.requestPointerLock(); } catch (_) { /* drag fallback */ }
    }
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    } else if (input.mouseDown) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    }
  });

  // Call at the end of each frame: clears edge presses and mouse deltas.
  input.endFrame = () => {
    input.pressed = Object.create(null);
    input.mouseDX = 0;
    input.mouseDY = 0;
  };
  return input;
}
