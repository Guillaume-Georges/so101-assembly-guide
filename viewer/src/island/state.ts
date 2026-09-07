/**
 * Pure step -> visible-placements logic for the 3D island. No three.js here so it is unit-testable.
 *
 * A placement is visible at step k when the thing it represents has been installed by some step <= k:
 *  - part: a step lists the part id (servo parts are matched by slot, see below);
 *  - servo: the step has servo_slot == the placement's joint (from its STEP instance name ':N');
 *  - horn: a step with that servo_slot lists a horn part id;
 *  - board: a step lists motor-control-board;
 *  - fastener: the step lists that fastener id AND the placement sits inside the step's parts' bbox (caller supplies);
 *  - cable: a step lists a cable id that maps (from/to) to it — cables are drawn from data paths instead.
 * "Current" = installed by exactly step k.
 */
export type Placement = {
  kind: 'part' | 'servo' | 'horn' | 'board' | 'fastener' | 'cable';
  id: string;
  mesh: string;
  name: string;
  path: string;
  transform: number[];
  approximation: boolean;
  assembly: string[];
  host?: string[] | null; // fasteners: part ids whose bbox contains the placement (pipeline)
};
export type StepLite = {
  id: string;
  prep?: boolean; // preparation step: parts handled, not installed
  parts: string[];
  servo_slot?: string;
  cables: string[];
  fasteners: string[];
};

export const JOINTS = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
];
const HORNS = new Set(['servo-horn-geared', 'servo-horn-plain']);

/** Joint of a servo/horn placement from its STEP instance name, e.g. "ST3215 Servo v2:5" -> wrist_roll. */
export function jointOf(p: Placement): string | undefined {
  const m = (p.kind === 'servo' ? p.name : p.path).match(/ST3215 Servo v2:(\d)/);
  return m ? JOINTS[Number(m[1]) - 1] : undefined;
}

export type Visibility = 'current' | 'installed' | 'future';

export function visibility(
  p: Placement,
  steps: StepLite[],
  k: number,
  assembly: string,
): Visibility {
  if (!p.assembly.includes(assembly)) return 'future';
  const cur = steps[k];
  if (cur?.prep) return cur.parts.includes(p.id) && p.kind !== 'fastener' ? 'current' : 'future';
  const idx = installedAt(p, steps);
  if (idx === -1 || idx > k) return 'future';
  return idx === k ? 'current' : 'installed';
}

/** Index of the first step that installs this placement, or -1. */
export function installedAt(p: Placement, steps: StepLite[]): number {
  const joint = jointOf(p);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.prep) continue; // handled, not installed
    if (p.kind === 'part' && s.parts.includes(p.id)) return i;
    if (p.kind === 'board' && s.parts.includes(p.id)) return i;
    if (
      p.kind === 'servo' &&
      joint &&
      s.servo_slot === joint &&
      s.parts.some((id) => id.startsWith('servo-sts3215'))
    )
      return i;
    if (
      p.kind === 'horn' &&
      joint &&
      s.servo_slot === joint &&
      s.parts.some((id) => HORNS.has(id)) &&
      (p.id !== 'servo-horn-plain' || s.parts.includes('servo-horn-plain'))
    )
      return i;
    if (
      p.kind === 'fastener' &&
      s.fasteners.includes(p.id) &&
      (!p.host?.length || p.host.some((h) => s.parts.includes(h)))
    )
      return i;
    if (p.kind === 'cable') return -1; // drawn from data cable paths, never from the mesh
  }
  return -1;
}

/** Cable ids visible at step k: every cable listed by a step <= k. */
export function cablesAt(steps: StepLite[], k: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= k && i < steps.length; i++) for (const c of steps[i].cables) out.add(c);
  return out;
}
