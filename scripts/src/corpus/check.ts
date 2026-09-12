/**
 * Stage 3 (and 4b): the grounding contract over the staging file, against the run dir's threads.
 *   pnpm corpus:check --run <run-dir> [--apply-verdicts]
 * Writes demotions back into the staging file and the pass list to <run>/check-report.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { loadDataset } from '../load.js';
import { SCHEMA_DIR } from '../paths.js';
import { resolveDataset } from '../resolve.js';
import { buildAjv } from '../validate-lib.js';
import { applyVerdicts, checkCandidates, type CheckContext } from './check-lib.js';
import { fetchBlob } from './github.js';
import {
  arg,
  flag,
  loadConfig,
  loadStaging,
  loadThreads,
  readJson,
  saveStaging,
  writeJson,
  STAGING_FILE,
} from './state.js';
import type { CheckReport, Staging, Verdict } from './types.js';

const runDir = arg('run');
if (!runDir) {
  console.error('usage: corpus:check --run <run-dir> [--apply-verdicts]');
  process.exit(2);
}
const date = new Date().toISOString().slice(0, 10);

// Shape first: the miner's output must fit the staging schema before any rule runs.
const validate = buildAjv(SCHEMA_DIR).getSchema(
  'https://so101-assembly-guide/schema/troubleshooting-staging.json',
)!;
const raw = parse(fs.readFileSync(STAGING_FILE, 'utf8')) as Staging;
if (!validate(raw)) {
  console.error('staging file does not fit data/schema/troubleshooting-staging.json:');
  for (const e of validate.errors ?? [])
    console.error(`  ${e.instancePath || '/'} ${e.message} ${JSON.stringify(e.params)}`);
  process.exit(1);
}

const cfg = loadConfig();
const ds = resolveDataset(loadDataset()).dataset;
const staging = loadStaging();
const threads = loadThreads(runDir);
const blobDir = path.join(runDir, 'blobs');
fs.mkdirSync(blobDir, { recursive: true });

// Blob evidence is fetched on demand and cached in the run dir; the check itself stays synchronous.
const blobKey = (o: string, r: string, sha: string, p: string) =>
  path.join(blobDir, `${o}__${r}__${sha}__${p.replace(/[^\w.-]+/g, '_')}.txt`);
const needed = new Set<string>();
for (const c of staging.candidates)
  for (const e of c.evidence ?? []) {
    const m = e.url.match(
      /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([0-9a-f]{40})\/([^#?]+)#L\d+/,
    );
    if (m && !fs.existsSync(blobKey(m[1], m[2], m[3], m[4])))
      needed.add(JSON.stringify([m[1], m[2], m[3], m[4]]));
  }
for (const n of needed) {
  const [o, r, sha, p] = JSON.parse(n) as [string, string, string, string];
  const text = await fetchBlob(o, r, sha, p);
  if (text != null) fs.writeFileSync(blobKey(o, r, sha, p), text);
}

const ctx: CheckContext = {
  config: cfg,
  threads,
  live: ds.troubleshooting,
  stepIds: new Set(
    Object.values(ds.assemblies)
      .flat()
      .map((s) => s.id),
  ),
  partIds: new Set(ds.parts.map((p) => p.id)),
  blob: (o, r, sha, p) =>
    fs.existsSync(blobKey(o, r, sha, p)) ? fs.readFileSync(blobKey(o, r, sha, p), 'utf8') : null,
  date,
};

let report: CheckReport;
if (flag('apply-verdicts')) {
  const prev = readJson<CheckReport>(path.join(runDir, 'check-report.json'));
  const vfile = path.join(runDir, 'verdicts.yaml');
  const verdicts = fs.existsSync(vfile)
    ? ((parse(fs.readFileSync(vfile, 'utf8')) as { verdicts: Verdict[] })?.verdicts ?? [])
    : [];
  report = applyVerdicts(staging.candidates, verdicts, prev, ctx);
} else {
  report = checkCandidates(staging.candidates, ctx);
}
saveStaging(staging);
writeJson(path.join(runDir, 'check-report.json'), report);

console.log(
  `check ${date}: pass ${report.pass.length}, demoted ${report.demoted.length}, needs title ${report.needs_title.length}, duplicates ${report.duplicates.length}, parked ${report.parked.length}`,
);
for (const id of report.pass)
  console.log(
    `  pass ${id}${report.needs_title.includes(id) ? ' (symptom title: gate decides)' : ''}`,
  );
for (const d of report.demoted)
  console.log(`  demoted ${d.id}\n    - ${d.reasons.join('\n    - ')}`);
