/** Text rules the grounding contract is made of: normalisation, quote matching, token coverage, slugs. */
import { createHash } from 'node:crypto';

const SMART: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[–—]/g, '-'],
  [/ /g, ' '],
];

/** Lowercase, NFKC, straight quotes, no backticks or bold markers, single spaces. Both sides of every comparison go through this. */
export function normalise(s: string): string {
  let t = s.normalize('NFKC');
  for (const [re, to] of SMART) t = t.replace(re, to);
  t = t.replace(/`+/g, '').replace(/\*\*/g, '');
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** sha of the normalised body: whitespace-only edits do not count as edits. */
export function bodySha(body: string): string {
  return sha256(normalise(body));
}

export function wordCount(s: string): number {
  return normalise(s).split(' ').filter(Boolean).length;
}

/** True when `quote` occurs verbatim (after normalisation) in `body`. */
export function containsQuote(body: string, quote: string): boolean {
  const q = normalise(quote);
  return q.length > 0 && normalise(body).includes(q);
}

const DIRECTIONAL = new Set([
  'left',
  'right',
  'up',
  'down',
  'top',
  'bottom',
  'front',
  'back',
  'rear',
  'above',
  'below',
  'inside',
  'outside',
  'inward',
  'outward',
  'forward',
  'backward',
  'upper',
  'lower',
  'clockwise',
  'counterclockwise',
  'anticlockwise',
  'anti-clockwise',
  'counter-clockwise',
  'plus',
  'minus',
  'positive',
  'negative',
  'reversed',
  'reverse',
  'inverted',
]);

/** The tokens a sentence may not contain unless a quote contains them: anything with a digit, a path or identifier, or a direction. */
export function coverageTokens(sentence: string): string[] {
  const out = new Set<string>();
  for (const raw of normalise(sentence).split(' ')) {
    const tok = raw.replace(/^[^\w/.-]+|[^\w/.-]+$/g, '').replace(/[.,;:]+$/g, '');
    if (!tok) continue;
    if (/\d/.test(tok) || /[/_]/.test(tok) || DIRECTIONAL.has(tok)) out.add(tok);
  }
  return [...out];
}

/** Tokens of `sentence` that no quote covers. Empty means the sentence is fully grounded. */
export function missingTokens(sentence: string, quotes: string[]): string[] {
  const pool = ' ' + quotes.map(normalise).join(' ') + ' ';
  return coverageTokens(sentence).filter((t) => !pool.includes(t));
}

const STOP = new Set([
  'this',
  'that',
  'with',
  'from',
  'have',
  'will',
  'your',
  'then',
  'than',
  'they',
  'them',
  'were',
  'when',
  'what',
  'which',
  'there',
  'their',
  'about',
  'after',
  'before',
  'into',
  'also',
  'just',
  'only',
  'same',
  'some',
  'been',
  'does',
  'did',
  'and',
  'the',
  'for',
  'was',
  'are',
  'not',
  'but',
  'you',
  'can',
  'now',
  'still',
  'thanks',
  'thank',
  'works',
  'worked',
  'working',
  'issue',
  'problem',
  'fixed',
  'solved',
]);

/** Content words two quotes may share (rule 4: a confirmation must be about the fix it confirms). */
export function contentTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalise(s).split(' ')) {
    const tok = raw.replace(/^[^\w/.-]+|[^\w/.-]+$/g, '');
    if (tok.length >= 4 && !STOP.has(tok)) out.add(tok);
  }
  return out;
}

export function shareContentToken(a: string, b: string): boolean {
  const ta = contentTokens(a);
  for (const t of contentTokens(b)) if (ta.has(t)) return true;
  return false;
}

function trigrams(s: string): Set<string> {
  const t = ` ${normalise(s).replace(/[^a-z0-9 ]/g, '')} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Dice similarity on character trigrams, 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const g of ta) if (tb.has(g)) hit++;
  return (2 * hit) / (ta.size + tb.size);
}

/** Slug from a title: schema pattern ^[a-z0-9]+(-[a-z0-9]+)*$, at most `max` chars, cut on a word boundary. */
export function slugify(title: string, max = 60): string {
  const words = normalise(title)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let out = '';
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return out || 'entry';
}

/** Parse a GitHub issue or comment URL. comment 0 = the issue body. */
export function parseIssueUrl(
  url: string,
): { owner: string; repo: string; number: number; comment: number; key: string } | null {
  const m = url.match(
    /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)(?:#issuecomment-(\d+))?/,
  );
  if (!m) return null;
  const [, owner, repo, n, c] = m;
  return {
    owner,
    repo,
    number: Number(n),
    comment: c ? Number(c) : 0,
    key: `${owner}/${repo}#${n}`,
  };
}

/** Parse a permalink to lines of a file at a commit. */
export function parseBlobUrl(
  url: string,
): { owner: string; repo: string; sha: string; path: string; from: number; to: number } | null {
  const m = url.match(
    /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([0-9a-f]{40})\/([^#?]+)#L(\d+)(?:-L(\d+))?$/,
  );
  if (!m) return null;
  const [, owner, repo, sha, path, a, b] = m;
  return { owner, repo, sha, path, from: Number(a), to: Number(b ?? a) };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
