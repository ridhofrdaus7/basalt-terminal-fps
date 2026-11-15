// Articulated 3D tactical bots: head/torso/limb hitboxes, raycast + smoke LoS, hearing, pathing, and combat.
import * as THREE from 'three';
import { PALETTE, WEAPONS } from './config.js';

const VANGUARD_NAMES = ['Vesper', 'Kestrel', 'Dune', 'Ochre'];
const SENTINEL_NAMES = ['Cobalt', 'Rook', 'Glacier', 'Vektor'];

function createSoldierModel(team) {
  const root = new THREE.Group();
  const isVanguard = team === 'vanguard';
  const mainCol = isVanguard ? PALETTE.vanguardMain : PALETTE.sentinelMain;
  const trimCol = isVanguard ? PALETTE.vanguardTrim : PALETTE.sentinelTrim;

  const clothMat = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.85, metalness: 0.08 });
  const armorMat = new THREE.MeshStandardMaterial({ color: mainCol, roughness: 0.55, metalness: 0.25 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: '#1f242c', roughness: 0.45, metalness: 0.4 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: trimCol,
    emissive: new THREE.Color(trimCol),
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  const gunMat = new THREE.MeshStandardMaterial({ color: '#1a1e24', roughness: 0.4, metalness: 0.78 });

  function box(w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.12, 0.72, 0);
  const lLegMesh = box(0.15, 0.72, 0.17, clothMat);
  lLegMesh.position.y = -0.36;
  leftLeg.add(lLegMesh);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.12, 0.72, 0);
  const rLegMesh = box(0.15, 0.72, 0.17, clothMat);
  rLegMesh.position.y = -0.36;
  rightLeg.add(rLegMesh);

  // Torso + armor rig (body hitbox)
  const torso = box(0.42, 0.62, 0.26, armorMat);
  torso.position.set(0, 1.05, 0);
  const chestPlate = box(0.36, 0.34, 0.3, clothMat);
  chestPlate.position.set(0, 1.12, 0);

  // Head + visor (head hitbox)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.53, 0);
  const head = box(0.24, 0.26, 0.25, helmetMat);
  const visor = box(0.2, 0.08, 0.04, visorMat);
  visor.position.set(0, 0.02, -0.12);
  headGroup.add(head, visor);

  // Rifle held in front
  const rifleGroup = new THREE.Group();
  rifleGroup.position.set(0.2, 1.14, -0.22);
  const rBody = box(0.07, 0.1, 0.56, gunMat);
  const rBarrel = box(0.035, 0.035, 0.28, gunMat);
  rBarrel.position.set(0, 0.02, -0.36);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.5);
  rifleGroup.add(rBody, rBarrel, muzzle);

  root.add(leftLeg, rightLeg, torso, chestPlate, headGroup, rifleGroup);

  return {
    root,
    leftLeg,
    rightLeg,
    torso,
    head,
    muzzle,
    hitMeshes: [head, torso, lLegMesh, rLegMesh],
    limbs: [lLegMesh, rLegMesh],
  };
}

export function createBotManager(scene, world, utility) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  const tmpEyeA = new THREE.Vector3();
  const tmpEyeB = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpMove = new THREE.Vector3();
  const tmpTracerEnd = new THREE.Vector3();
  const tmpProbe = new THREE.Box3();

  function makeBot(id, name, team, weaponId, role) {
    const model = createSoldierModel(team);
    scene.add(model.root);
    const bot = {
      id,
      name,
      team,
      role, // 'entry', 'mid', 'anchorA', 'anchorB'
      weaponId,
      model,
      position: new THREE.Vector3(),
      yaw: 0,
      hp: 100,
      armor: 50,
      alive: true,
      mag: WEAPONS[weaponId].magSize,
      reloadTimer: 0,
      fireCooldown: 0,
      reactionTimer: 0,
      burstCount: 0,
      route: [],
      routeIndex: 0,
      targetPos: new THREE.Vector3(),
      lastKnownEnemyPos: new THREE.Vector3(),
      hasKnownEnemy: false,
      alertTimer: 0,
      blindTimer: 0,
      stride: 0,
      hitFlash: 0,
      defusing: false,
      defuseProgress: 0,
    };

    model.head.userData.bot = bot;
    model.head.userData.part = 'head';
    model.torso.userData.bot = bot;
    model.torso.userData.part = 'body';
    for (const limb of model.limbs) {
      limb.userData.bot = bot;
      limb.userData.part = 'limb';
    }
    for (const hm of model.hitMeshes) hitMeshes.push(hm);
    bots.push(bot);
    return bot;
  }

  // 3 Vanguard allies (player is 4th Vanguard) + 4 Sentinel opponents
  const allies = [
    makeBot('vg-1', VANGUARD_NAMES[1], 'vanguard', 'ar17', 'entry'),
    makeBot('vg-2', VANGUARD_NAMES[2], 'vanguard', 'vektor', 'mid'),
    makeBot('vg-3', VANGUARD_NAMES[3], 'vanguard', 'ar17', 'entryB'),
  ];
  const enemies = [
    makeBot('sn-1', SENTINEL_NAMES[0], 'sentinel', 'ar17', 'anchorA'),
    makeBot('sn-2', SENTINEL_NAMES[1], 'sentinel', 'vektor', 'mid'),
    makeBot('sn-3', SENTINEL_NAMES[2], 'sentinel', 'dmr7', 'anchorA'),
    makeBot('sn-4', SENTINEL_NAMES[3], 'sentinel', 'ar17', 'anchorB'),
  ];

  function assignRoute(bot, dest) {
    bot.targetPos.copy(dest);
    bot.route = world.findPath(bot.position, dest);
    bot.routeIndex = 0;
  }

  function resetRound(roundNum, rng) {
    const pickSite = rng() < 0.55 ? world.sites[0] : world.sites[1];
    for (let i = 0; i < allies.length; i++) {
      const b = allies[i];
      b.position.copy(world.vanguardSpawns[i + 1]);
      b.yaw = 0;
      b.hp = 100;
      b.armor = roundNum > 1 ? 65 : 0;
      b.alive = true;
      b.weaponId = roundNum === 1 ? 'kestrel' : i === 1 ? 'vektor' : 'ar17';
      b.mag = WEAPONS[b.weaponId].magSize;
      b.reloadTimer = 0;
      b.fireCooldown = 0.3;
      b.reactionTimer = 0.25;
      b.hasKnownEnemy = false;
      b.alertTimer = 0;
      b.blindTimer = 0;
      b.defusing = false;
      b.defuseProgress = 0;
      b.model.root.visible = true;
      b.model.root.position.copy(b.position);
      b.model.root.rotation.set(0, b.yaw, 0);
      const goal = b.role === 'mid' ? new THREE.Vector3(0, 0, -4) : pickSite.plantSpot;
      assignRoute(b, goal);
    }

    const sentinelGoals = [
      new THREE.Vector3(-14.6, 0, -7.2),
      new THREE.Vector3(0, 0, -7.8),
      new THREE.Vector3(-12.5, 0, -10.5),
      new THREE.Vector3(14.6, 0, -7.2),
    ];
    for (let i = 0; i < enemies.length; i++) {
      const b = enemies[i];
      b.position.copy(world.sentinelSpawns[i]);
      b.yaw = Math.PI;
      b.hp = 100;
      b.armor = roundNum > 1 ? 75 : 25;
      b.alive = true;
      b.weaponId = roundNum === 1 ? 'kestrel' : i === 2 ? 'dmr7' : i === 1 ? 'vektor' : 'ar17';
      b.mag = WEAPONS[b.weaponId].magSize;
      b.reloadTimer = 0;
      b.fireCooldown = 0.3;
      b.reactionTimer = 0.26;
      b.hasKnownEnemy = false;
      b.alertTimer = 0;
      b.blindTimer = 0;
      b.defusing = false;
      b.defuseProgress = 0;
      b.model.root.visible = true;
      b.model.root.position.copy(b.position);
      b.model.root.rotation.set(0, b.yaw, 0);
      assignRoute(b, sentinelGoals[i]);
    }
  }

  function hasLineOfSight(fromPos, toPos) {
    tmpEyeA.set(fromPos.x, fromPos.y + 1.48, fromPos.z);
    tmpEyeB.set(toPos.x, toPos.y + 1.42, toPos.z);
    if (utility.blocksSight(tmpEyeA, tmpEyeB)) return false;
    tmpDir.subVectors(tmpEyeB, tmpEyeA);
    const dist = tmpDir.length();
    if (dist < 0.1) return true;
    tmpDir.divideScalar(dist);
    raycaster.set(tmpEyeA, tmpDir);
    raycaster.far = dist - 0.15;
    const wallHits = raycaster.intersectObjects(world.shootables, false);
    return wallHits.length === 0;
  }

  function damageBot(bot, amount, isHead) {
    if (!bot.alive) return false;
    let dmg = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, dmg * 0.35);
      bot.armor = Math.max(0, Math.round(bot.armor - absorbed));
      dmg -= absorbed;
    }
    bot.hp = Math.max(0, Math.round(bot.hp - dmg));
    bot.hitFlash = 0.15;
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.defusing = false;
      bot.model.root.visible = false;
      return true;
    }
    return false;
  }

  function alertNoise(origin, radius, sourceTeam) {
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive || b.team === sourceTeam) continue;
      if (b.position.distanceToSquared(origin) <= radius * radius) {
        b.lastKnownEnemyPos.copy(origin);
        b.hasKnownEnemy = true;
        b.alertTimer = 4.5;
      }
    }
  }

  function blindNear(origin, radius, duration) {
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive) continue;
      if (b.position.distanceTo(origin) <= radius && hasLineOfSight(b.position, origin)) {
        b.blindTimer = Math.max(b.blindTimer, duration);
      }
    }
  }

  function overlapsWorld(x, z) {
    tmpProbe.min.set(x - 0.34, 0.12, z - 0.34);
    tmpProbe.max.set(x + 0.34, 1.7, z + 0.34);
    for (let i = 0; i < world.colliders.length; i++) {
      if (tmpProbe.intersectsBox(world.colliders[i])) return true;
    }
    return false;
  }

  function moveTowards(bot, target, speed, dt) {
    tmpMove.subVectors(target, bot.position);
    tmpMove.y = 0;
    const d = tmpMove.length();
    if (d < 0.08) return false;
    tmpMove.divideScalar(d);
    const nx = bot.position.x + tmpMove.x * speed * dt;
    if (!overlapsWorld(nx, bot.position.z)) bot.position.x = nx;
    const nz = bot.position.z + tmpMove.z * speed * dt;
    if (!overlapsWorld(bot.position.x, nz)) bot.position.z = nz;
    bot.stride += dt * speed * 2.2;
    const swing = Math.sin(bot.stride) * 0.45;
    bot.model.leftLeg.rotation.x = swing;
    bot.model.rightLeg.rotation.x = -swing;
    return true;
  }

  function step(dt, freeze, playerActor, bombState, rng, callbacks) {
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive) continue;

      if (b.fireCooldown > 0) b.fireCooldown -= dt;
      if (b.alertTimer > 0) b.alertTimer -= dt;
      if (b.blindTimer > 0) b.blindTimer -= dt;
      if (b.hitFlash > 0) b.hitFlash -= dt;

      if (b.reloadTimer > 0) {
        b.reloadTimer -= dt;
        if (b.reloadTimer <= 0) {
          b.mag = WEAPONS[b.weaponId].magSize;
        }
      }

      if (freeze) {
        b.model.leftLeg.rotation.x = 0;
        b.model.rightLeg.rotation.x = 0;
        continue;
      }

      // Find nearest visible opposing actor
      let visibleTarget = null;
      let visibleDist = Infinity;
      if (b.blindTimer <= 0) {
        if (b.team !== 'vanguard' && playerActor.alive) {
          const pd = b.position.distanceTo(playerActor.position);
          if (pd < 46 && hasLineOfSight(b.position, playerActor.position)) {
            visibleTarget = {
              isPlayer: true,
              position: playerActor.position,
              eyeY: playerActor.crouching ? 0.95 : 1.48,
            };
            visibleDist = pd;
          }
        }
        for (let j = 0; j < bots.length; j++) {
          const other = bots[j];
          if (!other.alive || other.team === b.team) continue;
          const od = b.position.distanceTo(other.position);
          if (od < visibleDist && od < 46 && hasLineOfSight(b.position, other.position)) {
            visibleTarget = { isPlayer: false, bot: other, position: other.position, eyeY: 1.42 };
            visibleDist = od;
          }
        }
      }

      if (visibleTarget) {
        b.defusing = false;
        b.lastKnownEnemyPos.copy(visibleTarget.position);
        b.hasKnownEnemy = true;
        b.alertTimer = 5.0;
        const dx = visibleTarget.position.x - b.position.x;
        const dz = visibleTarget.position.z - b.position.z;
        const targetYaw = Math.atan2(-dx, -dz);
        b.yaw = targetYaw;

        // Tactical stop-to-shoot: pause movement at medium range when firing bursts
        if (visibleDist > 16 && b.burstCount === 0) {
          moveTowards(b, visibleTarget.position, 2.2, dt);
        } else {
          b.model.leftLeg.rotation.x = 0;
          b.model.rightLeg.rotation.x = 0;
        }

        if (b.reactionTimer > 0) {
          b.reactionTimer -= dt;
        } else if (b.reloadTimer <= 0 && b.fireCooldown <= 0) {
          if (b.mag <= 0) {
            b.reloadTimer = WEAPONS[b.weaponId].reloadTime;
            b.burstCount = 0;
          } else {
            const w = WEAPONS[b.weaponId];
            b.mag -= 1;
            b.fireCooldown = w.fireRate * (b.weaponId === 'vektor' ? 1.35 : 1.9);
            b.burstCount = (b.burstCount + 1) % 4;

            tmpEyeA.set(b.position.x, b.position.y + 1.46, b.position.z);
            tmpEyeB.set(visibleTarget.position.x, visibleTarget.position.y + visibleTarget.eyeY - 0.15, visibleTarget.position.z);
            tmpDir.subVectors(tmpEyeB, tmpEyeA).normalize();
            const inaccuracy = 0.042 + Math.min(0.05, visibleDist * 0.0012);
            tmpDir.x += (rng() - 0.5) * inaccuracy;
            tmpDir.y += (rng() - 0.5) * inaccuracy * 0.7;
            tmpDir.z += (rng() - 0.5) * inaccuracy;
            tmpDir.normalize();

            tmpTracerEnd.copy(tmpEyeA).addScaledVector(tmpDir, Math.min(visibleDist, 32));
            utility.spawnTracer(tmpEyeA, tmpTracerEnd);
            if (callbacks.onBotShot) callbacks.onBotShot(b, w.id);

            // Accuracy check against target
            const hitChance = Math.max(0.14, 0.62 - visibleDist * 0.012);
            if (rng() < hitChance) {
              const isHead = rng() < 0.16;
              const rawDmg = w.damage * (isHead ? 1.8 : 0.72);
              if (visibleTarget.isPlayer) {
                if (callbacks.onPlayerHit) callbacks.onPlayerHit(b, rawDmg, isHead);
              } else {
                const killed = damageBot(visibleTarget.bot, rawDmg, isHead);
                if (killed && callbacks.onBotKill) callbacks.onBotKill(b, visibleTarget.bot, w.name, isHead);
              }
            }
          }
        }
      } else {
        b.reactionTimer = 0.24;
        b.burstCount = 0;

        // Objective logic: Sentinel rotates to planted bomb & defuses; Vanguard converges/defends
        if (b.team === 'sentinel' && bombState.mode === 'planted') {
          const distToBomb = b.position.distanceTo(bombState.position);
          if (distToBomb < 1.85) {
            b.defusing = true;
            b.defuseProgress += dt;
            b.model.leftLeg.rotation.x = 0;
            b.model.rightLeg.rotation.x = 0;
            if (b.defuseProgress >= bombState.defuseSeconds) {
              if (callbacks.onBombDefused) callbacks.onBombDefused(b);
            }
          } else {
            b.defusing = false;
            if (b.targetPos.distanceToSquared(bombState.position) > 4) {
              assignRoute(b, bombState.position);
            }
            followRoute(b, 4.1, dt);
          }
        } else if (b.alertTimer > 0 && b.hasKnownEnemy) {
          const dx = b.lastKnownEnemyPos.x - b.position.x;
          const dz = b.lastKnownEnemyPos.z - b.position.z;
          b.yaw = Math.atan2(-dx, -dz);
          if (b.position.distanceTo(b.lastKnownEnemyPos) > 2.2) {
            moveTowards(b, b.lastKnownEnemyPos, 3.6, dt);
          } else {
            b.model.leftLeg.rotation.x = 0;
            b.model.rightLeg.rotation.x = 0;
          }
        } else {
          followRoute(b, 3.85, dt);
        }
      }

      b.model.root.position.copy(b.position);
      b.model.root.rotation.y = b.yaw;
    }
  }

  function followRoute(bot, speed, dt) {
    if (bot.route.length === 0 || bot.routeIndex >= bot.route.length) {
      bot.model.leftLeg.rotation.x = 0;
      bot.model.rightLeg.rotation.x = 0;
      return;
    }
    const wp = bot.route[bot.routeIndex];
    const dx = wp.x - bot.position.x;
    const dz = wp.z - bot.position.z;
    if (dx * dx + dz * dz < 0.75) {
      bot.routeIndex += 1;
      return;
    }
    bot.yaw = Math.atan2(-dx, -dz);
    moveTowards(bot, wp, speed, dt);
  }

  function aliveCount(team) {
    let n = 0;
    for (let i = 0; i < bots.length; i++) if (bots[i].alive && bots[i].team === team) n++;
    return n;
  }

  return {
    bots,
    allies,
    enemies,
    hitMeshes,
    resetRound,
    damageBot,
    alertNoise,
    blindNear,
    step,
    aliveCount,
  };
}
