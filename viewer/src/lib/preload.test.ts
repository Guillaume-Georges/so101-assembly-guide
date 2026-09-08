import { describe, expect, it } from 'vitest';
import { islandPreloads, stepMeshes } from './preload';
import { steps } from './data';

describe('stepMeshes', () => {
  it('never lists a cable mesh; ghosts every part on the first (prep) step', () => {
    const first = steps('follower')[0];
    const meshes = stepMeshes('follower', first.id);
    expect(meshes.length).toBeGreaterThan(5);
    expect(meshes.some((m) => m.includes('cable'))).toBe(false);
    expect(meshes.some((m) => m.startsWith('fastener-'))).toBe(false);
  });
  it('adds fastener meshes once a step installs them', () => {
    const all = steps('follower').flatMap((s) => stepMeshes('follower', s.id));
    expect(all.some((m) => m.startsWith('fastener-'))).toBe(true);
  });
  it('is empty for an unknown step', () => {
    expect(stepMeshes('follower', 'F-999')).toEqual([]);
  });
});

describe('islandPreloads', () => {
  it('puts the two JSON files first and respects the base', () => {
    const first = steps('leader')[0];
    const urls = islandPreloads('leader', first.id, '/guide');
    expect(urls[0]).toBe('/guide/so101/data/leader.json');
    expect(urls[1]).toBe('/guide/so101/geometry/placements.json');
    expect(urls[2]).toMatch(/^\/guide\/so101\/geometry\/.+\.glb$/);
  });
});
