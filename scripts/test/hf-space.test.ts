import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/load.js';
import { resolveDataset } from '../src/resolve.js';
import { HF_SPACE_DIR } from '../src/paths.js';
import { GUIDE_URL, renderSpace, spaceSteps, stepEmbed, stepPage } from '../src/hf-space.js';

const ds = resolveDataset(loadDataset()).dataset;
const templates = {
  html: fs.readFileSync(path.join(HF_SPACE_DIR, 'index.template.html'), 'utf8'),
  readme: fs.readFileSync(path.join(HF_SPACE_DIR, 'README.template.md'), 'utf8'),
};
const all = [...ds.assemblies.follower, ...ds.assemblies.leader];

describe('hf space', () => {
  it('shows every verified step in guide order and holds back the unverified ones', () => {
    const { shown, held, total } = spaceSteps(ds);
    expect(total).toBe(all.length);
    expect(shown.map((s) => s.id)).toEqual(all.filter((s) => !s.unverified).map((s) => s.id));
    expect(held.map((s) => s.id)).toEqual(all.filter((s) => s.unverified).map((s) => s.id));
  });

  it('links a step to its frozen page and embed URLs', () => {
    const s = ds.assemblies.follower.find((x) => x.id === 'F-011')!;
    expect(stepPage(s)).toBe(`${GUIDE_URL}/follower/011-follower-joint1-motor-into-base/`);
    expect(stepEmbed(s)).toBe(`${GUIDE_URL}/embed/follower/011-follower-joint1-motor-into-base/`);
  });

  it('renders with no placeholder left and no unverified step in the picker', () => {
    const { html, readme } = renderSpace(ds, templates);
    expect(html + readme).not.toMatch(/\{\{[A-Z_]+\}\}/);
    for (const s of spaceSteps(ds).held) expect(html).not.toContain(`data-id="${s.id}"`);
    expect(readme).toContain(`${spaceSteps(ds).shown.length} steps`);
  });

  it('escapes titles in markup and in the embedded JSON', () => {
    const f0 = ds.assemblies.follower[0];
    const tricky = {
      ...ds,
      assemblies: { ...ds.assemblies, follower: [{ ...f0, title: '</script><b>&' }] },
    };
    const { html } = renderSpace(tricky, templates);
    expect(html).toContain('&lt;/script&gt;&lt;b&gt;&amp;');
    expect(html).not.toContain('</script><b>&');
  });

  it('shows only screenshots that exist in deploy/hf-space/shots', () => {
    const { html } = renderSpace(ds, templates);
    const shots = [...html.matchAll(/src="shots\/([^"]+)"/g)].map((m) => m[1]);
    expect(shots.length).toBeGreaterThan(0);
    for (const f of shots) expect(fs.existsSync(path.join(HF_SPACE_DIR, 'shots', f)), f).toBe(true);
  });

  it('refuses an assembly it has no label for', () => {
    expect(() => spaceSteps({ ...ds, assemblies: { ...ds.assemblies, gripper: [] } })).toThrow(
      /no label for assembly 'gripper'/,
    );
  });
});
