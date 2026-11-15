// Entry packager for make.fun threejs-fps-02 (Node 22, standard library + vendored makefun-threejs.ts).
// Copies game/ and screenshots/ into MAKEFUN_OUTPUT_DIR (default /output) and writes dossier.json.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });

const shotsSrc = join(root, 'screenshots');
const shotsDst = join(outDir, 'screenshots');
mkdirSync(shotsDst, { recursive: true });
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, shotsDst, { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
