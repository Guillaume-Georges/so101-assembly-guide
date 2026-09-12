/**
 * Stage 6 gate: pull entries back out of the promotion after Guillaume deselects them.
 *   pnpm corpus:hold --run <run-dir> --ids a,b
 * The entry leaves data/troubleshooting.yaml, the candidate returns to staging with a held note,
 * the PR body is regenerated. The slug was never published, so it is not retired.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { validateAll } from '../validate-lib.js';
import { prBody } from './promote-lib.js';
import {
  arg,
  loadConfig,
  loadStaging,
  readJson,
  saveStaging,
  writeJson,
  LIVE_FILE,
} from './state.js';
import type { Candidate, CheckReport, FetchReport, PromotedEntry } from './types.js';

const runDir = arg('run');
const ids = (arg('ids', '') ?? '').split(',').filter(Boolean);
if (!runDir || ids.length === 0) {
  console.error('usage: corpus:hold --run <run-dir> --ids a,b');
  process.exit(2);
}
const date = new Date().toISOString().slice(0, 10);
const promoted = readJson<PromotedEntry[]>(path.join(runDir, 'promoted.json'));
const check = readJson<CheckReport>(path.join(runDir, 'check-report.json'));
const fetchReport = fs.existsSync(path.join(runDir, 'fetch-report.json'))
  ? readJson<FetchReport>(path.join(runDir, 'fetch-report.json'))
  : null;
const cfg = loadConfig();
const staging = loadStaging();

const doc = parseDocument(fs.readFileSync(LIVE_FILE, 'utf8'));
const seq = doc.contents as unknown as { items: { get: (k: string) => unknown }[] };
const keep: PromotedEntry[] = [];
for (const p of promoted) {
  if (!ids.includes(p.issue.id)) {
    keep.push(p);
    continue;
  }
  const idx = seq.items.findIndex((n) => n.get('id') === p.issue.id);
  if (idx >= 0) seq.items.splice(idx, 1);
  const back: Candidate = {
    id: p.issue.id,
    title: p.issue.title,
    aliases: p.issue.aliases,
    symptoms: p.issue.symptoms,
    cause: p.issue.cause,
    fix: p.issue.fix,
    related_steps: p.issue.related_steps,
    related_parts: p.issue.related_parts,
    source: p.issue.source.filter((s) => !s.quote),
    evidence: p.evidence,
    unverified: true,
    scope: p.issue.stage,
    frequency: p.frequency,
    confidence: 'confirmed',
    review_notes: `[gate ${date}] held by Guillaume; re-run promote with --allow to publish`,
    held: date,
  };
  staging.candidates.push(back);
}
fs.writeFileSync(LIVE_FILE, doc.toString({ lineWidth: 120 }));
saveStaging(staging);
const problems = validateAll();
if (problems.length) {
  for (const p of problems) console.error(`  ${p.file} ${p.where}: ${p.message}`);
  process.exit(1);
}
writeJson(path.join(runDir, 'promoted.json'), keep);
const meta = { models: cfg.models, prompt_shas: { mine: '', falsify: '' } };
fs.writeFileSync(
  path.join(runDir, 'pr-body.md'),
  prBody(path.basename(runDir), keep, check, fetchReport, staging.candidates, meta),
);
console.log(`held ${ids.join(', ')}; ${keep.length} still promoted`);
