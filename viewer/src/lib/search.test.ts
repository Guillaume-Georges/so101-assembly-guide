import { describe, expect, it } from 'vitest';
import { createSearch, exampleQueries, fallbackLinks, toDocs } from './search';
import { data, steps } from './data';

const docs = toDocs(
  data.troubleshooting,
  [...steps('follower'), ...steps('leader')],
  {
    issue: (i) => `/troubleshooting/${i.id}/`,
    step: (s) => `/${s.assembly}/${s.id}/`,
  },
  { stage: (s) => `stage:${s}`, arm: (a) => `${a} arm` },
);
const search = createSearch(docs);
const first = (q: string) => search.query(q)[0]?.href;

describe('site search', () => {
  it('matches the exact error string', () => {
    expect(first('Error while setting a motor ID')).toBe(
      '/troubleshooting/setup-motors-no-response/',
    );
  });
  it('tolerates typos in a symptom', () => {
    expect(first('moter not found')).toBe('/troubleshooting/setup-motors-no-response/');
    expect(first('gear ration')).toBe('/troubleshooting/wrong-leader-gear-ratio/');
  });
  it('reaches an entry through an alias and echoes that alias', () => {
    const hit = search.query('leader arm too stiff')[0];
    expect(hit.href).toBe('/troubleshooting/wrong-leader-gear-ratio/');
    expect(hit.matched).toBe('leader arm too stiff');
    expect(hit.sub).toBe('stage:assembly');
  });
  it('does not echo an alias when the title itself matched', () => {
    expect(search.query('Error while setting a motor ID')[0].matched).toBeUndefined();
  });
  it('labels a step with its arm and number', () => {
    const s = steps('follower')[4];
    expect(search.query(s.title)[0].sub).toBe(`follower arm · step ${Number(s.id.slice(2))}`);
  });
  it('ranks the entry above steps for a pasted error line', () => {
    const hits = search.query(
      'Error while setting a motor ID: Connect the controller board to the motor only and press enter',
    );
    expect(hits[0].kind).toBe('issue');
    expect(hits.length).toBeLessThanOrEqual(8);
  });
  it('finds a step by its title', () => {
    const s = steps('follower')[4];
    expect(first(s.title)).toBe(`/follower/${s.id}/`);
  });
  it('returns nothing for a query the guide does not cover', () => {
    expect(search.query('xyzzy qwv')).toEqual([]);
    expect(search.query('   ')).toEqual([]);
  });
});

describe('exampleQueries', () => {
  it('picks short builder phrasings, one per issue', () => {
    const ex = exampleQueries(data.troubleshooting);
    expect(ex).toContain('motor not found');
    expect(ex).toContain('leader arm too stiff');
    expect(ex.length).toBeLessThanOrEqual(4);
    for (const q of ex) expect(q.split(' ').length).toBeLessThanOrEqual(4);
  });
});

describe('fallbackLinks', () => {
  it('prefills the upstream searches and the report form with the query', () => {
    const links = fallbackLinks(
      'motor 5 dead',
      'https://example.com/issues/new?template=troubleshooting-entry.yml',
    );
    expect(links.map((l) => l.href)).toEqual([
      'https://github.com/huggingface/lerobot/issues?q=motor%205%20dead',
      'https://github.com/TheRobotStudio/SO-ARM100/issues?q=motor%205%20dead',
      'https://example.com/issues/new?template=troubleshooting-entry.yml&title=Troubleshooting%3A%20motor%205%20dead',
    ]);
  });
});
