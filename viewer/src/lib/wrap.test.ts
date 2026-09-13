import { describe, expect, it } from 'vitest';
import { breakPoints } from './wrap';

describe('breakPoints', () => {
  it('splits after slash, underscore and hash, keeping every character', () => {
    const ref = 'SO-ARM100/STL/SO101/Follower_SO101.stl#top';
    const pieces = breakPoints(ref);
    expect(pieces).toEqual(['SO-ARM100/', 'STL/', 'SO101/', 'Follower_', 'SO101.stl#', 'top']);
    expect(pieces.join('')).toBe(ref);
  });
  it('leaves text without break characters whole', () => {
    expect(breakPoints('F1')).toEqual(['F1']);
    expect(breakPoints('')).toEqual(['']);
  });
  it('adds no empty piece after a trailing break character', () => {
    expect(breakPoints('a/')).toEqual(['a/']);
  });
});
