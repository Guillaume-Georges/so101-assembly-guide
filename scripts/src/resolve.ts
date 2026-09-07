/**
 * `extends:` resolution. A step may inherit every field from another step (any assembly) and
 * override only what it lists. The resolved step keeps its own id/slug/assembly and records the
 * parent in `extends`, so renderers can still show provenance. Both steps keep their own URL.
 */
import type { Dataset, Step } from './load.js';

export type ResolveProblem = { file: string; where: string; message: string };
const OWN = new Set(['id', 'slug', 'assembly', 'extends']);
const MAX_DEPTH = 5;

export function resolveSteps(ds: Dataset): {
  assemblies: Record<string, Step[]>;
  problems: ResolveProblem[];
} {
  const problems: ResolveProblem[] = [];
  const index = new Map<string, Step>();
  for (const steps of Object.values(ds.assemblies)) for (const s of steps) index.set(s.id, s);

  const resolveOne = (s: Step, file: string, chain: string[]): Step => {
    if (!s.extends) return s;
    if (chain.includes(s.id) || chain.length >= MAX_DEPTH) {
      problems.push({
        file,
        where: s.id,
        message: `extends chain too deep or cyclic: ${[...chain, s.id].join(' -> ')}`,
      });
      return s;
    }
    const parent = index.get(s.extends);
    if (!parent) {
      problems.push({ file, where: s.id, message: `extends unknown step '${s.extends}'` });
      return s;
    }
    const base = resolveOne(parent, `assemblies/${parent.assembly}.yaml`, [...chain, s.id]);
    const merged: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(base)) if (!OWN.has(k)) merged[k] = v;
    for (const [k, v] of Object.entries(s)) merged[k] = v;
    return merged as Step;
  };

  const assemblies: Record<string, Step[]> = {};
  for (const [name, steps] of Object.entries(ds.assemblies)) {
    assemblies[name] = steps.map((s) => resolveOne(s, `assemblies/${name}.yaml`, []));
  }
  return { assemblies, problems };
}

export function resolveDataset(ds: Dataset): { dataset: Dataset; problems: ResolveProblem[] } {
  const { assemblies, problems } = resolveSteps(ds);
  return { dataset: { ...ds, assemblies }, problems };
}
