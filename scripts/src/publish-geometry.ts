/**
 * Copy the pipeline output into the viewer's public folder, meshopt-compressing every GLB
 * (ADR-0002: geometry delivery is compressed). placements.json is copied verbatim.
 * Run after `uv run so101-pipeline` (pipeline/out is gitignored; viewer/public/geometry is tracked).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './paths.js';

const SRC = path.join(REPO_ROOT, 'pipeline', 'out');
const DST = path.join(REPO_ROOT, 'viewer', 'public', 'geometry');
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'node_modules', '.bin', 'gltf-transform');

if (!fs.existsSync(path.join(SRC, 'placements.json')))
  throw new Error(`no pipeline output in ${SRC}`);
fs.mkdirSync(DST, { recursive: true });
for (const f of fs.readdirSync(DST)) fs.rmSync(path.join(DST, f));
let before = 0;
let after = 0;
for (const f of fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.glb'))
  .sort()) {
  const src = path.join(SRC, f);
  const dst = path.join(DST, f);
  execFileSync(cli, ['meshopt', src, dst, '--level', 'medium'], { stdio: 'pipe' });
  before += fs.statSync(src).size;
  after += fs.statSync(dst).size;
}
fs.copyFileSync(path.join(SRC, 'placements.json'), path.join(DST, 'placements.json'));
console.log(
  `✓ published ${fs.readdirSync(DST).length - 1} GLBs to viewer/public/geometry (${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB, meshopt)`,
);
