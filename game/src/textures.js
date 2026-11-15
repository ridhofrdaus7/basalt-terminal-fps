// Procedural CanvasTexture generator for crisp, zero-network architectural PBR surfaces.
import * as THREE from 'three';
import { PALETTE } from './config.js';

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function makeTexture(canvas, repeatX = 1, repeatY = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function hashNoise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function makeConcreteTexture(baseHex, lineHex, tileCount = 4, grit = 14) {
  const [c, ctx] = createCanvas(256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const n = (hashNoise(x, y) - 0.5) * grit;
      ctx.fillStyle = n > 0 ? `rgba(255,255,255,${n / 255})` : `rgba(0,0,0,${-n / 255})`;
      ctx.fillRect(x, y, 4, 4);
    }
  }
  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 2;
  const step = 256 / tileCount;
  for (let i = 0; i <= tileCount; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
  return c;
}

function makeCorrugatedTexture(baseHex) {
  const [c, ctx] = createCanvas(256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 6, 0, 3, 256);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, 256, 12);
  ctx.fillRect(0, 244, 256, 12);
  return c;
}

function makeHazardTexture() {
  const [c, ctx] = createCanvas(256, 256);
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = PALETTE.hazardAmber;
  for (let i = -256; i < 512; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i - 232, 256);
    ctx.lineTo(i - 256, 256);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

function makeSitePadTexture(letter, accentHex) {
  const [c, ctx] = createCanvas(512, 512);
  ctx.fillStyle = '#7b746a';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 8) {
    for (let x = 0; x < 512; x += 8) {
      const v = (hashNoise(x, y) - 0.5) * 16;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      ctx.fillRect(x, y, 8, 8);
    }
  }
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 14;
  ctx.setLineDash([28, 16]);
  ctx.strokeRect(20, 20, 472, 472);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(20, 24, 30, 0.35)';
  ctx.beginPath();
  ctx.arc(256, 256, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = accentHex;
  ctx.font = '700 176px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 256, 266);
  return c;
}

function makeCrateTexture(baseHex, trimHex) {
  const [c, ctx] = createCanvas(256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = trimHex;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(242, 242);
  ctx.moveTo(242, 14);
  ctx.lineTo(14, 242);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(30, 30, 196, 196);
  return c;
}

export function createMaterials() {
  const floorTex = makeTexture(makeConcreteTexture(PALETTE.sandFloor, 'rgba(35,39,46,0.18)', 4, 18), 14, 14);
  const wallTex = makeTexture(makeConcreteTexture(PALETTE.concreteLight, 'rgba(35,39,46,0.2)', 2, 16), 2, 1);
  const ochreTex = makeTexture(makeConcreteTexture(PALETTE.ochreWall, 'rgba(35,39,46,0.18)', 2, 14), 2, 1);
  const basaltTex = makeTexture(makeConcreteTexture(PALETTE.basaltDark, 'rgba(255,255,255,0.07)', 2, 20), 2, 1);
  const rustTex = makeTexture(makeCorrugatedTexture(PALETTE.containerRust), 2, 1);
  const tealTex = makeTexture(makeCorrugatedTexture(PALETTE.containerTeal), 2, 1);
  const crateTex = makeTexture(makeCrateTexture('#76624b', '#3f352a'), 1, 1);
  const hazardTex = makeTexture(makeHazardTexture(), 3, 1);
  const padATex = makeTexture(makeSitePadTexture('A', PALETTE.hazardAmber), 1, 1);
  const padBTex = makeTexture(makeSitePadTexture('B', PALETTE.sentinelTrim), 1, 1);

  return {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.04 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.05 }),
    ochre: new THREE.MeshStandardMaterial({ map: ochreTex, roughness: 0.82, metalness: 0.04 }),
    basalt: new THREE.MeshStandardMaterial({ map: basaltTex, roughness: 0.78, metalness: 0.12 }),
    steel: new THREE.MeshStandardMaterial({ color: PALETTE.slateSteel, roughness: 0.48, metalness: 0.62 }),
    rustContainer: new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.56, metalness: 0.42 }),
    tealContainer: new THREE.MeshStandardMaterial({ map: tealTex, roughness: 0.56, metalness: 0.42 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.76, metalness: 0.08 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.62, metalness: 0.15 }),
    padA: new THREE.MeshStandardMaterial({ map: padATex, roughness: 0.82, metalness: 0.08 }),
    padB: new THREE.MeshStandardMaterial({ map: padBTex, roughness: 0.82, metalness: 0.08 }),
    beaconA: new THREE.MeshStandardMaterial({
      color: PALETTE.hazardAmber,
      emissive: new THREE.Color(PALETTE.hazardAmber),
      emissiveIntensity: 1.5,
      roughness: 0.3,
    }),
    beaconB: new THREE.MeshStandardMaterial({
      color: PALETTE.sentinelTrim,
      emissive: new THREE.Color(PALETTE.sentinelTrim),
      emissiveIntensity: 1.5,
      roughness: 0.3,
    }),
  };
}
