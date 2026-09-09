import { describe, expect, it } from 'vitest';
import { createSearch, fallbackLinks, toDocs } from './search';
import { data, steps } from './data';

const docs = toDocs(data.troubleshooting, [...steps('follower'), ...steps('leader')], {
  issue: (i) => `/troubleshooting/${i.id}/`,
  step: (s) => `/${s.assembly}/${s.id}/`,
});
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
  it('reaches an entry through an alias', () => {
    expect(first('leader arm too stiff')).toBe('/troubleshooting/wrong-leader-gear-ratio/');
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
