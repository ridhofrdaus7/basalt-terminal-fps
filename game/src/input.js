// Pointer lock, keyboard, and mouse input collector with clean per-frame delta readout.
export function createInput(canvas, onLockChange, onKeyAction) {
  const keys = new Set();
  const lookDelta = { x: 0, y: 0 };
  let firing = false;
  let locked = false;

  function requestLock() {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }

  function exitLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      firing = false;
      keys.clear();
    }
    if (onLockChange) onLockChange(locked);
  });

  window.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookDelta.x += e.movementX || 0;
    lookDelta.y += e.movementY || 0;
  });

  window.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) firing = true;
    else if (e.button === 2 && onKeyAction) onKeyAction('Scope');
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (!e.repeat && onKeyAction) onKeyAction(e.code);
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  return {
    keys,
    isFiring: () => firing,
    isLocked: () => locked,
    requestLock,
    exitLock,
    takeLook() {
      const dx = lookDelta.x;
      const dy = lookDelta.y;
      lookDelta.x = 0;
      lookDelta.y = 0;
      return { x: dx, y: dy };
    },
  };
}
