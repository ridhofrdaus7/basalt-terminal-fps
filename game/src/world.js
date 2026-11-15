// Basalt Terminal: original 3-lane tactical defusal map with sites A & B, Mid connectors, cover, and navgraph.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { createMaterials } from './textures.js';

export function createWorld(scene) {
  const mats = createMaterials();
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const shootables = [];
  const decalsGroup = new THREE.Group();
  scene.add(decalsGroup);

  function addBox(w, h, d, x, y, z, matKey, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[matKey]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.surface = matKey;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function addStairRun(xStart, yTop, zCenter, width, runLen, steps, dirX, matKey) {
    const stepH = yTop / steps;
    const stepW = runLen / steps;
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * stepH;
      const x = xStart + dirX * (i + 0.5) * stepW;
      addBox(stepW + 0.04, h, width, x, h * 0.5, zCenter, matKey, true);
    }
  }

  function addSiteBeacon(x, z, matKey, lightColor) {
    addBox(0.75, 3.2, 0.75, x, 1.6, z, 'basalt', true);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.42, 0.82), mats[matKey]);
    band.position.set(x, 2.75, z);
    group.add(band);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mats[matKey]);
    cap.position.set(x, 3.45, z);
    group.add(cap);
    const pt = new THREE.PointLight(lightColor, 2.8, 12, 1.6);
    pt.position.set(x, 3.6, z);
    group.add(pt);
    return cap;
  }

  // Ground floor + Perimeter walls (48m x 44m playable arena)
  addBox(52, 0.6, 48, 0, -0.3, 0, 'floor', true);
  addBox(1.2, 6.4, 48, -24.6, 3.2, 0, 'wall', true);
  addBox(1.2, 6.4, 48, 24.6, 3.2, 0, 'wall', true);
  addBox(52, 6.4, 1.2, 0, 3.2, -22.6, 'wall', true);
  addBox(52, 6.4, 1.2, 0, 3.2, 22.6, 'wall', true);

  // Outer canyon rim silhouettes for skyline depth (non-colliding visual vista)
  const canyonMeshes = [
    [90, 14, 10, 0, 6, -42, 'basalt'],
    [18, 22, 14, -36, 10, -34, 'ochre'],
    [22, 19, 14, 34, 9, -36, 'ochre'],
    [14, 16, 70, -40, 7, 0, 'basalt'],
    [14, 18, 70, 40, 8, 0, 'basalt'],
    [80, 13, 10, 0, 5.5, 42, 'basalt'],
  ];
  for (const [w, h, d, x, y, z, m] of canyonMeshes) addBox(w, h, d, x, y, z, m, false);

  // Site A & Site B concrete pads (slightly raised flush 0.03m visual markers)
  const padA = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.04, 8.8), mats.padA);
  padA.position.set(-15, 0.02, -7);
  padA.receiveShadow = true;
  group.add(padA);

  const padB = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.04, 8.8), mats.padB);
  padB.position.set(15, 0.02, -7);
  padB.receiveShadow = true;
  group.add(padB);

  // West / Mid Divider along x = -7.5 (openings at z = +5..+10 and z = -12..-7.5, plus spawn behind z = +14)
  addBox(1.0, 4.2, 7.0, -7.5, 2.1, -18.5, 'ochre', true); // z: -22 .. -15
  addBox(1.0, 4.2, 11.5, -7.5, 2.1, -1.25, 'ochre', true); // z: -7 .. +4.5
  addBox(1.0, 4.2, 4.5, -7.5, 2.1, 12.25, 'ochre', true); // z: +10 .. +14.5

  // East / Mid Divider along x = +7.5 (openings at z = +5..+10 and z = -12..-7.5, plus spawn behind z = +14)
  addBox(1.0, 4.2, 7.0, 7.5, 2.1, -18.5, 'ochre', true);
  addBox(1.0, 4.2, 11.5, 7.5, 2.1, -1.25, 'ochre', true);
  addBox(1.0, 4.2, 4.5, 7.5, 2.1, 12.25, 'ochre', true);

  // Overhead steel crossbeams spanning Mid & East Tunnel for tactical visual framing
  addBox(14.5, 0.5, 1.1, 0, 4.4, -1.2, 'steel', false);
  addBox(16.0, 0.6, 1.4, 15.8, 4.5, 4.2, 'steel', false);
  addBox(16.0, 0.6, 1.4, -15.8, 4.5, 4.2, 'steel', false);

  // Attack Spawn (South, z ~ +18.5) cover & lane dividers
  addBox(3.8, 1.25, 0.9, -3.5, 0.625, 15.2, 'hazard', true);
  addBox(3.8, 1.25, 0.9, 3.5, 0.625, 15.2, 'hazard', true);
  addBox(2.2, 2.1, 2.2, -13.5, 1.05, 15.8, 'crate', true);
  addBox(2.2, 2.1, 2.2, 13.5, 1.05, 15.8, 'crate', true);

  // Defense Spawn (North, z ~ -18.5)
  addBox(4.4, 1.4, 1.0, 0, 0.7, -15.2, 'basalt', true);
  addBox(2.0, 1.8, 2.0, -11.5, 0.9, -17.0, 'crate', true);
  addBox(2.0, 1.8, 2.0, 11.5, 0.9, -17.0, 'crate', true);

  // West Lane -> Site A cover (x: -23.5 .. -8.5)
  addBox(5.2, 2.6, 2.3, -18.8, 1.3, 4.2, 'rustContainer', true); // West Main choke block
  addBox(1.6, 1.15, 2.6, -11.2, 0.575, 2.4, 'hazard', true); // Low peek barrier
  addBox(2.2, 2.4, 4.4, -17.2, 1.2, -7.8, 'rustContainer', true); // Site A main container
  addBox(1.5, 1.3, 1.5, -12.4, 0.65, -4.6, 'crate', true); // Site A front crate
  addBox(1.3, 1.1, 1.3, -12.4, 1.85, -4.6, 'crate', true); // Stacked crate on Site A
  addBox(3.0, 1.2, 1.1, -20.8, 0.6, -13.2, 'basalt', true); // Back-site anchor cover

  // Mid Lane ("Foundry Spine") elevated platform + stairs + tactical pillars
  addBox(5.2, 1.2, 3.6, 0, 0.6, -1.2, 'steel', true); // Mid raised platform (y=1.2)
  addStairRun(-5.2, 1.2, -1.2, 3.4, 2.6, 6, 1, 'basalt'); // West ramp up
  addStairRun(5.2, 1.2, -1.2, 3.4, 2.6, 6, -1, 'basalt'); // East ramp up
  addBox(1.4, 2.8, 1.4, 0, 2.6, -1.2, 'basalt', true); // Center pillar on platform
  addBox(2.6, 1.25, 1.2, -2.5, 0.625, 6.8, 'crate', true); // South-mid cover
  addBox(2.6, 1.25, 1.2, 2.5, 0.625, -8.2, 'crate', true); // North-mid cover

  // East Lane -> Site B cover (x: +8.5 .. +23.5)
  addBox(5.2, 2.6, 2.3, 18.8, 1.3, 4.2, 'tealContainer', true); // East Tunnel choke block
  addBox(1.6, 1.15, 2.6, 11.2, 0.575, 2.4, 'hazard', true); // East low barrier
  addBox(2.2, 2.4, 4.4, 17.4, 1.2, -7.2, 'tealContainer', true); // Site B main container
  addBox(1.5, 1.3, 1.5, 12.6, 0.65, -4.8, 'crate', true); // Site B front crate
  addBox(1.5, 2.2, 1.5, 12.6, 1.1, -10.8, 'basalt', true); // Back B pillar
  addBox(3.0, 1.2, 1.1, 20.6, 0.6, -13.2, 'basalt', true); // Back-site B anchor cover

  // Glowing site beacons
  const beaconA = addSiteBeacon(-19.2, -11.4, 'beaconA', PALETTE.hazardAmber);
  const beaconB = addSiteBeacon(19.2, -11.4, 'beaconB', PALETTE.sentinelTrim);

  // Lighting: crisp golden-hour sun + cool sky hemisphere + subtle fill
  const hemi = new THREE.HemisphereLight('#c5d8eb', '#5e5042', 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff2da', 2.35);
  sun.position.set(18, 28, 16);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 75;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight('#9bb8d6', 0.55);
  fill.position.set(-16, 12, -18);
  scene.add(fill);

  // Tactical bomb sites
  const sites = [
    { id: 'A', name: 'Turbine Pad A', center: new THREE.Vector3(-15, 0, -7), radius: 4.3, plantSpot: new THREE.Vector3(-14.6, 0, -7.2) },
    { id: 'B', name: 'Reactor Bay B', center: new THREE.Vector3(15, 0, -7), radius: 4.3, plantSpot: new THREE.Vector3(14.6, 0, -7.2) },
  ];

  // Waypoint graph in open walkable space (for tactical bot pathfinding & callouts)
  const waypoints = [
    { id: 0, name: 'Vanguard Spawn', pos: new THREE.Vector3(0, 0, 18.8), edges: [1, 2, 3] },
    { id: 1, name: 'West Approach', pos: new THREE.Vector3(-14.5, 0, 18.2), edges: [0, 4] },
    { id: 2, name: 'South Mid', pos: new THREE.Vector3(0, 0, 11.4), edges: [0, 5, 6, 7] },
    { id: 3, name: 'East Approach', pos: new THREE.Vector3(14.5, 0, 18.2), edges: [0, 8] },
    { id: 4, name: 'West Main', pos: new THREE.Vector3(-13.6, 0, 8.2), edges: [1, 5, 9] },
    { id: 5, name: 'West Connector', pos: new THREE.Vector3(-5.8, 0, 7.4), edges: [2, 4, 7] },
    { id: 6, name: 'East Connector', pos: new THREE.Vector3(5.8, 0, 7.4), edges: [2, 7, 8] },
    { id: 7, name: 'Mid Spine', pos: new THREE.Vector3(0, 0, 3.6), edges: [2, 5, 6, 11, 12] },
    { id: 8, name: 'East Tunnel', pos: new THREE.Vector3(13.6, 0, 8.2), edges: [3, 6, 13] },
    { id: 9, name: 'Site A Entry', pos: new THREE.Vector3(-14.2, 0, -0.6), edges: [4, 10] },
    { id: 10, name: 'Site A Pad', pos: new THREE.Vector3(-14.6, 0, -7.2), edges: [9, 11, 15] },
    { id: 11, name: 'A-Link', pos: new THREE.Vector3(-5.2, 0, -9.4), edges: [7, 10, 12, 16] },
    { id: 12, name: 'North Mid', pos: new THREE.Vector3(0, 0, -11.4), edges: [7, 11, 14, 16] },
    { id: 13, name: 'Site B Entry', pos: new THREE.Vector3(14.2, 0, -0.6), edges: [8, 14] },
    { id: 14, name: 'Site B Pad', pos: new THREE.Vector3(14.6, 0, -7.2), edges: [12, 13, 17] },
    { id: 15, name: 'A Heaven', pos: new THREE.Vector3(-16.2, 0, -15.4), edges: [10, 16] },
    { id: 16, name: 'Sentinel Spawn', pos: new THREE.Vector3(0, 0, -18.4), edges: [11, 12, 15, 17] },
    { id: 17, name: 'B Heaven', pos: new THREE.Vector3(16.2, 0, -15.4), edges: [14, 16] },
  ];

  function findPath(fromPos, toPos) {
    let startIdx = 0;
    let endIdx = 0;
    let bestStart = Infinity;
    let bestEnd = Infinity;
    for (let i = 0; i < waypoints.length; i++) {
      const ds = waypoints[i].pos.distanceToSquared(fromPos);
      if (ds < bestStart) {
        bestStart = ds;
        startIdx = i;
      }
      const de = waypoints[i].pos.distanceToSquared(toPos);
      if (de < bestEnd) {
        bestEnd = de;
        endIdx = i;
      }
    }
    if (startIdx === endIdx) return [waypoints[endIdx].pos];
    const dist = new Float64Array(waypoints.length).fill(Infinity);
    const prev = new Int32Array(waypoints.length).fill(-1);
    const visited = new Uint8Array(waypoints.length);
    dist[startIdx] = 0;
    for (let step = 0; step < waypoints.length; step++) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < waypoints.length; i++) {
        if (!visited[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u === -1 || u === endIdx) break;
      visited[u] = 1;
      for (const v of waypoints[u].edges) {
        const w = waypoints[u].pos.distanceTo(waypoints[v].pos);
        if (dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w;
          prev[v] = u;
        }
      }
    }
    const route = [];
    let cur = endIdx;
    while (cur !== -1) {
      route.push(waypoints[cur].pos);
      if (cur === startIdx) break;
      cur = prev[cur];
    }
    route.reverse();
    return route;
  }

  function calloutFor(pos) {
    let best = waypoints[0];
    let bestD = Infinity;
    for (const wp of waypoints) {
      const d = wp.pos.distanceToSquared(pos);
      if (d < bestD) {
        bestD = d;
        best = wp;
      }
    }
    return best.name;
  }

  function siteAt(pos) {
    for (const s of sites) {
      const dx = pos.x - s.center.x;
      const dz = pos.z - s.center.z;
      if (dx * dx + dz * dz <= s.radius * s.radius && Math.abs(pos.y) < 1.5) return s;
    }
    return null;
  }

  const vanguardSpawns = [
    new THREE.Vector3(-2.6, 0, 19.2),
    new THREE.Vector3(0, 0, 19.6),
    new THREE.Vector3(2.6, 0, 19.2),
    new THREE.Vector3(-5.0, 0, 18.6),
  ];

  const sentinelSpawns = [
    new THREE.Vector3(-15.5, 0, -16.8),
    new THREE.Vector3(-3.0, 0, -18.8),
    new THREE.Vector3(3.0, 0, -18.8),
    new THREE.Vector3(15.5, 0, -16.8),
  ];

  return {
    group,
    decalsGroup,
    colliders,
    shootables,
    sites,
    waypoints,
    vanguardSpawns,
    sentinelSpawns,
    findPath,
    calloutFor,
    siteAt,
    animateBeacons(time) {
      beaconA.rotation.y = time * 1.4;
      beaconB.rotation.y = -time * 1.4;
    },
  };
}
