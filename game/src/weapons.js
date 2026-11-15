// Weapon loadout, tactical recoil/spread model, reload state, and detailed 3D viewmodel rigs.
import * as THREE from 'three';
import { WEAPONS, GRENADES, PALETTE } from './config.js';

function buildViewModel(kind) {
  const root = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#1e232a', roughness: 0.36, metalness: 0.82 });
  const gunSteel = new THREE.MeshStandardMaterial({ color: '#39434f', roughness: 0.42, metalness: 0.72 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.72, metalness: 0.12 });
  const accent = new THREE.MeshStandardMaterial({
    color: PALETTE.hazardAmber,
    emissive: new THREE.Color(PALETTE.hazardAmber),
    emissiveIntensity: 0.45,
    roughness: 0.35,
  });
  const glove = new THREE.MeshStandardMaterial({ color: '#42362d', roughness: 0.85, metalness: 0.05 });

  function part(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  }

  if (kind === 'blade') {
    part(0.025, 0.032, 0.14, 0, -0.02, -0.1, polymer);
    part(0.012, 0.028, 0.22, 0, 0.005, -0.26, gunSteel);
    part(0.045, 0.06, 0.09, 0.02, -0.04, -0.06, glove);
  } else if (kind === 'kestrel') {
    part(0.034, 0.046, 0.23, 0, 0.01, -0.14, darkMetal);
    part(0.03, 0.095, 0.045, 0, -0.055, -0.06, polymer);
    part(0.012, 0.012, 0.02, 0, 0.038, -0.23, accent);
    part(0.048, 0.058, 0.09, 0.01, -0.06, -0.05, glove);
  } else if (kind === 'vektor') {
    part(0.052, 0.072, 0.34, 0, 0, -0.18, polymer);
    part(0.026, 0.026, 0.18, 0, 0.008, -0.41, darkMetal);
    part(0.028, 0.15, 0.045, 0, -0.095, -0.21, gunSteel);
    part(0.036, 0.036, 0.08, 0, 0.055, -0.16, darkMetal);
    part(0.014, 0.012, 0.02, 0, 0.058, -0.14, accent);
    part(0.056, 0.058, 0.1, -0.025, -0.05, -0.24, glove);
  } else if (kind === 'dmr7') {
    part(0.054, 0.078, 0.48, 0, 0, -0.22, gunSteel);
    part(0.024, 0.024, 0.34, 0, 0.012, -0.58, darkMetal);
    part(0.036, 0.046, 0.24, 0, 0.068, -0.22, darkMetal);
    part(0.016, 0.016, 0.02, 0, 0.068, -0.11, accent);
    part(0.034, 0.11, 0.07, 0, -0.08, -0.22, polymer);
    part(0.058, 0.058, 0.11, -0.025, -0.045, -0.28, glove);
  } else {
    // Vanguard AR-17 rifle
    part(0.056, 0.076, 0.44, 0, 0, -0.2, darkMetal);
    part(0.044, 0.042, 0.24, 0, -0.005, -0.34, polymer);
    part(0.022, 0.022, 0.22, 0, 0.008, -0.52, gunSteel);
    part(0.034, 0.14, 0.06, 0, -0.09, -0.23, gunSteel);
    part(0.03, 0.034, 0.11, 0, 0.056, -0.17, darkMetal);
    part(0.014, 0.014, 0.014, 0, 0.058, -0.12, accent);
    part(0.056, 0.058, 0.1, -0.022, -0.045, -0.29, glove);
  }

  return root;
}

export function createWeaponSystem(camera) {
  const mount = new THREE.Group();
  mount.position.set(0.24, -0.23, -0.22);
  camera.add(mount);

  const models = {};
  for (const key of Object.keys(WEAPONS)) {
    models[key] = buildViewModel(key);
    models[key].visible = false;
    mount.add(models[key]);
  }

  // Grenade hand viewmodel
  const nadeModel = new THREE.Group();
  const nadeBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#394b3e', roughness: 0.55, metalness: 0.35 })
  );
  nadeBody.position.set(0, -0.02, -0.18);
  nadeModel.add(nadeBody);
  nadeModel.visible = false;
  mount.add(nadeModel);

  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9 });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), flashMat);
  muzzleFlash.position.set(0, 0.015, -0.66);
  muzzleFlash.visible = false;
  mount.add(muzzleFlash);

  const flashLight = new THREE.PointLight('#ffbb55', 0, 5);
  flashLight.position.set(0, 0.04, -0.6);
  mount.add(flashLight);

  const state = {
    slots: [null, null, null, null, null], // [primary, sidearm, knife, frag, smoke/flash]
    activeSlot: 1,
    activeGrenadeKind: 'frag',
    mag: {},
    reserve: {},
    grenades: { frag: 0, smoke: 0, flash: 0 },
    cooldown: 0,
    reloadTimer: 0,
    equipTimer: 0,
    burstShots: 0,
    recoilResetTimer: 0,
    scoped: false,
    kickBack: 0,
    flashTimer: 0,
    swingTimer: 0,
    walkTime: 0,
    semiLocked: false,
  };

  function resetLoadout(keepPrimary = false) {
    if (!keepPrimary) state.slots[0] = null;
    state.slots[1] = 'kestrel';
    state.slots[2] = 'blade';
    state.mag.kestrel = WEAPONS.kestrel.magSize;
    state.reserve.kestrel = WEAPONS.kestrel.reserveMax;
    state.mag.blade = 1;
    state.reserve.blade = 0;
    if (state.slots[0]) {
      const pw = WEAPONS[state.slots[0]];
      state.mag[pw.id] = pw.magSize;
      state.reserve[pw.id] = pw.reserveMax;
      state.activeSlot = 0;
    } else {
      state.activeSlot = 1;
    }
    state.reloadTimer = 0;
    state.cooldown = 0;
    state.equipTimer = 0.15;
    state.burstShots = 0;
    state.scoped = false;
    updateModelVisibility();
  }

  function giveWeapon(weaponId) {
    const def = WEAPONS[weaponId];
    if (!def) return false;
    state.slots[def.slot] = weaponId;
    state.mag[weaponId] = def.magSize;
    state.reserve[weaponId] = def.reserveMax;
    selectSlot(def.slot);
    return true;
  }

  function giveGrenade(kind) {
    if (!GRENADES[kind]) return false;
    if (state.grenades[kind] >= 1) return false;
    state.grenades[kind] = 1;
    state.slots[3] = kind === 'frag' ? 'frag' : state.slots[3];
    if (kind === 'smoke' || kind === 'flash') state.slots[4] = kind;
    return true;
  }

  function currentWeaponDef() {
    const id = state.slots[state.activeSlot];
    if (state.activeSlot <= 2 && id && WEAPONS[id]) return WEAPONS[id];
    return null;
  }

  function currentGrenadeKind() {
    if (state.activeSlot === 3 && state.grenades.frag > 0) return 'frag';
    if (state.activeSlot === 4) {
      if (state.slots[4] && state.grenades[state.slots[4]] > 0) return state.slots[4];
      if (state.grenades.smoke > 0) return 'smoke';
      if (state.grenades.flash > 0) return 'flash';
    }
    return null;
  }

  function updateModelVisibility() {
    for (const key of Object.keys(models)) models[key].visible = false;
    nadeModel.visible = false;
    const w = currentWeaponDef();
    if (w && models[w.id]) {
      models[w.id].visible = !state.scoped;
    } else if (currentGrenadeKind()) {
      nadeModel.visible = true;
    }
  }

  function selectSlot(slot) {
    if (slot < 0 || slot > 4) return false;
    if (slot <= 2 && !state.slots[slot]) return false;
    if (slot === 3 && state.grenades.frag <= 0) return false;
    if (slot === 4 && state.grenades.smoke <= 0 && state.grenades.flash <= 0) return false;
    if (state.activeSlot === slot) return true;
    state.activeSlot = slot;
    state.reloadTimer = 0;
    state.equipTimer = 0.22;
    state.scoped = false;
    state.burstShots = 0;
    updateModelVisibility();
    return true;
  }

  function toggleScope() {
    const w = currentWeaponDef();
    if (!w || !w.zoomFov) {
      state.scoped = false;
      updateModelVisibility();
      return false;
    }
    state.scoped = !state.scoped;
    updateModelVisibility();
    return state.scoped;
  }

  function startReload() {
    const w = currentWeaponDef();
    if (!w || w.category === 'melee' || state.reloadTimer > 0) return false;
    const curMag = state.mag[w.id] ?? 0;
    const curRes = state.reserve[w.id] ?? 0;
    if (curMag >= w.magSize || curRes <= 0) return false;
    state.reloadTimer = w.reloadTime;
    state.scoped = false;
    updateModelVisibility();
    return true;
  }

  function readyToFire(firingHeld) {
    const w = currentWeaponDef();
    if (!w) return false;
    if (state.equipTimer > 0 || state.reloadTimer > 0 || state.cooldown > 0) return false;
    if (!w.automatic && state.semiLocked) return false;
    if (w.category === 'melee') return firingHeld;
    return (state.mag[w.id] ?? 0) > 0;
  }

  function computeSpread(groundSpeed, crouching, onGround) {
    const w = currentWeaponDef();
    if (!w) return 0;
    let spread = w.baseSpread;
    if (crouching) spread *= w.crouchMult;
    if (state.scoped) spread *= 0.25;
    const speedRatio = Math.min(1.5, groundSpeed / 5.4);
    spread += w.moveSpread * speedRatio;
    if (!onGround) spread += 0.085;
    spread += Math.min(0.032, state.burstShots * 0.0028);
    return spread;
  }

  function pullTrigger(randomFn) {
    const w = currentWeaponDef();
    if (!w) return null;
    if (!w.automatic) state.semiLocked = true;
    state.cooldown = w.fireRate;
    if (w.category === 'melee') {
      state.swingTimer = 0.22;
      return { weapon: w, pitchKick: 0, yawKick: 0 };
    }
    state.mag[w.id] = Math.max(0, (state.mag[w.id] ?? 0) - 1);
    state.burstShots = Math.min(15, state.burstShots + 1);
    state.recoilResetTimer = 0.34;
    state.kickBack = Math.min(0.09, state.kickBack + (w.id === 'dmr7' ? 0.065 : 0.028));
    state.flashTimer = 0.045;
    muzzleFlash.visible = !state.scoped;
    muzzleFlash.rotation.z = randomFn() * Math.PI;
    flashLight.intensity = 2.8;

    // Predictable tactical spray pattern (strong upward kick first, then alternating horizontal sway)
    const dir = state.burstShots < 4 ? 0.25 : Math.sin(state.burstShots * 1.15);
    const pitchKick = w.recoilPitch * (0.85 + randomFn() * 0.3);
    const yawKick = w.recoilYaw * dir + (randomFn() - 0.5) * w.recoilYaw * 0.45;
    return { weapon: w, pitchKick, yawKick };
  }

  function consumeActiveGrenade() {
    const kind = currentGrenadeKind();
    if (!kind) return null;
    state.grenades[kind] = Math.max(0, state.grenades[kind] - 1);
    if (state.slots[0]) selectSlot(0);
    else selectSlot(1);
    updateModelVisibility();
    return kind;
  }

  function step(dt, firingHeld, groundSpeed) {
    if (!firingHeld) state.semiLocked = false;
    if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.equipTimer > 0) state.equipTimer = Math.max(0, state.equipTimer - dt);
    if (state.swingTimer > 0) state.swingTimer = Math.max(0, state.swingTimer - dt);

    if (state.recoilResetTimer > 0) {
      state.recoilResetTimer -= dt;
      if (state.recoilResetTimer <= 0) state.burstShots = 0;
    }

    if (state.reloadTimer > 0) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        state.reloadTimer = 0;
        const w = currentWeaponDef();
        if (w && w.category !== 'melee') {
          const curMag = state.mag[w.id] ?? 0;
          const curRes = state.reserve[w.id] ?? 0;
          const need = Math.min(w.magSize - curMag, curRes);
          state.mag[w.id] = curMag + need;
          state.reserve[w.id] = curRes - need;
        }
      }
    }

    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      if (state.flashTimer <= 0) {
        muzzleFlash.visible = false;
        flashLight.intensity = 0;
      }
    }

    state.kickBack *= Math.max(0, 1 - dt * 15);
    if (groundSpeed > 0.35) state.walkTime += dt * (4 + groundSpeed * 0.9);
    const bobX = Math.cos(state.walkTime) * 0.007 * Math.min(1, groundSpeed / 5);
    const bobY = Math.abs(Math.sin(state.walkTime)) * 0.008 * Math.min(1, groundSpeed / 5);
    const reloadDip = state.reloadTimer > 0 ? Math.sin((state.reloadTimer / 2.2) * Math.PI) * 0.14 : 0;
    const equipDip = state.equipTimer * 0.4;
    const slashFwd = state.swingTimer > 0 ? Math.sin((state.swingTimer / 0.22) * Math.PI) * 0.14 : 0;

    mount.position.set(0.24 + bobX, -0.23 - bobY - reloadDip - equipDip, -0.22 + state.kickBack - slashFwd);
    mount.rotation.set(state.kickBack * 1.4 - reloadDip * 1.1, slashFwd * 1.6, 0);
  }

  resetLoadout(false);

  return {
    state,
    resetLoadout,
    giveWeapon,
    giveGrenade,
    currentWeaponDef,
    currentGrenadeKind,
    selectSlot,
    toggleScope,
    startReload,
    readyToFire,
    computeSpread,
    pullTrigger,
    consumeActiveGrenade,
    step,
    updateModelVisibility,
  };
}
