/**
 * Build-time list of what the 3D island will fetch on a step page, so the page can `<link rel=preload>`
 * it and the meshes travel in parallel with the island bundle instead of after it (HTML -> bundle ->
 * two JSON files -> meshes was three serial round trips before the first mesh request).
 *
 * The mesh set mirrors Scene in island/Viewer.tsx exactly: every non-cable placement that is built by
 * this step, plus every future part as a ghost — future fasteners are never drawn. Keep the two in step.
 */
import geometry from '../../public/so101/geometry/placements.json';
import { visibility, type Placement } from '../island/state';
import { steps, stepLite } from './data';

const placements = (geometry as { placements: Placement[] }).placements;

/** Mesh files the island draws at this step (deduplicated, in placement order). */
export function stepMeshes(assembly: string, stepId: string): string[] {
  const lite = steps(assembly).map(stepLite);
  const k = lite.findIndex((s) => s.id === stepId);
  if (k < 0) return [];
  const out: string[] = [];
  for (const p of placements) {
    if (!p.assembly.includes(assembly) || p.kind === 'cable') continue;
    const vis = visibility(p, lite, k, assembly);
    if (p.kind === 'fastener' && vis === 'future') continue;
    if (!out.includes(p.mesh)) out.push(p.mesh);
  }
  return out;
}

/** Site-relative URLs to preload: the two JSON files the island fetches first, then this step's meshes. */
export function islandPreloads(assembly: string, stepId: string, base: string): string[] {
  const b = base.endsWith('/') ? base : base + '/';
  return [
    `${b}so101/data/${assembly}.json`,
    `${b}so101/geometry/placements.json`,
    ...stepMeshes(assembly, stepId).map((m) => `${b}so101/geometry/${m}`),
  ];
}
