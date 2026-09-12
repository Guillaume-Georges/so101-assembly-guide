import { describe, expect, it } from 'vitest';
import type { Issue } from '../src/load.js';
import { applyVerdicts, checkCandidates, type CheckContext } from '../src/corpus/check-lib.js';
import { evidenceToSources, toIssue, uniqueSlug } from '../src/corpus/promote-lib.js';
import {
  bodySha,
  containsQuote,
  coverageTokens,
  missingTokens,
  normalise,
  parseBlobUrl,
  parseIssueUrl,
  slugify,
  trigramSimilarity,
  wordCount,
} from '../src/corpus/text.js';
import type { Candidate, Comment, CorpusConfig, Thread } from '../src/corpus/types.js';

// Synthetic threads: no real person's comment is copied into the repo.
const cm = (
  id: number,
  author: string,
  assoc: string,
  created_at: string,
  body: string,
  thread: string,
): Comment => ({
  id,
  url: id === 0 ? thread : `${thread}#issuecomment-${id}`,
  author,
  author_association: assoc,
  created_at,
  updated_at: created_at,
  body,
  body_sha256: bodySha(body),
});
const T1 = 'https://github.com/acme/robot/issues/1';
const T2 = 'https://github.com/acme/robot/issues/2';
const t1: Thread = {
  key: 'acme/robot#1',
  owner: 'acme',
  repo: 'robot',
  number: 1,
  url: T1,
  title: '[RxPacketError] Input voltage error! on motor 2',
  state: 'closed',
  author: 'alice',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-04T00:00:00Z',
  retrieved: '2026-09-12',
  content_sha256: 'x',
  comments: [
    cm(
      0,
      'alice',
      'NONE',
      '2026-01-01T00:00:00Z',
      'My arm reports `[RxPacketError] Input voltage error!` on motor 2 with a 12V adapter. Fixed it by swapping the adapter, works now.',
      T1,
    ),
    cm(
      101,
      'bob',
      'NONE',
      '2026-01-02T00:00:00Z',
      'Power the 7.4V motors from the 5V supply instead of the 12V adapter; the 12V one is only for the 12V motors.',
      T1,
    ),
    cm(
      102,
      'alice',
      'NONE',
      '2026-01-03T00:00:00Z',
      'Switched to the 5V supply and the input voltage error is gone, all six motors set up fine.',
      T1,
    ),
    cm(
      103,
      'carol',
      'MEMBER',
      '2026-01-04T00:00:00Z',
      'Closing, confirmed: 5V supply for the 7.4V motors, 12V only for the 12V variant.',
      T1,
    ),
  ],
};
const t2: Thread = {
  key: 'acme/robot#2',
  owner: 'acme',
  repo: 'robot',
  number: 2,
  url: T2,
  title: 'wrist motor is stiff after assembly',
  state: 'open',
  author: 'dave',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-02T00:00:00Z',
  retrieved: '2026-09-12',
  content_sha256: 'y',
  comments: [
    cm(
      0,
      'dave',
      'NONE',
      '2026-02-01T00:00:00Z',
      'The wrist motor is stiff after assembly and will not turn by hand.',
      T2,
    ),
    cm(
      201,
      'dave',
      'NONE',
      '2026-02-02T00:00:00Z',
      'Thanks, the 5V supply fixed it for me too, the motors run fine.',
      T2,
    ),
  ],
};
const config: CorpusConfig = {
  sources: [
    {
      owner: 'acme',
      repo: 'robot',
      mode: 'all',
      maintainer_associations: ['OWNER', 'MEMBER', 'COLLABORATOR'],
      confirms_stages: ['assembly', 'setup-motors', 'calibration'],
    },
  ],
  v1_scopes: ['assembly', 'setup-motors', 'calibration'],
  blocked_domains: ['discord.com', 'discord.gg'],
  overlap_days: 7,
  cap: 5,
  quote_words: { min: 5, max: 60 },
  models: { mine: 'm', falsify: 'f' },
};
const live: Issue[] = [
  {
    id: 'existing',
    slug: 'existing-entry',
    title: 'Leader arm servo with the wrong gear ratio at a joint',
    stage: 'assembly',
    symptoms: ['x'],
    cause: 'y',
    fix: ['z'],
    source: [],
  },
];
const ctx = (): CheckContext => ({
  config,
  threads: new Map([
    [t1.key, t1],
    [t2.key, t2],
  ]),
  live,
  stepIds: new Set(['F-002']),
  partIds: new Set(['power-supply-5v']),
  blob: () => null,
  date: '2026-09-12',
});

const base = (over: Partial<Candidate>): Candidate => ({
  id: 'cand',
  title: '[RxPacketError] Input voltage error!',
  symptoms: ['motor 2 reports the input voltage error'],
  cause: 'A 12V adapter was connected to 7.4V motors.',
  fix: ['Power the 7.4V motors from the 5V supply.'],
  related_steps: ['F-002'],
  related_parts: ['power-supply-5v'],
  source: [{ ref: T1, retrieved: '2026-09-12' }],
  evidence: [
    { role: 'cause', url: T1, quote: 'Input voltage error! on motor 2 with a 12V adapter' },
    {
      role: 'cause',
      url: `${T1}#issuecomment-101`,
      quote: 'Power the 7.4V motors from the 5V supply instead of the 12V adapter',
    },
    {
      role: 'fix',
      fix_index: 0,
      url: `${T1}#issuecomment-101`,
      quote: 'Power the 7.4V motors from the 5V supply instead of the 12V adapter',
    },
    {
      role: 'confirmation',
      fix_index: 0,
      url: `${T1}#issuecomment-102`,
      quote: 'Switched to the 5V supply and the input voltage error is gone',
    },
  ],
  scope: 'setup-motors',
  frequency: 3,
  confidence: 'confirmed',
  ...over,
});

describe('text rules', () => {
  it('normalises smart quotes, backticks and whitespace', () => {
    expect(normalise('“Motor  ‘gripper’” `not`  found')).toBe('"motor \'gripper\'" not found');
    expect(containsQuote('Use the `5V` supply — really', 'use the 5v supply - really')).toBe(true);
  });
  it('counts words and finds coverage tokens', () => {
    expect(wordCount('one two  three')).toBe(3);
    expect(
      coverageTokens('Set ID 6 on /dev/ttyACM0 with M2x6 screws, horn facing left.').sort(),
    ).toEqual(['/dev/ttyacm0', '6', 'left', 'm2x6']);
    expect(missingTokens('Use a 12V supply', ['use the 5v supply'])).toEqual(['12v']);
    expect(missingTokens('Use a 12V supply', ['the 12v supply works'])).toEqual([]);
  });
  it('slugs cut on a word boundary at 60 chars', () => {
    const s = slugify(
      "Motor 'shoulder_pan' was not found, Make sure it is connected and powered on please",
      60,
    );
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(s.endsWith('-')).toBe(false);
  });
  it('parses issue, comment and blob urls', () => {
    expect(parseIssueUrl(`${T1}#issuecomment-101`)).toMatchObject({
      key: 'acme/robot#1',
      comment: 101,
    });
    expect(parseIssueUrl(T1)).toMatchObject({ comment: 0 });
    expect(
      parseBlobUrl('https://github.com/a/b/blob/' + 'a'.repeat(40) + '/src/x.py#L10-L12'),
    ).toMatchObject({ from: 10, to: 12, path: 'src/x.py' });
    expect(parseBlobUrl('https://github.com/a/b/blob/main/src/x.py#L10')).toBeNull();
  });
  it('rates near-duplicate titles high and unrelated ones low', () => {
    expect(
      trigramSimilarity('Input voltage error!', '[RxPacketError] Input voltage error!'),
    ).toBeGreaterThan(0.6);
    expect(trigramSimilarity('Input voltage error!', 'wrist motor is stiff')).toBeLessThan(0.2);
  });
});

describe('grounding contract', () => {
  it('passes a grounded candidate and fills the evidence from the thread', () => {
    const c = base({});
    const r = checkCandidates([c], ctx());
    expect(r.demoted).toEqual([]);
    expect(r.pass).toEqual(['cand']);
    expect(c.title_kind).toBe('verbatim');
    expect(c.evidence![3]).toMatchObject({
      comment_id: 102,
      author: 'alice',
      body_sha256: t1.comments[2].body_sha256,
    });
  });
  const expectDemoted = (c: Candidate, reason: RegExp) => {
    const r = checkCandidates([c], ctx());
    expect(r.pass).toEqual([]);
    expect(r.demoted[0]?.reasons.join('; ')).toMatch(reason);
    expect(c.confidence).toBe('reported');
    expect(c.unverified).toBe(true);
    expect(c.review_notes).toContain('[check 2026-09-12]');
  };
  it('demotes a fix that was only proposed', () => {
    const c = base({});
    c.evidence = c.evidence!.filter((e) => e.role !== 'confirmation');
    expectDemoted(c, /no confirmation quote/);
  });
  it('demotes a confirmation from another thread', () => {
    const c = base({});
    c.evidence![3] = {
      role: 'confirmation',
      fix_index: 0,
      url: `${T2}#issuecomment-201`,
      quote: 'the 5V supply fixed it for me too',
    };
    expectDemoted(c, /another thread/);
  });
  it('demotes a laundered number', () => {
    expectDemoted(
      base({ cause: 'A 16V adapter was connected to 7.4V motors.' }),
      /cause tokens not in its quotes: 16v/,
    );
  });
  it('demotes the opening post confirming itself', () => {
    const c = base({});
    c.evidence![3] = {
      role: 'confirmation',
      fix_index: 0,
      url: T1,
      quote: 'Fixed it by swapping the adapter, works now',
    };
    expectDemoted(c, /precedes the fix quote|opening post/);
  });
  it('demotes a confirmation by a bystander', () => {
    const c = base({});
    c.evidence![2] = {
      role: 'fix',
      fix_index: 0,
      url: `${T1}#issuecomment-102`,
      quote: 'Switched to the 5V supply and the input voltage error is gone',
    };
    c.evidence![3] = {
      role: 'confirmation',
      fix_index: 0,
      url: `${T1}#issuecomment-101`,
      quote: 'Power the 7.4V motors from the 5V supply instead of the 12V adapter',
    };
    expectDemoted(c, /neither reporter nor maintainer|precedes/);
  });
  it('accepts a maintainer confirming in a later comment', () => {
    const c = base({});
    c.evidence![3] = {
      role: 'confirmation',
      fix_index: 0,
      url: `${T1}#issuecomment-103`,
      quote: 'confirmed: 5V supply for the 7.4V motors',
    };
    expect(checkCandidates([c], ctx()).pass).toEqual(['cand']);
  });
  it('demotes a comment edited since it was quoted', () => {
    const c = base({});
    c.evidence![3].body_sha256 = 'f'.repeat(64);
    expectDemoted(c, /edited since it was quoted/);
  });
  it('demotes a quote that is not verbatim', () => {
    const c = base({});
    c.evidence![3].quote = 'Switched to the 5V supply and the error is gone';
    expectDemoted(c, /not found verbatim/);
  });
  it('demotes a quote that is too short', () => {
    const c = base({});
    c.evidence![0].quote = 'a 12V adapter';
    expectDemoted(c, /quote is 3 words/);
  });
  it('demotes a non-citable source', () => {
    expectDemoted(
      base({ source: [{ ref: 'https://discord.com/channels/1/2', retrieved: '2026-09-12' }] }),
      /non-citable/,
    );
  });
  it('demotes a duplicate of a live title', () => {
    expectDemoted(
      base({ title: 'leader arm servo with the wrong gear ratio at a joint' }),
      /duplicate title of existing/,
    );
  });
  it('demotes unknown steps and parts', () => {
    expectDemoted(base({ related_steps: ['F-999'] }), /unknown step F-999/);
  });
  it('lists a symptom-phrased title for the gate instead of promoting it', () => {
    const c = base({ title: 'Servo reports an input voltage error' });
    const r = checkCandidates([c], ctx());
    expect(r.pass).toEqual(['cand']);
    expect(r.needs_title).toEqual(['cand']);
    expect(c.title_kind).toBe('symptom');
  });
  it('parks out-of-scope candidates untouched', () => {
    const c = base({ scope: 'lerobot-software' });
    const r = checkCandidates([c], ctx());
    expect(r.parked).toEqual(['cand']);
    expect(c.confidence).toBe('confirmed');
  });
});

describe('falsifier verdicts', () => {
  it('keeps on keep, demotes on a checked counter-quote, and demotes on an unfound one', () => {
    const a = base({ id: 'a' });
    const b = base({ id: 'b', title: 'Input voltage error! on motor 2' });
    const k = base({ id: 'k', title: '[RxPacketError] Input voltage error! on motor 2' });
    const cx = ctx();
    const r = checkCandidates([a, b, k], cx);
    expect(r.pass).toEqual(['a', 'b', 'k']);
    const r2 = applyVerdicts(
      [a, b, k],
      [
        {
          id: 'a',
          verdict: 'demote',
          reason: 'reporter also changed the cable',
          counter: { url: `${T1}#issuecomment-102`, quote: 'all six motors set up fine' },
        },
        {
          id: 'b',
          verdict: 'reject',
          reason: 'made up',
          counter: { url: `${T1}#issuecomment-102`, quote: 'this sentence is not there' },
        },
        { id: 'k', verdict: 'keep', reason: 'fine' },
      ],
      r,
      cx,
    );
    expect(r2.pass).toEqual(['k']);
    expect(a.review_notes).toMatch(
      /\[falsify 2026-09-12\] falsifier: demote: reporter also changed the cable; counter-quote https/,
    );
    expect(b.review_notes).toMatch(/counter-quote not found verbatim; demoted on doubt/);
    expect(k.confidence).toBe('confirmed');
  });
});

describe('promotion', () => {
  it('assigns unique slugs with an issue-number suffix on collision', () => {
    const taken = new Set(['rxpacketerror-input-voltage-error']);
    expect(uniqueSlug('[RxPacketError] Input voltage error!', taken, 174)).toBe(
      'rxpacketerror-input-voltage-error-174',
    );
    expect(uniqueSlug('Wrist motor stiff', taken)).toBe('wrist-motor-stiff');
  });
  it('keeps the evidence as source items and strips the review fields', () => {
    const c = base({});
    checkCandidates([c], ctx());
    const issue = toIssue(
      c,
      'rxpacketerror-input-voltage-error',
      '2026-09-12',
      new Map([[`${T1}#issuecomment-102`, 'https://web.archive.org/web/2026/x']]),
    );
    expect(issue).toMatchObject({
      id: 'cand',
      slug: 'rxpacketerror-input-voltage-error',
      stage: 'setup-motors',
      unverified: false,
    });
    expect(Object.keys(issue)).not.toEqual(
      expect.arrayContaining(['scope', 'confidence', 'evidence', 'review_notes', 'frequency']),
    );
    const conf = issue.source.find((s) => s.role === 'confirmation');
    expect(conf).toMatchObject({
      comment_id: 102,
      quote: 'Switched to the 5V supply and the input voltage error is gone',
      archived: 'https://web.archive.org/web/2026/x',
      body_sha256: t1.comments[2].body_sha256,
    });
    expect(issue.source.at(-1)).toEqual({ ref: T1, retrieved: '2026-09-12' });
    expect(evidenceToSources([], '2026-09-12', new Map())).toEqual([]);
  });
});
