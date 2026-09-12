/**
 * Stage 1: pull the threads a run needs into a run dir, outside the tree.
 *   pnpm corpus:fetch --out <run-dir> [--backlog] [--since ISO]
 * Threads of interest = the delta since the watermark (minus overlap), every thread a live entry
 * cites (drift), and every thread an in-scope staged candidate cites (new comments can confirm a
 * held candidate). Comment bodies stay in the run dir; only hashes reach data/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadDataset } from '../load.js';
import {
  fetchThread,
  getComment,
  getIssueStub,
  listIssues,
  searchIssues,
  type IssueStub,
} from './github.js';
import { arg, flag, loadConfig, loadState, loadStaging, threadFile, writeJson } from './state.js';
import { parseIssueUrl, trigramSimilarity } from './text.js';
import type { Drift, FetchReport, Thread } from './types.js';

const out = arg('out');
if (!out) {
  console.error('usage: corpus:fetch --out <run-dir> [--backlog] [--since ISO]');
  process.exit(2);
}
const backlog = flag('backlog');
const cfg = loadConfig();
const state = loadState();
const staging = loadStaging();
const ds = loadDataset();
const retrieved = new Date().toISOString().slice(0, 10);
const run = path.basename(out);
fs.mkdirSync(path.join(out, 'threads'), { recursive: true });

const minusDays = (iso: string, d: number) =>
  new Date(new Date(iso).getTime() - d * 86400e3).toISOString();

type Want = {
  key: string;
  owner: string;
  repo: string;
  number: number;
  cited_by: string[];
  stub?: IssueStub;
};
const wanted = new Map<string, Want>();
const want = (url: string, by: string, stub?: IssueStub) => {
  const p = parseIssueUrl(url);
  if (!p) return;
  const w = wanted.get(p.key) ?? {
    key: p.key,
    owner: p.owner,
    repo: p.repo,
    number: p.number,
    cited_by: [],
  };
  if (!w.cited_by.includes(by)) w.cited_by.push(by);
  if (stub) w.stub = stub;
  wanted.set(p.key, w);
};

// a. delta
let delta = 0;
if (!backlog) {
  for (const s of cfg.sources) {
    const wm = arg('since') ?? state.watermarks[`${s.owner}/${s.repo}`] ?? '2020-01-01T00:00:00Z';
    const since = minusDays(wm, cfg.overlap_days);
    const stubs =
      s.mode === 'search'
        ? await searchIssues(s.owner, s.repo, s.query ?? '', since)
        : await listIssues(s.owner, s.repo, since, s.mode === 'label' ? s.label : undefined);
    for (const st of stubs) {
      want(st.url, 'delta', st);
      delta++;
    }
  }
}
// b. cited by live entries
let citedLive = 0;
for (const t of ds.troubleshooting)
  for (const s of t.source)
    if (parseIssueUrl(s.ref)) {
      want(s.ref, `live:${t.id}`);
      citedLive++;
    }
// c. cited by in-scope staged candidates (held or not: new comments may confirm them)
let citedStaged = 0;
for (const c of staging.candidates) {
  if (!cfg.v1_scopes.includes(c.scope)) continue;
  for (const s of c.source)
    if (parseIssueUrl(s.ref)) {
      want(s.ref, `staged:${c.id}`);
      citedStaged++;
    }
  for (const e of c.evidence ?? []) if (parseIssueUrl(e.url)) want(e.url, `staged:${c.id}`);
}

// Fetch, skipping threads whose updated_at matches what the ledger last judged.
const report: FetchReport = {
  run,
  retrieved,
  backlog,
  counts: {
    delta,
    cited_live: citedLive,
    cited_staged: citedStaged,
    fetched: 0,
    unchanged: 0,
    new: 0,
    updated: 0,
  },
  threads: [],
  drift: [],
};
const fetched = new Map<string, Thread>();
for (const w of wanted.values()) {
  const stub = w.stub ?? (await getIssueStub(w.owner, w.repo, w.number));
  if (!stub) {
    report.drift.push({
      entry: w.cited_by.join(','),
      ref: `https://github.com/${w.owner}/${w.repo}/issues/${w.number}`,
      kind: 'deleted',
      detail: 'issue returns 404',
    });
    continue;
  }
  const led = state.ledger[w.key];
  const seenUpdated = Object.entries(state.index)
    .filter(([k]) => k.startsWith(`${w.key}/`))
    .map(([, v]) => v.updated_at)
    .sort()
    .pop();
  const status: 'new' | 'updated' | 'unchanged' =
    !led && !seenUpdated
      ? 'new'
      : seenUpdated && stub.updated_at <= seenUpdated
        ? 'unchanged'
        : 'updated';
  if (status === 'unchanged' && !flag('refetch')) {
    report.counts.unchanged++;
    report.threads.push({
      key: w.key,
      url: stub.url,
      title: stub.title,
      status,
      cited_by: w.cited_by,
    });
    continue;
  }
  const th = await fetchThread(w.owner, w.repo, w.number, retrieved);
  if (!th) continue;
  fs.writeFileSync(threadFile(out, w.key), JSON.stringify(th, null, 2));
  fetched.set(w.key, th);
  report.counts.fetched++;
  report.counts[status === 'new' ? 'new' : 'updated']++;
  report.threads.push({ key: w.key, url: th.url, title: th.title, status, cited_by: w.cited_by });
  if (
    led &&
    led.content_sha256 !== th.content_sha256 &&
    w.cited_by.some((b) => b.startsWith('live:'))
  )
    report.drift.push({
      entry: w.cited_by.filter((b) => b.startsWith('live:')).join(','),
      ref: th.url,
      kind: 'new-comments',
      detail: `thread changed since the ledger judged it (${led.decision})`,
    });
}

// Drift on the exact comments live entries cite.
const drift: Drift[] = [];
for (const t of ds.troubleshooting)
  for (const s of t.source) {
    const p = parseIssueUrl(s.ref);
    if (!p || p.comment === 0) continue;
    const th = fetched.get(p.key);
    const cm =
      th?.comments.find((c) => c.id === p.comment) ??
      (th ? null : await getComment(p.owner, p.repo, p.comment));
    if (cm === null)
      drift.push({ entry: t.id, ref: s.ref, kind: 'deleted', detail: 'comment returns 404' });
    else if (cm && s.body_sha256 && cm.body_sha256 !== s.body_sha256)
      drift.push({
        entry: t.id,
        ref: s.ref,
        kind: 'edited',
        detail: `body changed since quoted (updated ${cm.updated_at})`,
      });
    else if (cm && !s.body_sha256 && s.retrieved && cm.updated_at.slice(0, 10) > s.retrieved)
      drift.push({
        entry: t.id,
        ref: s.ref,
        kind: 'edited',
        detail: `comment updated ${cm.updated_at} after retrieved ${s.retrieved} (no hash on record)`,
      });
  }
report.drift.push(...drift);

// Nearest live entries per fetched thread, for the miner's merge-vs-new and the falsifier.
const nearest: Record<string, { id: string; title: string; score: number }[]> = {};
for (const th of fetched.values()) {
  nearest[th.key] = ds.troubleshooting
    .map((l) => ({
      id: l.id,
      title: l.title,
      score: Math.max(
        trigramSimilarity(th.title, l.title),
        ...(l.aliases ?? []).map((a) => trigramSimilarity(th.title, a)),
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({ ...x, score: Number(x.score.toFixed(3)) }));
}
writeJson(path.join(out, 'nearest.json'), nearest);

// Next state: watermarks now, index updated for every fetched comment. promote.ts commits it.
const next = structuredClone(state);
if (!backlog)
  for (const s of cfg.sources) next.watermarks[`${s.owner}/${s.repo}`] = new Date().toISOString();
for (const th of fetched.values())
  for (const c of th.comments)
    next.index[`${th.key}/c${c.id}`] = {
      url: c.url,
      updated_at: c.updated_at,
      retrieved,
      body_sha256: c.body_sha256,
    };
writeJson(path.join(out, 'corpus-state.next.json'), next);
writeJson(path.join(out, 'fetch-report.json'), report);

const c = report.counts;
console.log(
  `fetch ${run}: delta ${c.delta}, cited by live ${c.cited_live}, by staged ${c.cited_staged}; fetched ${c.fetched} (${c.new} new, ${c.updated} updated), ${c.unchanged} unchanged; drift ${report.drift.length}`,
);
for (const d of report.drift) console.log(`  drift ${d.kind} ${d.entry} ${d.ref}: ${d.detail}`);
if (c.new + c.updated === 0 && report.drift.length === 0) console.log('NOTHING_NEW');
