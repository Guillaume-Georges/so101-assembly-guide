import { loadDataset } from './load.js';
import { listFlags, validateAll } from './validate-lib.js';

const problems = validateAll();
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p.file} ${p.where}: ${p.message}`);
  process.exit(1);
}
const flags = listFlags(loadDataset());
console.log(`✓ data valid (${flags.length} flagged entries)`);
if (process.argv.includes('--flags'))
  for (const f of flags) console.log(`  ${f.flag.padEnd(13)} ${f.file} ${f.id}`);
