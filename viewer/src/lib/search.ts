/**
 * Site search: troubleshooting entries (title, aliases, symptoms) and step titles, with prefix
 * matching and typo tolerance. Runs in the browser over a small document list the header
 * serialises at build time (the client must not import the data bundle: 200+ KB per page).
 *
 * MiniSearch scores with BM25, so a pasted error line ranks by its rare words ("setup-motors",
 * "ttyACM0") rather than its common ones; short and stop words never fuzz.
 */
import MiniSearch from 'minisearch';

export type SearchKind = 'issue' | 'step';
export type SearchDoc = {
  id: string;
  kind: SearchKind;
  href: string;
  /** Text shown in the result row. */
  label: string;
  title: string;
  aliases: string;
  symptoms: string;
};
export type SearchHit = { href: string; label: string; kind: SearchKind };

const STOP = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'at',
  'is',
  'it',
  'and',
  'or',
  'for',
  'with',
  'my',
  'i',
  'am',
  'be',
]);
const MAX_HITS = 8;

const processTerm = (term: string) => {
  const t = term.toLowerCase();
  if (STOP.has(t)) return null;
  return /^\d$/.test(t) || t.length >= 2 ? t : null; // keep "5" as in "motor 5"
};

type IssueLike = {
  id: string;
  slug: string;
  title: string;
  aliases?: string[];
  symptoms: string[];
};
type StepLike = { id: string; title: string; assembly: string };

/** Builds the document list; hrefs are supplied by the caller so this file stays free of site config. */
export function toDocs<I extends IssueLike, S extends StepLike>(
  issues: I[],
  steps: S[],
  href: { issue: (i: I) => string; step: (s: S) => string },
): SearchDoc[] {
  return [
    ...issues.map((i) => ({
      id: `issue:${i.id}`,
      kind: 'issue' as const,
      href: href.issue(i),
      label: i.title,
      title: i.title,
      aliases: (i.aliases ?? []).join(' | '),
      symptoms: i.symptoms.join(' | '),
    })),
    ...steps.map((s) => ({
      id: `step:${s.id}`,
      kind: 'step' as const,
      href: href.step(s),
      label: `${s.id} ${s.title}`,
      title: `${s.id} ${s.title}`,
      aliases: s.assembly,
      symptoms: '',
    })),
  ];
}

export function createSearch(docs: SearchDoc[]) {
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'aliases', 'symptoms'],
    storeFields: ['href', 'label', 'kind'],
    processTerm,
    searchOptions: {
      processTerm,
      boost: { title: 3, aliases: 2, symptoms: 1 },
      prefix: (term) => term.length >= 3,
      // Edit distance grows with the word: "moter" allows 1, "calibraton" allows 2, "id" none.
      fuzzy: (term) => (term.length >= 4 ? 0.2 : false),
      boostDocument: (_id, _term, doc) => (doc?.kind === 'issue' ? 1.3 : 1),
    },
  });
  index.addAll(docs);
  return {
    query(raw: string): SearchHit[] {
      const q = raw.trim();
      if (!q) return [];
      return index
        .search(q)
        .slice(0, MAX_HITS)
        .map((r) => ({
          href: r.href as string,
          label: r.label as string,
          kind: r.kind as SearchKind,
        }));
    },
  };
}

/**
 * Where to send a query the guide cannot answer. The upstream issue trackers are the public
 * record for SO-101 problems (CLAUDE.md: Discord is not citable); the report link opens this
 * repo's troubleshooting issue form with the query as the title, so every miss can become a page.
 */
export function fallbackLinks(q: string, reportFormUrl: string) {
  const enc = encodeURIComponent(q);
  return [
    {
      label: 'Search LeRobot issues',
      href: `https://github.com/huggingface/lerobot/issues?q=${enc}`,
    },
    {
      label: 'Search SO-ARM100 issues',
      href: `https://github.com/TheRobotStudio/SO-ARM100/issues?q=${enc}`,
    },
    {
      label: 'Report it so we add a page',
      href: `${reportFormUrl}&title=${encodeURIComponent(`Troubleshooting: ${q}`)}`,
    },
  ];
}

/** Escapes text for innerHTML; results and the echoed query are user-typed. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
