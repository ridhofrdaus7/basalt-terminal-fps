// Basalt Terminal main loop: centralized match state, fixed 60 Hz sim decoupled from rendering.
import * as THREE from 'three';
import { PALETTE, MATCH_RULES, ECONOMY, WEAPONS, GRENADES } from './config.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createWeaponSystem } from './weapons.js';
import { createUtilitySystem } from './utility.js';
import { createBotManager } from './bots.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedInit = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial | 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seedInit);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyHorizon);
scene.fog = new THREE.Fog(PALETTE.fog, 28, 76);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const utility = createUtilitySystem(scene, world.colliders);
const bots = createBotManager(scene, world, utility);
const player = createPlayer(world.colliders);
const weapons = createWeaponSystem(camera);
const hud = createHud();

// Combined raycast list & pre-allocated scratch vectors (zero per-frame allocations)
const shootables = world.shootables.concat(bots.hitMeshes);
const raycaster = new THREE.Raycaster();
const tmpAimDir = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();

// Single centralized match state
const match = {
  round: 1,
  vWins: 0,
  sWins: 0,
  vLossStreak: 0,
  cash: ECONOMY.startCash,
  phase: 'BUY_FREEZE', // BUY_FREEZE | LIVE | PLANTED | ROUND_END | MATCH_END
  phaseTimer: MATCH_RULES.buyFreezeSeconds,
  buyWindowLeft: MATCH_RULES.buyWindowSeconds,
  elapsed: 0,
  started: false,
  frozen: false,
  kills: 0,
  headshots: 0,
  plantProgress: 0,
  bomb: {
    mode: 'carried', // carried | planted
    siteId: 'A',
    position: new THREE.Vector3(),
    fuse: MATCH_RULES.bombFuseSeconds,
    defuseSeconds: MATCH_RULES.defuseSeconds,
  },
  beepTimer: 1.0,
};

function canBuyNow() {
  const inSpawn = player.state.position.z > 13.5;
  return (match.phase === 'BUY_FREEZE' || (match.phase === 'LIVE' && match.buyWindowLeft > 0)) && inSpawn;
}

function handleBuy(itemId) {
  if (!canBuyNow()) return;
  let cost = 0;
  let ok = false;
  if (WEAPONS[itemId]) {
    cost = WEAPONS[itemId].price;
    if (match.cash >= cost && weapons.state.slots[0] !== itemId) {
      ok = weapons.giveWeapon(itemId);
    }
  } else if (itemId === 'kevlar') {
    cost = ECONOMY.kevlarCost;
    if (match.cash >= cost && player.state.armor < 100) {
      player.state.armor = 100;
      ok = true;
    }
  } else if (itemId === 'helmet') {
    cost = ECONOMY.helmetCost;
    if (match.cash >= cost && !player.state.hasHelmet) {
      if (player.state.armor < 50) player.state.armor = 100;
      player.state.hasHelmet = true;
      ok = true;
    }
  } else if (GRENADES[itemId]) {
    cost = GRENADES[itemId].price;
    if (match.cash >= cost) ok = weapons.giveGrenade(itemId);
  }
  if (ok) {
    match.cash -= cost;
    audio.uiClick();
    hud.showBuyMenu(true, match.cash, weapons, player.state);
    hud.setWeaponHud(weapons);
  }
}

function startRound(roundNum, resetMatch = false) {
  if (resetMatch) {
    match.round = 1;
    match.vWins = 0;
    match.sWins = 0;
    match.vLossStreak = 0;
    match.cash = ECONOMY.startCash;
    match.kills = 0;
    match.headshots = 0;
    player.state.armor = 0;
    player.state.hasHelmet = false;
    weapons.resetLoadout(false);
  } else {
    match.round = roundNum;
    weapons.resetLoadout(player.state.alive);
  }
  player.reset(world.vanguardSpawns[0], 0);
  bots.resetRound(match.round, random);
  utility.resetRound();

  match.phase = 'BUY_FREEZE';
  match.phaseTimer = MATCH_RULES.buyFreezeSeconds;
  match.buyWindowLeft = MATCH_RULES.buyWindowSeconds;
  match.plantProgress = 0;
  match.bomb.mode = 'carried';
  match.bomb.fuse = MATCH_RULES.bombFuseSeconds;
  match.beepTimer = 1.0;

  hud.showBanner(null, '');
  hud.showBuyMenu(false, match.cash, weapons, player.state);
  syncCamera();
}

function finishRound(winnerTeam, reason) {
  if (match.phase === 'ROUND_END' || match.phase === 'MATCH_END') return;
  match.phase = 'ROUND_END';
  match.phaseTimer = MATCH_RULES.roundEndSeconds;
  if (winnerTeam === 'vanguard') {
    match.vWins += 1;
    match.vLossStreak = 0;
    match.cash = Math.min(ECONOMY.maxCash, match.cash + ECONOMY.winReward);
    hud.showBanner('VANGUARD WINS ROUND', reason);
  } else {
    match.sWins += 1;
    const bonus = ECONOMY.lossBaseReward + Math.min(ECONOMY.maxLossStreak, match.vLossStreak) * ECONOMY.lossStreakBonus;
    match.vLossStreak += 1;
    match.cash = Math.min(ECONOMY.maxCash, match.cash + bonus);
    hud.showBanner('SENTINEL WINS ROUND', reason);
  }
}

function syncCamera() {
  if (player.state.alive) {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.set(
      Math.max(-1.46, Math.min(1.46, player.state.pitch + player.state.recoilPitch)),
      player.state.yaw + player.state.recoilYaw,
      0,
      'YXZ'
    );
  } else {
    // Spectate first living Vanguard teammate on death
    const spec = bots.allies.find((a) => a.alive) || bots.enemies.find((e) => e.alive);
    if (spec) {
      camera.position.set(spec.position.x, spec.position.y + 1.9, spec.position.z + 2.4);
      camera.lookAt(spec.position.x, spec.position.y + 1.2, spec.position.z);
    }
  }
  const w = weapons.currentWeaponDef();
  const targetFov = weapons.state.scoped && w?.zoomFov ? w.zoomFov : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
}

function aimAtPoint(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function playerFire(overrideSpread = null) {
  const nade = weapons.currentGrenadeKind();
  if (nade) {
    const kind = weapons.consumeActiveGrenade();
    if (!kind) return;
    camera.getWorldDirection(tmpAimDir);
    tmpEye.copy(camera.position).addScaledVector(tmpAimDir, 0.5);
    utility.throwGrenade(kind, tmpEye, tmpAimDir, 'vanguard');
    hud.setWeaponHud(weapons);
    return;
  }

  const shotInfo = weapons.pullTrigger(random);
  if (!shotInfo) return;
  const { weapon, pitchKick, yawKick } = shotInfo;
  audio.shot(weapon.id, 0);

  if (weapon.category === 'melee') {
    camera.getWorldDirection(tmpAimDir);
    raycaster.set(camera.position, tmpAimDir);
    raycaster.far = weapon.range;
    const hit = raycaster.intersectObjects(bots.hitMeshes, false)[0];
    if (hit && hit.object.userData.bot) {
      const target = hit.object.userData.bot;
      if (target.team !== 'vanguard' && target.alive) {
        const isHead = hit.object.userData.part === 'head';
        const killed = bots.damageBot(target, weapon.damage * (isHead ? weapon.headMult : 1), isHead);
        audio.hit(isHead);
        hud.triggerHitmarker(isHead, killed, shotMode ? 4000 : 140);
        utility.spawnBloodSpark(hit.point);
        if (killed) onPlayerKilledBot(target, weapon, isHead);
      }
    }
    hud.setWeaponHud(weapons);
    return;
  }

  bots.alertNoise(player.state.position, 26, 'vanguard');
  const spread = overrideSpread !== null
    ? overrideSpread
    : weapons.computeSpread(player.groundSpeed(), player.state.crouching, player.state.onGround);

  camera.getWorldDirection(tmpAimDir);
  tmpAimDir.x += (random() - 0.5) * 2 * spread;
  tmpAimDir.y += (random() - 0.5) * 2 * spread;
  tmpAimDir.z += (random() - 0.5) * 2 * spread;
  tmpAimDir.normalize();

  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, tmpAimDir);
  raycaster.far = weapon.range;
  const hits = raycaster.intersectObjects(shootables, false);

  let hitPoint = null;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const bot = h.object.userData.bot;
    if (bot) {
      if (!bot.alive || bot.team === 'vanguard') continue;
      hitPoint = h.point;
      const part = h.object.userData.part;
      const isHead = part === 'head';
      const mult = isHead ? weapon.headMult : part === 'limb' ? 0.75 : 1.0;
      const killed = bots.damageBot(bot, weapon.damage * mult, isHead);
      audio.hit(isHead);
      hud.triggerHitmarker(isHead, killed, shotMode ? 4000 : 140);
      utility.spawnBloodSpark(h.point);
      if (killed) onPlayerKilledBot(bot, weapon, isHead);
      break;
    } else {
      hitPoint = h.point;
      const n = h.face ? h.face.normal : tmpAimDir.clone().negate();
      utility.spawnWallImpact(h.point, n);
      break;
    }
  }

  if (!hitPoint) {
    tmpEnd.copy(camera.position).addScaledVector(tmpAimDir, 45);
    hitPoint = tmpEnd;
  }
  tmpEye.copy(camera.position).addScaledVector(tmpAimDir, 0.55);
  tmpEye.y -= 0.1;
  utility.spawnTracer(tmpEye, hitPoint);
  player.addRecoil(pitchKick, yawKick);
  hud.setWeaponHud(weapons);
}

function onPlayerKilledBot(bot, weapon, isHead) {
  match.kills += 1;
  if (isHead) match.headshots += 1;
  match.cash = Math.min(ECONOMY.maxCash, match.cash + weapon.killReward);
  hud.pushKill('You', bot.name, weapon.name, isHead, 'vanguard');
}

function handleDetonation(kind, pos) {
  const dist = pos.distanceTo(player.state.position);
  if (kind === 'frag') {
    audio.explosion(dist);
    bots.alertNoise(pos, 32, 'none');
    if (player.state.alive && dist < GRENADES.frag.radius) {
      const dmg = GRENADES.frag.maxDamage * (1 - dist / GRENADES.frag.radius);
      player.takeDamage(dmg, false);
      hud.triggerHurt();
    }
    for (let i = 0; i < bots.bots.length; i++) {
      const b = bots.bots[i];
      if (!b.alive) continue;
      const bd = pos.distanceTo(b.position);
      if (bd < GRENADES.frag.radius) {
        const dmg = GRENADES.frag.maxDamage * (1 - bd / GRENADES.frag.radius);
        const killed = bots.damageBot(b, dmg, false);
        if (killed) hud.pushKill('HE-4 Frag', b.name, 'HE-4', false, 'vanguard');
      }
    }
  } else if (kind === 'smoke') {
    audio.smokeHiss(dist);
  } else if (kind === 'flash') {
    audio.flashBang(dist);
    bots.blindNear(pos, GRENADES.flash.radius, GRENADES.flash.blindSeconds);
    if (player.state.alive && dist < GRENADES.flash.radius) {
      player.state.flashAlpha = Math.max(player.state.flashAlpha, Math.max(0.25, 1 - dist / GRENADES.flash.radius));
    }
  }
}

const input = createInput(
  renderer.domElement,
  (locked) => {
    if (shotMode) return;
    if (locked) {
      match.started = true;
      hud.showBuyMenu(false, match.cash, weapons, player.state);
      hud.showOverlay(null);
    } else if (!hud.isBuyOpen() && match.phase !== 'MATCH_END') {
      hud.showOverlay(match.started ? 'paused' : 'start');
    }
  },
  (code) => {
    if (shotMode) return;
    if (code === 'KeyB') {
      if (hud.isBuyOpen()) {
        hud.showBuyMenu(false, match.cash, weapons, player.state);
        input.requestLock();
      } else if (canBuyNow()) {
        input.exitLock();
        hud.showOverlay(null);
        hud.showBuyMenu(true, match.cash, weapons, player.state);
      }
      return;
    }
    if (hud.isBuyOpen() || !input.isLocked()) return;
    if (code === 'Digit1') weapons.selectSlot(0);
    else if (code === 'Digit2') weapons.selectSlot(1);
    else if (code === 'Digit3') weapons.selectSlot(2);
    else if (code === 'Digit4') weapons.selectSlot(3);
    else if (code === 'Digit5') weapons.selectSlot(4);
    else if (code === 'KeyR' && weapons.startReload()) audio.reload();
    else if (code === 'Scope') weapons.toggleScope();
    else if (code === 'KeyG' && match.phase === 'BUY_FREEZE') match.phaseTimer = 0.05;
    hud.setWeaponHud(weapons);
  }
);

hud.onPlay(() => {
  if (shotMode) return;
  audio.unlock();
  if (match.phase === 'MATCH_END') startRound(1, true);
  input.requestLock();
});

hud.onBuy(handleBuy);
hud.onBuyClose(() => {
  hud.showBuyMenu(false, match.cash, weapons, player.state);
  input.requestLock();
});

function simStep(dt) {
  match.elapsed += dt;
  world.animateBeacons(match.elapsed);

  const wDef = weapons.currentWeaponDef();
  const moveMult = wDef ? wDef.moveSpeedMult : 1.0;
  const isFreeze = match.phase === 'BUY_FREEZE' || hud.isBuyOpen();

  player.step(dt, input.keys, moveMult, isFreeze, (crouching) => {
    audio.footstep(crouching);
    bots.alertNoise(player.state.position, 13, 'vanguard');
  });

  weapons.step(dt, input.isFiring(), player.groundSpeed());

  if (match.phase === 'BUY_FREEZE') {
    match.phaseTimer -= dt;
    if (match.phaseTimer <= 0) {
      match.phase = 'LIVE';
      match.phaseTimer = MATCH_RULES.roundSeconds;
      audio.beep(1040, 0.14, 0.12);
    }
  } else if (match.phase === 'LIVE') {
    if (match.buyWindowLeft > 0) match.buyWindowLeft = Math.max(0, match.buyWindowLeft - dt);
    match.phaseTimer -= dt;
    if (match.phaseTimer <= 0) {
      finishRound('sentinel', 'Round timer expired');
    }
  } else if (match.phase === 'PLANTED') {
    match.bomb.fuse -= dt;
    match.beepTimer -= dt;
    if (match.beepTimer <= 0) {
      audio.beep(match.bomb.fuse < 8 ? 1480 : 1120, 0.06, 0.12);
      match.beepTimer = match.bomb.fuse < 8 ? 0.28 : match.bomb.fuse < 16 ? 0.55 : 0.95;
    }
    if (match.bomb.fuse <= 0) {
      utility.updateChargeProp('carried', match.bomb.position, match.elapsed, 0);
      audio.explosion(0);
      finishRound('vanguard', `Core Charge detonated on Site ${match.bomb.siteId}`);
    }
  } else if (match.phase === 'ROUND_END') {
    match.phaseTimer -= dt;
    if (match.phaseTimer <= 0) {
      if (match.vWins >= MATCH_RULES.roundsToWin || match.sWins >= MATCH_RULES.roundsToWin) {
        match.phase = 'MATCH_END';
        input.exitLock();
        hud.showBanner(null, '');
        const winMode = match.vWins >= MATCH_RULES.roundsToWin ? 'victory' : 'defeat';
        hud.showOverlay(
          winMode,
          `Final Score ${match.vWins} – ${match.sWins} · Kills: ${match.kills} · Headshots: ${match.headshots}`
        );
      } else {
        startRound(match.round + 1, false);
      }
    }
  }

  // Player planting Core Charge
  const site = world.siteAt(player.state.position);
  if (match.phase === 'LIVE' && match.bomb.mode === 'carried' && player.state.alive && site) {
    if (input.keys.has('KeyE')) {
      match.plantProgress += dt / MATCH_RULES.plantSeconds;
      hud.setActionPrompt('', match.plantProgress, `PLANTING AT SITE ${site.id}`);
      if (match.plantProgress >= 1) {
        match.plantProgress = 0;
        match.bomb.mode = 'planted';
        match.bomb.siteId = site.id;
        match.bomb.position.copy(player.state.position);
        match.bomb.position.y = 0;
        match.bomb.fuse = MATCH_RULES.bombFuseSeconds;
        match.phase = 'PLANTED';
        match.cash = Math.min(ECONOMY.maxCash, match.cash + ECONOMY.plantBonus);
        audio.beep(1320, 0.2, 0.15);
        hud.showBanner(`CORE CHARGE PLANTED AT SITE ${site.id}`, 'Defend until detonation!');
        bots.alertNoise(match.bomb.position, 60, 'vanguard');
      }
    } else {
      match.plantProgress = 0;
      hud.setActionPrompt(`Hold [E] to Plant Core Charge (Site ${site.id})`, -1);
    }
  } else {
    match.plantProgress = 0;
    if (match.phase === 'BUY_FREEZE') {
      hud.setActionPrompt('Buy Phase — Press [B] for Armory or [G] to Start', -1);
    } else {
      hud.setActionPrompt('', -1);
    }
  }

  utility.updateChargeProp(match.bomb.mode, match.bomb.position, match.elapsed, match.bomb.fuse);
  utility.step(dt, handleDetonation);

  bots.step(dt, isFreeze, player.state, match.bomb, random, {
    onBotShot(bot, wId) {
      audio.shot(wId, bot.position.distanceTo(player.state.position));
    },
    onPlayerHit(bot, dmg, isHead) {
      const dead = player.takeDamage(dmg, isHead);
      audio.hurt();
      hud.triggerHurt();
      if (dead) {
        hud.pushKill(bot.name, 'You', WEAPONS[bot.weaponId].name, isHead, 'sentinel');
      }
    },
    onBotKill(killer, victim, wName, isHead) {
      hud.pushKill(killer.name, victim.name, wName, isHead, killer.team);
    },
    onBombDefused(bot) {
      match.bomb.mode = 'carried';
      hud.pushKill(bot.name, 'Core Charge', 'Defused', false, 'sentinel');
      finishRound('sentinel', `${bot.name} defused the Core Charge`);
    },
  });

  // Check elimination win conditions
  if (match.phase === 'LIVE' || match.phase === 'PLANTED') {
    const vAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('vanguard');
    const sAlive = bots.aliveCount('sentinel');
    if (sAlive === 0) {
      finishRound('vanguard', 'All Sentinel defenders eliminated');
    } else if (vAlive === 0 && match.phase === 'LIVE') {
      finishRound('sentinel', 'All Vanguard attackers eliminated');
    }
  }

  hud.step(dt);
  syncHud();
}

function syncHud() {
  const vAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('vanguard');
  const sAlive = bots.aliveCount('sentinel');
  const timeVal = match.phase === 'PLANTED' ? match.bomb.fuse : match.phaseTimer;
  const label = match.phase === 'BUY_FREEZE' ? `ROUND ${match.round} · BUY` : `ROUND ${match.round}`;
  hud.setRoundHeader(match.vWins, match.sWins, vAlive, sAlive, timeVal, label, match.phase === 'PLANTED');
  hud.setVitals(player.state.hp, player.state.armor, player.state.hasHelmet, match.cash, world.calloutFor(player.state.position));
  hud.setWeaponHud(weapons);
  hud.setFlashAlpha(player.state.flashAlpha);
  const spread = weapons.computeSpread(player.groundSpeed(), player.state.crouching, player.state.onGround);
  hud.setCrosshairSpread(spread, weapons.state.scoped);
  hud.updateRadar(player.state, bots.bots, match.bomb, utility.smokes);
}

let accumulator = 0;
let lastFrameTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  if (!match.frozen) {
    if (input.isLocked() && !hud.isBuyOpen()) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      if (player.state.alive && input.isFiring() && weapons.readyToFire(true)) {
        playerFire();
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      simStep(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

// Deterministic multi-scenario screenshot capture mode (?shot=combat|mid|buy|plant)
function runDeterministicShot(mode) {
  hud.showOverlay(null);
  startRound(2, false);
  match.vWins = 2;
  match.sWins = 1;
  match.cash = 3550;
  player.state.armor = 100;
  player.state.hasHelmet = true;
  weapons.giveWeapon('ar17');

  if (mode === 'buy') {
    match.phase = 'BUY_FREEZE';
    match.phaseTimer = 4.2;
    player.state.position.set(0.4, 0, 18.8);
    aimAtPoint(new THREE.Vector3(-1.2, 1.4, 8));
    hud.showBuyMenu(true, match.cash, weapons, player.state);
  } else if (mode === 'mid') {
    match.phase = 'LIVE';
    match.phaseTimer = 68;
    weapons.giveWeapon('vektor');
    player.state.position.set(-1.6, 1.2, -0.8);
    bots.enemies[1].position.set(1.2, 0, -9.8);
    bots.enemies[1].yaw = 0.25;
    bots.enemies[1].alertTimer = 4;
    bots.allies[1].position.set(2.2, 0, 3.2);
    bots.allies[1].yaw = 0.15;
    utility.spawnSmokeCloud(new THREE.Vector3(-1.8, 0, -6.4), 4.0, 10);
    aimAtPoint(new THREE.Vector3(1.2, 1.35, -9.8));
    playerFire(0);
    hud.pushKill('You', 'Cobalt', 'Vektor-M45', false, 'vanguard');
  } else if (mode === 'plant') {
    match.phase = 'PLANTED';
    match.bomb.mode = 'planted';
    match.bomb.siteId = 'B';
    match.bomb.position.set(14.8, 0, -6.2);
    match.bomb.fuse = 21.4;
    player.state.position.set(11.8, 0, -3.4);
    bots.enemies[3].position.set(16.6, 0, -10.8);
    bots.enemies[3].yaw = -0.6;
    bots.enemies[3].alertTimer = 4;
    bots.allies[2].position.set(14.0, 0, -1.5);
    bots.allies[2].yaw = 0.2;
    utility.updateChargeProp('planted', match.bomb.position, 0.2, match.bomb.fuse);
    aimAtPoint(new THREE.Vector3(16.6, 1.45, -10.8));
    playerFire(0);
    hud.showBanner('CORE CHARGE PLANTED AT SITE B', 'Defend until detonation!');
    hud.pushKill('Kestrel', 'Glacier', 'Vanguard AR-17', true, 'vanguard');
  } else {
    // Default 'combat': Site A push with headshot & tracer action
    match.phase = 'LIVE';
    match.phaseTimer = 74;
    player.state.position.set(-14.2, 0, 0.8);
    bots.enemies[0].position.set(-14.6, 0, -6.2);
    bots.enemies[0].yaw = 0.1;
    bots.enemies[0].alertTimer = 4;
    bots.enemies[2].position.set(-18.4, 0, -11.4);
    bots.enemies[2].yaw = -0.35;
    bots.enemies[2].alertTimer = 4;
    bots.allies[0].position.set(-11.4, 0, -2.8);
    bots.allies[0].yaw = 0.35;
    for (let i = 0; i < bots.bots.length; i++) {
      bots.bots[i].model.root.position.copy(bots.bots[i].position);
      bots.bots[i].model.root.rotation.y = bots.bots[i].yaw;
    }
    aimAtPoint(new THREE.Vector3(-14.6, 1.54, -6.2));
    playerFire(0);
    hud.pushKill('Dune', 'Rook', 'Vektor-M45', false, 'vanguard');
  }

  for (let i = 0; i < bots.bots.length; i++) {
    bots.bots[i].model.root.position.copy(bots.bots[i].position);
    bots.bots[i].model.root.rotation.y = bots.bots[i].yaw;
  }
  syncHud();
  syncCamera();

  let painted = 0;
  function paintOnce() {
    requestAnimationFrame(paintOnce);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      match.frozen = true;
    }
  }
  requestAnimationFrame(paintOnce);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startRound(1, true);
if (shotMode) {
  runDeterministicShot(shotMode);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
