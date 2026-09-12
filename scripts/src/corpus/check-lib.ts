/**
 * The grounding contract (ticket §3). Every rule here is one a script can decide; what it cannot
 * decide (did the fix actually work, one variable or three, SO-100 or SO-101) is the falsifier's.
 * A candidate that fails is demoted with the reason, never dropped.
 */
import type { Issue } from '../load.js';
import {
  containsQuote,
  hostOf,
  missingTokens,
  normalise,
  parseBlobUrl,
  parseIssueUrl,
  shareContentToken,
  slugify,
  wordCount,
} from './text.js';
import type {
  Candidate,
  CheckReport,
  Comment,
  CorpusConfig,
  Evidence,
  Thread,
  Verdict,
} from './types.js';

export type BlobLookup = (owner: string, repo: string, sha: string, path: string) => string | null;

export type CheckContext = {
  config: CorpusConfig;
  threads: Map<string, Thread>;
  live: Issue[];
  stepIds: Set<string>;
  partIds: Set<string>;
  /** Raw file text for blob evidence; check.ts wires a cached network fetch, tests a map. */
  blob: BlobLookup;
  date: string;
};

function findComment(
  threads: Map<string, Thread>,
  url: string,
): { thread: Thread; comment: Comment } | null {
  const p = parseIssueUrl(url);
  if (!p) return null;
  const thread = threads.get(p.key);
  if (!thread) return null;
  const comment = thread.comments.find((c) => c.id === p.comment);
  return comment ? { thread, comment } : null;
}

function isMaintainer(cfg: CorpusConfig, thread: Thread, c: Comment, stage: string): boolean {
  const src = cfg.sources.find((s) => s.owner === thread.owner && s.repo === thread.repo);
  if (!src) return false;
  return (
    src.maintainer_associations.includes(c.author_association) &&
    src.confirms_stages.includes(stage)
  );
}

function blobText(ctx: CheckContext, url: string): { text: string; lines: string } | null {
  const b = parseBlobUrl(url);
  if (!b) return null;
  const text = ctx.blob(b.owner, b.repo, b.sha, b.path);
  if (text == null) return null;
  const lines = text
    .split('\n')
    .slice(b.from - 1, b.to)
    .join('\n');
  return { text, lines };
}

/** Rules 1, 5 and 6 for one evidence record; fills the derived fields when they check out. */
function checkEvidence(
  ctx: CheckContext,
  ev: Evidence,
  reasons: string[],
): { ok: boolean; thread?: Thread; comment?: Comment } {
  const label = `${ev.role}${ev.fix_index != null ? `[${ev.fix_index}]` : ''}`;
  const n = wordCount(ev.quote);
  const { min, max } = ctx.config.quote_words;
  if (n < min || n > max) {
    reasons.push(`${label}: quote is ${n} words; must be ${min}-${max}`);
    return { ok: false };
  }
  if (parseBlobUrl(ev.url)) {
    const b = blobText(ctx, ev.url);
    if (!b) {
      reasons.push(`${label}: blob not fetched ${ev.url}`);
      return { ok: false };
    }
    if (!containsQuote(b.lines, ev.quote)) {
      reasons.push(`${label}: quote not in lines ${ev.url.split('#')[1]} of ${ev.url}`);
      return { ok: false };
    }
    ev.comment_id = undefined;
    ev.author = 'code';
    ev.author_association = 'CODE';
    return { ok: true };
  }
  const hit = findComment(ctx.threads, ev.url);
  if (!hit) {
    reasons.push(`${label}: comment not in the fetched corpus ${ev.url}`);
    return { ok: false };
  }
  const { thread, comment } = hit;
  if (!containsQuote(comment.body, ev.quote)) {
    reasons.push(`${label}: quote not found verbatim in ${ev.url}`);
    return { ok: false };
  }
  if (ev.body_sha256 && ev.body_sha256 !== comment.body_sha256) {
    reasons.push(`${label}: comment edited since it was quoted ${ev.url}`);
    return { ok: false };
  }
  ev.comment_id = comment.id;
  ev.author = comment.author;
  ev.author_association = comment.author_association;
  ev.created_at = comment.created_at;
  ev.body_sha256 = comment.body_sha256;
  return { ok: true, thread, comment };
}

function titleIsVerbatim(c: Candidate, threads: Map<string, Thread>): boolean {
  const t = normalise(c.title);
  const keys = new Set<string>();
  for (const s of c.source) {
    const p = parseIssueUrl(s.ref);
    if (p) keys.add(p.key);
  }
  for (const e of c.evidence ?? []) {
    const p = parseIssueUrl(e.url);
    if (p) keys.add(p.key);
  }
  for (const k of keys) {
    const th = threads.get(k);
    if (!th) continue;
    if (normalise(th.title).includes(t)) return true;
    for (const cm of th.comments) if (normalise(cm.body).includes(t)) return true;
  }
  return false;
}

export function demote(c: Candidate, date: string, reasons: string[], tag = 'check'): void {
  c.confidence = 'reported';
  c.unverified = true;
  const line = `[${tag} ${date}] ${reasons.join('; ')}`;
  c.review_notes = c.review_notes ? `${c.review_notes}\n${line}` : line;
}

/** Runs the contract over every `confirmed` candidate. Mutates the candidates (enriched evidence, demotions). */
export function checkCandidates(candidates: Candidate[], ctx: CheckContext): CheckReport {
  const cfg = ctx.config;
  const report: CheckReport = {
    run: ctx.date,
    pass: [],
    demoted: [],
    needs_title: [],
    duplicates: [],
    parked: [],
  };
  const liveTitles = new Map<string, string>();
  for (const l of ctx.live) {
    liveTitles.set(normalise(l.title), l.id);
    liveTitles.set(l.slug, l.id);
    for (const a of l.aliases ?? []) liveTitles.set(normalise(a), l.id);
  }
  const seenTitles = new Map<string, string>();

  for (const c of candidates) {
    if (!cfg.v1_scopes.includes(c.scope)) {
      report.parked.push(c.id);
      continue;
    }
    if (c.confidence !== 'confirmed' || c.held) continue;
    const reasons: string[] = [];

    // Rule 11: duplicates against live entries and earlier candidates in this file.
    const nt = normalise(c.title);
    const dupOf = liveTitles.get(nt) ?? liveTitles.get(slugify(c.title)) ?? seenTitles.get(nt);
    if (dupOf && dupOf !== c.id) {
      c.duplicate_of = dupOf;
      report.duplicates.push({ id: c.id, of: dupOf });
      reasons.push(`duplicate title of ${dupOf}`);
    }
    seenTitles.set(nt, c.id);

    // Rule 8: sources.
    for (const s of c.source) {
      const host = hostOf(s.ref);
      if (cfg.blocked_domains.some((d) => host === d || host.endsWith(`.${d}`)))
        reasons.push(`source on a non-citable domain: ${s.ref}`);
      if (/^https?:/.test(s.ref) && !s.retrieved)
        reasons.push(`source without retrieved: ${s.ref}`);
    }
    for (const e of c.evidence ?? []) {
      const host = hostOf(e.url);
      if (cfg.blocked_domains.some((d) => host === d || host.endsWith(`.${d}`)))
        reasons.push(`evidence on a non-citable domain: ${e.url}`);
    }

    // Rule 9: references resolve.
    for (const id of c.related_steps ?? [])
      if (!ctx.stepIds.has(id)) reasons.push(`unknown step ${id}`);
    for (const id of c.related_parts ?? [])
      if (!ctx.partIds.has(id)) reasons.push(`unknown part ${id}`);

    // Rules 1, 5, 6 per evidence; then 2, 3, 4 per claim.
    const ev = c.evidence ?? [];
    if (ev.length === 0) reasons.push('no evidence records');
    const checked = ev.map((e) => ({ e, r: checkEvidence(ctx, e, reasons) }));
    const ok = checked.filter((x) => x.r.ok);
    const causeQuotes = ok.filter((x) => x.e.role === 'cause').map((x) => x.e.quote);
    if (causeQuotes.length === 0) reasons.push('cause has no evidence');
    else {
      const miss = missingTokens(c.cause, causeQuotes);
      if (miss.length) reasons.push(`cause tokens not in its quotes: ${miss.join(', ')}`);
    }
    c.fix.forEach((item, i) => {
      const fixEv = ok.filter((x) => x.e.role === 'fix' && (x.e.fix_index ?? 0) === i);
      const conf = ok.filter((x) => x.e.role === 'confirmation' && (x.e.fix_index ?? 0) === i);
      if (fixEv.length === 0) {
        reasons.push(`fix[${i}] has no evidence`);
        return;
      }
      const miss = missingTokens(
        item,
        fixEv.map((x) => x.e.quote),
      );
      if (miss.length) reasons.push(`fix[${i}] tokens not in its quotes: ${miss.join(', ')}`);
      const codeConfirms = fixEv.some((x) => x.e.author_association === 'CODE');
      if (codeConfirms) return; // upstream code by sha and lines is its own confirmation
      if (conf.length === 0) {
        reasons.push(`fix[${i}] has no confirmation quote`);
        return;
      }
      const fixQuote = fixEv[0];
      const good = conf.some((x) => {
        const th = x.r.thread!;
        const cm = x.r.comment!;
        const reporter = cm.author === th.author;
        const maint = isMaintainer(cfg, th, cm, c.scope);
        if (!reporter && !maint) {
          reasons.push(
            `fix[${i}] confirmation by ${cm.author} (${cm.author_association}) is neither reporter nor maintainer for ${c.scope}`,
          );
          return false;
        }
        if (fixQuote.r.thread && fixQuote.r.thread.key !== th.key) {
          reasons.push(`fix[${i}] confirmation is in another thread (${th.key})`);
          return false;
        }
        if (cm.id === fixQuote.e.comment_id && !maint) {
          reasons.push(`fix[${i}] confirmation is the same comment as the fix (self-confirmation)`);
          return false;
        }
        if (fixQuote.e.created_at && cm.created_at < fixQuote.e.created_at) {
          reasons.push(`fix[${i}] confirmation precedes the fix quote`);
          return false;
        }
        if (cm.id === 0 && !maint) {
          reasons.push(`fix[${i}] confirmation is the opening post`);
          return false;
        }
        if (!shareContentToken(x.e.quote, fixQuote.e.quote)) {
          reasons.push(`fix[${i}] confirmation shares no content word with the fix quote`);
          return false;
        }
        return true;
      });
      if (!good) reasons.push(`fix[${i}] has no confirmation that passes`);
    });

    // Rule 10: title.
    c.title_kind = titleIsVerbatim(c, ctx.threads) ? 'verbatim' : 'symptom';

    if (reasons.length) {
      demote(c, ctx.date, reasons);
      report.demoted.push({ id: c.id, reasons });
    } else {
      report.pass.push(c.id);
      if (c.title_kind === 'symptom') report.needs_title.push(c.id);
    }
  }
  return report;
}

/** Stage 4 output applied: a verdict other than keep demotes; its counter-quote must check like any other quote. */
export function applyVerdicts(
  candidates: Candidate[],
  verdicts: Verdict[],
  report: CheckReport,
  ctx: CheckContext,
): CheckReport {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const passing = new Set(report.pass);
  const out: CheckReport = { ...report, pass: [], verdicts };
  for (const v of verdicts) {
    const c = byId.get(v.id);
    if (!c || !passing.has(v.id)) continue;
    if (v.verdict === 'keep') continue;
    const reasons = [`falsifier: ${v.verdict}${v.into ? ` into ${v.into}` : ''}: ${v.reason}`];
    if (v.counter) {
      const hit = findComment(ctx.threads, v.counter.url);
      if (!hit || !containsQuote(hit.comment.body, v.counter.quote))
        reasons.push('counter-quote not found verbatim; demoted on doubt');
      else reasons.push(`counter-quote ${v.counter.url}`);
    } else if (!v.read) reasons.push('no counter-quote and no read statement; demoted on doubt');
    if (v.verdict === 'merge' && v.into) c.merge_into = v.into;
    demote(c, ctx.date, reasons, 'falsify');
    out.demoted.push({ id: c.id, reasons });
    passing.delete(v.id);
  }
  out.pass = report.pass.filter((id) => passing.has(id));
  out.needs_title = report.needs_title.filter((id) => passing.has(id));
  return out;
}
