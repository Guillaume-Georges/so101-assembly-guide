/**
 * Stage 5: publish what survived, keep the proof, update the ledger, write the PR body.
 *   pnpm corpus:promote --run <run-dir> [--cap N] [--no-archive] [--allow-symptom-titles id,id] [--reverify]
 * Writes data/troubleshooting.yaml, the staging file and corpus-state.json, then validates; on a
 * validation failure every file is restored and the run stops.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { loadDataset } from '../load.js';
import { validateAll } from '../validate-lib.js';
import { archiveUrl } from './github.js';
import { prBody, toIssue, uniqueSlug } from './promote-lib.js';
import {
  arg,
  flag,
  loadConfig,
  loadStaging,
  loadState,
  readJson,
  saveStaging,
  saveState,
  writeJson,
  LIVE_FILE,
  PROMPTS_DIR,
  STAGING_FILE,
  STATE_FILE,
} from './state.js';
import { parseIssueUrl, sha256 } from './text.js';
import type { CheckReport, CorpusState, FetchReport, PromotedEntry } from './types.js';

const runDir = arg('run');
if (!runDir) {
  console.error(
    'usage: corpus:promote --run <run-dir> [--cap N] [--no-archive] [--allow-symptom-titles id,id]',
  );
  process.exit(2);
}
const cfg = loadConfig();
const cap = Number(arg('cap', String(cfg.cap)));
const allowSymptom = new Set((arg('allow-symptom-titles', '') ?? '').split(',').filter(Boolean));
const run = path.basename(runDir);
const retrieved = new Date().toISOString().slice(0, 10);
const check = readJson<CheckReport>(path.join(runDir, 'check-report.json'));
const fetchReport = fs.existsSync(path.join(runDir, 'fetch-report.json'))
  ? readJson<FetchReport>(path.join(runDir, 'fetch-report.json'))
  : null;
const staging = loadStaging();
const state = loadState();
const nextState: CorpusState = fs.existsSync(path.join(runDir, 'corpus-state.next.json'))
  ? readJson<CorpusState>(path.join(runDir, 'corpus-state.next.json'))
  : structuredClone(state);
const live = loadDataset().troubleshooting;

const backups = new Map<string, string>();
for (const f of [LIVE_FILE, STAGING_FILE, STATE_FILE]) backups.set(f, fs.readFileSync(f, 'utf8'));
const restore = () => {
  for (const [f, s] of backups) fs.writeFileSync(f, s);
};

// Eligible, most-reported first, capped.
const passing = new Set(check.pass);
const eligible = staging.candidates
  .filter(
    (c) =>
      passing.has(c.id) &&
      c.confidence === 'confirmed' &&
      !c.held &&
      cfg.v1_scopes.includes(c.scope),
  )
  .filter((c) => c.title_kind !== 'symptom' || allowSymptom.has(c.id))
  .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
  .slice(0, cap);

const taken = new Set<string>([...live.map((l) => l.slug), ...state.retired_slugs]);
const liveIds = new Set(live.map((l) => l.id));
const promoted: PromotedEntry[] = [];
const doc = parseDocument(fs.readFileSync(LIVE_FILE, 'utf8'));
const promptSha = (n: string) =>
  fs.existsSync(path.join(PROMPTS_DIR, n))
    ? sha256(fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8'))
    : 'missing';
const meta = {
  models: cfg.models,
  prompt_shas: { mine: promptSha('mine.md'), falsify: promptSha('falsify.md') },
};

for (const c of eligible) {
  if (liveIds.has(c.id)) {
    console.error(`skip ${c.id}: a live entry already has this id`);
    continue;
  }
  const firstIssue = c.source.map((s) => parseIssueUrl(s.ref)).find(Boolean)?.number;
  const slug = uniqueSlug(c.title, taken, firstIssue);
  taken.add(slug);
  const archived = new Map<string, string>();
  if (!flag('no-archive'))
    for (const e of c.evidence ?? []) {
      const a = await archiveUrl(e.url);
      if (a) archived.set(e.url, a);
      else console.error(`archive failed (kept without archived): ${e.url}`);
    }
  const issue = toIssue(c, slug, retrieved, archived);
  doc.contents = doc.contents ?? parseDocument('[]').contents;
  (doc.contents as unknown as { add: (v: unknown) => void }).add(doc.createNode(issue));
  const falsifier =
    (c.review_notes ?? '')
      .split('\n')
      .filter((l) => l.startsWith('[falsify'))
      .pop() ?? 'keep (no verdict line)';
  promoted.push({
    issue,
    from: c.source
      .map((s) => parseIssueUrl(s.ref)?.key)
      .filter(Boolean)
      .join(', '),
    frequency: c.frequency ?? 0,
    falsifier,
    evidence: c.evidence ?? [],
  });
  for (const t of fetchReport?.threads ?? [])
    if (
      t.cited_by.includes(`staged:${c.id}`) ||
      (c.source ?? []).some((s) => parseIssueUrl(s.ref)?.key === t.key)
    )
      nextState.ledger[t.key] = {
        content_sha256: '',
        decision: `promoted:${c.id}`,
        prompt_sha: meta.prompt_shas.mine,
        model: cfg.models.mine,
        run,
      };
}
const promotedIds = new Set(promoted.map((p) => p.issue.id));
staging.candidates = staging.candidates.filter((c) => !promotedIds.has(c.id));

// Ledger for every thread the run looked at and did not promote from.
const decisions = fs.existsSync(path.join(runDir, 'mine-decisions.json'))
  ? readJson<Record<string, { decision: string; reason?: string }>>(
      path.join(runDir, 'mine-decisions.json'),
    )
  : {};
for (const t of fetchReport?.threads ?? []) {
  if (nextState.ledger[t.key]?.run === run) continue;
  const d = decisions[t.key];
  const stagedFor = staging.candidates.find((c) =>
    c.source.some((s) => parseIssueUrl(s.ref)?.key === t.key),
  );
  const decision =
    d?.decision ??
    (stagedFor
      ? `new:${stagedFor.id}`
      : t.status === 'unchanged'
        ? (state.ledger[t.key]?.decision ?? 'ignored:unchanged')
        : 'ignored:no candidate');
  nextState.ledger[t.key] = {
    content_sha256: '',
    decision,
    reason: d?.reason,
    prompt_sha: meta.prompt_shas.mine,
    model: cfg.models.mine,
    run,
  };
}
for (const t of Object.values(fetchReport?.threads ?? [])) {
  const f = path.join(runDir, 'threads', t.key.replace('/', '__').replace('#', '__') + '.json');
  if (fs.existsSync(f) && nextState.ledger[t.key])
    nextState.ledger[t.key].content_sha256 = readJson<{ content_sha256: string }>(f).content_sha256;
}

fs.writeFileSync(LIVE_FILE, doc.toString({ lineWidth: 120 }));
saveStaging(staging);
saveState(nextState);
const problems = validateAll();
if (problems.length) {
  restore();
  console.error(`✗ validation failed after promotion; files restored:`);
  for (const p of problems) console.error(`  ${p.file} ${p.where}: ${p.message}`);
  process.exit(1);
}
writeJson(path.join(runDir, 'promoted.json'), promoted);
fs.writeFileSync(
  path.join(runDir, 'pr-body.md'),
  prBody(run, promoted, check, fetchReport, staging.candidates, meta),
);
console.log(
  `promote ${run}: ${promoted.length} promoted (cap ${cap}), ${staging.candidates.length} left in staging`,
);
for (const p of promoted) console.log(`  ${p.issue.id} → /so101/troubleshooting/${p.issue.slug}/`);
