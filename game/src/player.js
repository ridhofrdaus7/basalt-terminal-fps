// Fixed-step tactical player movement: acceleration, friction, silent walk, crouch, jump, step-up, recoil recovery.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.74;
const CROUCH_HEIGHT = 1.14;
const STAND_EYE = 1.60;
const CROUCH_EYE = 1.02;
const BASE_WALK = 5.4;
const SHIFT_WALK = 3.05;
const CROUCH_SPEED = 2.45;
const GROUND_ACCEL = 44;
const AIR_ACCEL = 9.5;
const FRICTION = 10.5;
const GRAVITY = 21;
const JUMP_SPEED = 6.4;
const STEP_UP_MAX = 0.28;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 19.6),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    onGround: true,
    crouching: false,
    walkingSlow: false,
    hp: 100,
    armor: 0,
    hasHelmet: false,
    alive: true,
    flashAlpha: 0,
    stepDist: 0,
  };

  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i++) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  function reset(spawnPos, yaw = 0) {
    state.position.copy(spawnPos);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    state.eye = STAND_EYE;
    state.height = STAND_HEIGHT;
    state.onGround = true;
    state.crouching = false;
    state.walkingSlow = false;
    state.hp = 100;
    state.alive = true;
    state.flashAlpha = 0;
    state.stepDist = 0;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.46, Math.min(1.46, state.pitch - dy * sensitivity));
  }

  function addRecoil(pitchKick, yawKick) {
    state.recoilPitch = Math.min(0.32, state.recoilPitch + pitchKick);
    state.recoilYaw = Math.max(-0.14, Math.min(0.14, state.recoilYaw + yawKick));
  }

  function takeDamage(amount, isHead = false) {
    if (!state.alive) return false;
    let dmg = amount;
    if (state.armor > 0 && (!isHead || state.hasHelmet)) {
      const absorbed = Math.min(state.armor, dmg * 0.42);
      state.armor = Math.max(0, Math.round(state.armor - absorbed));
      dmg -= absorbed;
    }
    state.hp = Math.max(0, Math.round(state.hp - dmg));
    if (state.hp <= 0) {
      state.alive = false;
      return true;
    }
    return false;
  }

  function moveAxisWithStep(axis, delta) {
    const curX = state.position.x;
    const curY = state.position.y;
    const curZ = state.position.z;
    const tx = axis === 'x' ? curX + delta : curX;
    const tz = axis === 'z' ? curZ + delta : curZ;
    const hit = overlaps(tx, curY, tz, state.height, 0.04);
    if (!hit) {
      state.position.x = tx;
      state.position.z = tz;
      return true;
    }
    // Attempt stair step-up if obstacle top is within STEP_UP_MAX
    if (state.onGround && hit.max.y - curY <= STEP_UP_MAX && hit.max.y - curY > 0.01) {
      if (!overlaps(tx, hit.max.y, tz, state.height, 0.02)) {
        state.position.x = tx;
        state.position.y = hit.max.y;
        state.position.z = tz;
        return true;
      }
    }
    if (axis === 'x') state.velocity.x = 0;
    else state.velocity.z = 0;
    return false;
  }

  function step(dt, keys, moveSpeedMult = 1.0, freeze = false, onFootstep = null) {
    // Recoil & flash decay even while frozen or dead
    const recDecay = Math.min(1, dt * 11);
    state.recoilPitch *= 1 - recDecay;
    state.recoilYaw *= 1 - recDecay;
    if (state.flashAlpha > 0) state.flashAlpha = Math.max(0, state.flashAlpha - dt * 0.45);

    if (!state.alive) return;

    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && state.crouching) {
      if (!overlaps(state.position.x, state.position.y, state.position.z, STAND_HEIGHT, 0.02)) {
        state.crouching = false;
        state.height = STAND_HEIGHT;
      }
    }
    const targetEye = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 14);

    if (freeze) {
      state.velocity.x = 0;
      state.velocity.z = 0;
      return;
    }

    state.walkingSlow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

    wish.set(0, 0, 0);
    if (fwd || str) {
      const yawEff = state.yaw + state.recoilYaw;
      const sin = Math.sin(yawEff);
      const cos = Math.cos(yawEff);
      wish.set(-sin * fwd + cos * str, 0, -cos * fwd - sin * str).normalize();
    }

    const baseSpeed = state.crouching ? CROUCH_SPEED : state.walkingSlow ? SHIFT_WALK : BASE_WALK;
    const topSpeed = baseSpeed * moveSpeedMult;
    const accel = state.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const blend = Math.min(1, (accel * dt) / Math.max(0.5, topSpeed));
    state.velocity.x += (wish.x * topSpeed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * topSpeed - state.velocity.z) * blend;

    if (state.onGround && !fwd && !str) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }

    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;

    const prevX = state.position.x;
    const prevZ = state.position.z;
    moveAxisWithStep('x', state.velocity.x * dt);
    moveAxisWithStep('z', state.velocity.z * dt);

    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hitY = overlaps(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hitY && state.velocity.y <= 0) {
      state.position.y = hitY.max.y;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (hitY) {
      state.position.y = hitY.min.y - state.height;
      state.velocity.y = 0;
    }
    if (state.position.y < 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    state.velocity.y = Math.max(-28, state.velocity.y);

    if (state.onGround && !state.walkingSlow && !state.crouching) {
      const moved = Math.hypot(state.position.x - prevX, state.position.z - prevZ);
      state.stepDist += moved;
      if (state.stepDist >= 1.9) {
        state.stepDist = 0;
        if (onFootstep) onFootstep(false);
      }
    }
  }

  return {
    state,
    reset,
    look,
    addRecoil,
    takeDamage,
    step,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    isLoudMoving() {
      return state.onGround && !state.walkingSlow && !state.crouching && Math.hypot(state.velocity.x, state.velocity.z) > 3.3;
    },
  };
}
