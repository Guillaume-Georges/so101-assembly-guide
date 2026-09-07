/** Compile data/*.yaml into one JSON bundle for the viewer. Refuses to build invalid data. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadDataset } from './load.js';
import { GENERATED_DIR, REPO_ROOT } from './paths.js';
import { validateAll } from './validate-lib.js';
import { resolveDataset } from './resolve.js';

const problems = validateAll();
if (problems.length) {
  for (const p of problems) console.error(`  ${p.file} ${p.where}: ${p.message}`);
  throw new Error(`refusing to build: ${problems.length} validation problem(s)`);
}
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  /* not a git checkout */
}
const bundle = {
  generated_at: new Date().toISOString(),
  commit,
  ...resolveDataset(loadDataset()).dataset,
};
fs.mkdirSync(GENERATED_DIR, { recursive: true });
const out = path.join(GENERATED_DIR, 'data.json');
fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n');
const n = Object.values(bundle.assemblies).reduce((a, s) => a + s.length, 0);
console.log(`✓ wrote ${path.relative(REPO_ROOT, out)} (${bundle.parts.length} parts, ${n} steps)`);
