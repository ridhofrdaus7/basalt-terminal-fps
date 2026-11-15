// Pooled tracers, wall decals, grenade physics (Frag, Smoke, Flash), smoke LoS occlusion, and Core Charge prop.
import * as THREE from 'three';
import { GRENADES, PALETTE } from './config.js';

export function createUtilitySystem(scene, colliders) {
  const group = new THREE.Group();
  scene.add(group);

  // Pre-allocated pool of 24 bullet tracers
  const tracerPool = [];
  const tracerGeom = new THREE.BoxGeometry(0.025, 0.025, 1.0);
  const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.9 });
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(tracerGeom, tracerMat);
    m.visible = false;
    group.add(m);
    tracerPool.push({ mesh: m, life: 0 });
  }
  let tracerCursor = 0;

  // Pre-allocated pool of 36 bullet impact marks
  const decalPool = [];
  const decalGeom = new THREE.BoxGeometry(0.09, 0.09, 0.02);
  const decalMat = new THREE.MeshBasicMaterial({ color: '#1b1d22' });
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(decalGeom, decalMat);
    m.visible = false;
    group.add(m);
    decalPool.push(m);
  }
  let decalCursor = 0;

  // Pre-allocated pool of 32 impact sparks
  const sparkPool = [];
  const sparkGeom = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffae42' });
  for (let i = 0; i < 32; i++) {
    const m = new THREE.Mesh(sparkGeom, sparkMat);
    m.visible = false;
    group.add(m);
    sparkPool.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
  let sparkCursor = 0;

  // Active thrown grenades
  const grenades = [];
  const nadeGeom = new THREE.SphereGeometry(0.09, 10, 8);
  const nadeMats = {
    frag: new THREE.MeshStandardMaterial({ color: '#3b4e3c', roughness: 0.5, metalness: 0.3 }),
    smoke: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.5, metalness: 0.3 }),
    flash: new THREE.MeshStandardMaterial({ color: '#d8d5cc', roughness: 0.4, metalness: 0.4 }),
  };

  // Active smoke clouds (each blocks LoS!)
  const smokes = [];
  const smokeGeom = new THREE.DodecahedronGeometry(1.5, 1);
  const smokeMat = new THREE.MeshStandardMaterial({
    color: '#c9cfd6',
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
  });

  // Explosion flash sphere
  const blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: '#ff9633', transparent: true, opacity: 0.75 })
  );
  blastMesh.visible = false;
  group.add(blastMesh);
  let blastTimer = 0;

  // 3D Core Charge (Bomb) prop
  const chargeGroup = new THREE.Group();
  const cBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: '#262b33', roughness: 0.45, metalness: 0.6 })
  );
  cBody.position.y = 0.08;
  cBody.castShadow = true;
  const cLedMat = new THREE.MeshBasicMaterial({ color: '#ff3b30' });
  const cLed = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), cLedMat);
  cLed.position.set(0, 0.175, 0);
  const cLight = new THREE.PointLight('#ff3b30', 0, 7);
  cLight.position.set(0, 0.35, 0);
  chargeGroup.add(cBody, cLed, cLight);
  chargeGroup.visible = false;
  group.add(chargeGroup);

  const tmpMid = new THREE.Vector3();
  const tmpDiff = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const tmpProbe = new THREE.Box3();
  const tmpClosest = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();

  function spawnTracer(start, end) {
    const slot = tracerPool[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracerPool.length;
    tmpDiff.subVectors(end, start);
    const len = tmpDiff.length();
    if (len < 0.05) return;
    tmpMid.addVectors(start, end).multiplyScalar(0.5);
    slot.mesh.position.copy(tmpMid);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(end);
    slot.mesh.visible = true;
    slot.life = 0.06;
  }

  function spawnWallImpact(point, normal) {
    const d = decalPool[decalCursor];
    decalCursor = (decalCursor + 1) % decalPool.length;
    d.position.copy(point).addScaledVector(normal, 0.015);
    tmpVec.copy(d.position).add(normal);
    d.lookAt(tmpVec);
    d.visible = true;

    for (let i = 0; i < 3; i++) {
      const s = sparkPool[sparkCursor];
      sparkCursor = (sparkCursor + 1) % sparkPool.length;
      s.mesh.position.copy(point);
      s.vel.set(
        normal.x * 2.4 + (Math.random() - 0.5) * 2.5,
        normal.y * 2.4 + Math.random() * 2.5,
        normal.z * 2.4 + (Math.random() - 0.5) * 2.5
      );
      s.mesh.visible = true;
      s.life = 0.18;
    }
  }

  function spawnBloodSpark(point) {
    for (let i = 0; i < 3; i++) {
      const s = sparkPool[sparkCursor];
      sparkCursor = (sparkCursor + 1) % sparkPool.length;
      s.mesh.position.copy(point);
      s.vel.set((Math.random() - 0.5) * 2.2, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 2.2);
      s.mesh.visible = true;
      s.life = 0.14;
    }
  }

  function throwGrenade(kind, origin, dir, ownerTeam) {
    const def = GRENADES[kind];
    if (!def) return;
    const mesh = new THREE.Mesh(nadeGeom, nadeMats[kind]);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    group.add(mesh);
    const vel = dir.clone().multiplyScalar(15.5);
    vel.y += 3.2;
    grenades.push({
      kind,
      mesh,
      pos: mesh.position,
      vel,
      fuse: def.fuse,
      ownerTeam,
    });
  }

  function spawnSmokeCloud(center, radius, duration) {
    const cloud = new THREE.Group();
    cloud.position.copy(center);
    const offsets = [
      [0, 1.1, 0, 1.15],
      [-1.3, 0.9, 0.8, 0.95],
      [1.3, 0.9, -0.7, 0.95],
      [0.4, 1.5, 1.2, 0.9],
      [-0.6, 1.4, -1.2, 0.9],
      [0, 2.2, 0, 0.85],
    ];
    for (const [ox, oy, oz, sc] of offsets) {
      const puff = new THREE.Mesh(smokeGeom, smokeMat);
      puff.position.set(ox, oy, oz);
      puff.scale.setScalar(sc);
      cloud.add(puff);
    }
    group.add(cloud);
    smokes.push({ group: cloud, center: center.clone(), radius, timer: duration, maxTimer: duration });
  }

  function blocksSight(a, b) {
    if (smokes.length === 0) return false;
    tmpDiff.subVectors(b, a);
    const lenSq = tmpDiff.lengthSq();
    if (lenSq < 0.0001) return false;
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      tmpVec.subVectors(s.center, a);
      const t = Math.max(0, Math.min(1, tmpVec.dot(tmpDiff) / lenSq));
      tmpClosest.copy(a).addScaledVector(tmpDiff, t);
      const dx = tmpClosest.x - s.center.x;
      const dz = tmpClosest.z - s.center.z;
      const dy = tmpClosest.y - (s.center.y + 1.2);
      if (dx * dx + dz * dz + dy * dy <= s.radius * s.radius * 0.72) return true;
    }
    return false;
  }

  function updateChargeProp(mode, pos, time, fuseRemaining) {
    if (mode === 'carried') {
      chargeGroup.visible = false;
      return;
    }
    chargeGroup.visible = true;
    chargeGroup.position.copy(pos);
    if (mode === 'planted') {
      const freq = fuseRemaining < 8 ? 14 : fuseRemaining < 16 ? 7 : 3;
      const pulse = Math.sin(time * freq) > 0;
      cLed.visible = pulse;
      cLight.intensity = pulse ? 3.2 : 0.2;
      cLedMat.color.set('#ff3b30');
    } else {
      cLed.visible = true;
      cLedMat.color.set(PALETTE.hazardAmber);
      cLight.intensity = 1.1;
    }
  }

  function resetRound() {
    for (let i = 0; i < tracerPool.length; i++) tracerPool[i].mesh.visible = false;
    for (let i = 0; i < decalPool.length; i++) decalPool[i].visible = false;
    for (let i = 0; i < sparkPool.length; i++) sparkPool[i].mesh.visible = false;
    for (let i = grenades.length - 1; i >= 0; i--) group.remove(grenades[i].mesh);
    grenades.length = 0;
    for (let i = smokes.length - 1; i >= 0; i--) group.remove(smokes[i].group);
    smokes.length = 0;
    blastMesh.visible = false;
    blastTimer = 0;
    chargeGroup.visible = false;
  }

  function step(dt, onDetonate) {
    for (let i = 0; i < tracerPool.length; i++) {
      const t = tracerPool[i];
      if (t.mesh.visible) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (let i = 0; i < sparkPool.length; i++) {
      const s = sparkPool[i];
      if (s.mesh.visible) {
        s.life -= dt;
        s.vel.y -= 14 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    if (blastTimer > 0) {
      blastTimer -= dt;
      const p = 1 - Math.max(0, blastTimer / 0.28);
      blastMesh.scale.setScalar(0.8 + p * 5.2);
      if (blastTimer <= 0) blastMesh.visible = false;
    }

    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.timer -= dt;
      s.group.rotation.y += dt * 0.22;
      if (s.timer <= 0) {
        group.remove(s.group);
        smokes.splice(i, 1);
      }
    }

    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.vel.y -= 18 * dt;
      const nextX = g.pos.x + g.vel.x * dt;
      tmpProbe.min.set(nextX - 0.1, g.pos.y - 0.1, g.pos.z - 0.1);
      tmpProbe.max.set(nextX + 0.1, g.pos.y + 0.1, g.pos.z + 0.1);
      let hitX = false;
      for (let c = 0; c < colliders.length; c++) {
        if (tmpProbe.intersectsBox(colliders[c])) { hitX = true; break; }
      }
      if (hitX) g.vel.x *= -0.52;
      else g.pos.x = nextX;

      const nextZ = g.pos.z + g.vel.z * dt;
      tmpProbe.min.set(g.pos.x - 0.1, g.pos.y - 0.1, nextZ - 0.1);
      tmpProbe.max.set(g.pos.x + 0.1, g.pos.y + 0.1, nextZ + 0.1);
      let hitZ = false;
      for (let c = 0; c < colliders.length; c++) {
        if (tmpProbe.intersectsBox(colliders[c])) { hitZ = true; break; }
      }
      if (hitZ) g.vel.z *= -0.52;
      else g.pos.z = nextZ;

      const nextY = g.pos.y + g.vel.y * dt;
      tmpProbe.min.set(g.pos.x - 0.1, nextY - 0.1, g.pos.z - 0.1);
      tmpProbe.max.set(g.pos.x + 0.1, nextY + 0.1, g.pos.z + 0.1);
      let hitY = nextY <= 0.09;
      if (!hitY) {
        for (let c = 0; c < colliders.length; c++) {
          if (tmpProbe.intersectsBox(colliders[c])) { hitY = true; break; }
        }
      }
      if (hitY) {
        if (g.pos.y < 0.09) g.pos.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.42;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      } else {
        g.pos.y = nextY;
      }

      g.fuse -= dt;
      if (g.fuse <= 0) {
        const detPos = g.pos.clone();
        group.remove(g.mesh);
        grenades.splice(i, 1);
        if (g.kind === 'frag') {
          blastMesh.position.copy(detPos);
          blastMesh.scale.setScalar(1);
          blastMesh.visible = true;
          blastTimer = 0.28;
        } else if (g.kind === 'smoke') {
          spawnSmokeCloud(detPos, GRENADES.smoke.radius, GRENADES.smoke.duration);
        }
        if (onDetonate) onDetonate(g.kind, detPos, g.ownerTeam);
      }
    }
  }

  return {
    spawnTracer,
    spawnWallImpact,
    spawnBloodSpark,
    throwGrenade,
    spawnSmokeCloud,
    blocksSight,
    updateChargeProp,
    resetRound,
    step,
    smokes,
  };
}
