/** Turning a passing candidate into a published entry, and the PR body that shows the human why. */
import type { Issue, SourceRef } from '../load.js';
import { slugify } from './text.js';
import type { Candidate, CheckReport, Evidence, FetchReport, PromotedEntry } from './types.js';

const REVIEW_FIELDS = [
  'scope',
  'frequency',
  'confidence',
  'review_notes',
  'title_kind',
  'held',
  'duplicate_of',
  'merge_into',
  'evidence',
  'slug',
] as const;

export function uniqueSlug(title: string, taken: Set<string>, issueNumber?: number): string {
  const base = slugify(title, 60);
  if (!taken.has(base)) return base;
  const suffix = issueNumber ? `-${issueNumber}` : '';
  let s = slugify(title, 60 - suffix.length) + suffix;
  let n = 2;
  while (taken.has(s)) {
    const tail = `${suffix}-${n++}`;
    s = slugify(title, 60 - tail.length) + tail;
  }
  return s;
}

/** Evidence becomes source items so the proof ships in data/ with the entry. */
export function evidenceToSources(
  ev: Evidence[],
  retrieved: string,
  archived: Map<string, string>,
): SourceRef[] {
  return ev.map((e) => ({
    ref: e.url,
    retrieved,
    note: `${e.role}${e.fix_index != null ? `[${e.fix_index}]` : ''} by ${e.author ?? '?'} (${e.author_association ?? '?'})`,
    role: e.role,
    ...(e.fix_index != null ? { fix_index: e.fix_index } : {}),
    ...(e.comment_id != null ? { comment_id: e.comment_id } : {}),
    quote: e.quote,
    ...(e.body_sha256 ? { body_sha256: e.body_sha256 } : {}),
    ...(archived.get(e.url) ? { archived: archived.get(e.url)! } : {}),
  }));
}

export function toIssue(
  c: Candidate,
  slug: string,
  retrieved: string,
  archived: Map<string, string>,
): Issue {
  const stage = c.scope as Issue['stage'];
  const seen = new Set<string>();
  const sources: SourceRef[] = [];
  for (const s of [...evidenceToSources(c.evidence ?? [], retrieved, archived), ...c.source]) {
    const k = `${s.ref}|${s.quote ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    sources.push(s);
  }
  const rest: Record<string, unknown> = { ...c };
  for (const f of REVIEW_FIELDS) delete rest[f];
  delete rest.unverified;
  delete rest.source;
  return {
    ...(rest as Omit<Issue, 'slug' | 'stage' | 'source'>),
    slug,
    stage,
    source: sources,
    unverified: false,
  } as Issue;
}

function block(e: PromotedEntry): string {
  const i = e.issue;
  const q = (role: string, idx?: number) =>
    e.evidence
      .filter((x) => x.role === role && (idx == null || (x.fix_index ?? 0) === idx))
      .map((x) => `  > "${x.quote}"\n  > — ${x.author} (${x.author_association}), ${x.url}`)
      .join('\n');
  const fixes = i.fix
    .map(
      (f, n) =>
        `- fix[${n}]: ${f}\n${q('fix', n)}\n  confirmation:\n${q('confirmation', n) || '  (upstream code)'}`,
    )
    .join('\n');
  return `### ${i.title}\n\n**slug:** \`${i.slug}\` (frozen at first publish) · **id:** \`${i.id}\` · **stage:** ${i.stage} · from ${e.from}, ${e.frequency} thread(s)\n\n- cause: ${i.cause}\n${q('cause')}\n${fixes}\n- falsifier: ${e.falsifier}\n`;
}

export function prBody(
  run: string,
  promoted: PromotedEntry[],
  check: CheckReport,
  fetch: FetchReport | null,
  staged: Candidate[],
  meta: { models: Record<string, string>; prompt_shas: Record<string, string> },
): string {
  const parts: string[] = [];
  parts.push(
    `Troubleshooting run ${run}: ${promoted.length} promoted, ${staged.length} in staging.\n`,
  );
  parts.push(
    `Review each entry by reading the quotes beside the sentences: a sentence may contain nothing its quotes do not. Slugs freeze on merge.\n`,
  );
  if (promoted.length) parts.push(`## Promoted\n\n${promoted.map(block).join('\n')}`);
  const demoted = check.demoted;
  if (demoted.length)
    parts.push(
      `## Demoted (stay in staging, unverified)\n\n${demoted.map((d) => `- \`${d.id}\`: ${d.reasons.join('; ')}`).join('\n')}\n`,
    );
  if (check.needs_title.length)
    parts.push(
      `## Needs a title decision (symptom-phrased, not promoted)\n\n${check.needs_title.map((id) => `- \`${id}\``).join('\n')}\n`,
    );
  const merges = staged.filter((c) => c.merge_into);
  if (merges.length)
    parts.push(
      `## Merge suggested by the falsifier\n\n${merges.map((c) => `- \`${c.id}\` → \`${c.merge_into}\``).join('\n')}\n`,
    );
  if (fetch?.drift.length)
    parts.push(
      `## Drift on live entries (reported, not acted on)\n\n${fetch.drift.map((d) => `- ${d.kind} \`${d.entry}\` ${d.ref}: ${d.detail}`).join('\n')}\n`,
    );
  if (fetch) {
    const c = fetch.counts;
    parts.push(
      `## Run\n\n- threads: delta ${c.delta}, fetched ${c.fetched} (${c.new} new, ${c.updated} updated), ${c.unchanged} unchanged\n- models: ${Object.entries(
        meta.models,
      )
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}\n- prompts: ${Object.entries(meta.prompt_shas)
        .map(([k, v]) => `${k}=${v.slice(0, 12)}`)
        .join(', ')}\n- retrieved: ${fetch.retrieved}`,
    );
  }
  return parts.join('\n');
}
