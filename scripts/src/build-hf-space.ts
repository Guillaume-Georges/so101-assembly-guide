/** Render the Hugging Face Space from validated data into deploy/hf-space/dist/, ready to upload. */
import fs from 'node:fs';
import path from 'node:path';
import { loadDataset } from './load.js';
import { HF_SPACE_DIR, REPO_ROOT } from './paths.js';
import { validateAll } from './validate-lib.js';
import { resolveDataset } from './resolve.js';
import { renderSpace } from './hf-space.js';

const problems = validateAll();
if (problems.length) {
  for (const p of problems) console.error(`  ${p.file} ${p.where}: ${p.message}`);
  throw new Error(`refusing to build: ${problems.length} validation problem(s)`);
}
const read = (f: string) => fs.readFileSync(path.join(HF_SPACE_DIR, f), 'utf8');
const out = renderSpace(resolveDataset(loadDataset()).dataset, {
  html: read('index.template.html'),
  readme: read('README.template.md'),
});
const dist = path.join(HF_SPACE_DIR, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), out.html);
fs.writeFileSync(path.join(dist, 'README.md'), out.readme);
// The screenshots the page shows (deploy/hf-space/shots/, made by shots.mjs) go up with it.
for (const [, f] of out.html.matchAll(/src="shots\/([^"]+)"/g)) {
  const from = path.join(HF_SPACE_DIR, 'shots', f);
  if (!fs.existsSync(from))
    throw new Error(`hf-space: the page shows shots/${f}, which is missing; run shots.mjs`);
  fs.mkdirSync(path.join(dist, 'shots'), { recursive: true });
  fs.copyFileSync(from, path.join(dist, 'shots', f));
}
console.log(
  `✓ wrote ${path.relative(REPO_ROOT, dist)}/ (${out.shown} steps shown, ${out.held} unverified held back)`,
);
console.log(
  `  upload: hf upload KitSmith/so101-assembly-guide ${path.relative(REPO_ROOT, dist)} . --type space`,
);
