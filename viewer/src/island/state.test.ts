import { describe, expect, it } from 'vitest';
import {
  cablesAt,
  installedAt,
  jointOf,
  screwAxis,
  visibility,
  type Placement,
  type StepLite,
} from './state';

const P = (over: Partial<Placement>): Placement => ({
  kind: 'part',
  id: 'x',
  mesh: 'x.glb',
  name: 'x',
  path: 'SO101 Assembly v4',
  transform: [],
  approximation: false,
  assembly: ['follower', 'leader'],
  ...over,
});
const steps: StepLite[] = [
  { id: 'F-001', prep: true, parts: ['base-so101', 'upper-arm-so101'], cables: [], fasteners: [] },
  {
    id: 'F-010',
    parts: ['servo-sts3215-c001-345', 'servo-horn-geared', 'servo-horn-plain'],
    servo_slot: 'shoulder_pan',
    cables: [],
    fasteners: ['m3x6'],
  },
  {
    id: 'F-011',
    parts: ['servo-sts3215-c001-345', 'base-so101'],
    servo_slot: 'shoulder_pan',
    cables: [],
    fasteners: ['motor-tab-screw'],
  },
  {
    id: 'F-021',
    parts: ['servo-sts3215-c001-345', 'motor-holder-so101-base'],
    servo_slot: 'shoulder_lift',
    cables: ['cable-shoulder-pan-to-shoulder-lift'],
    fasteners: [],
  },
];

describe('island state', () => {
  it('reads the joint from the STEP instance name', () => {
    expect(jointOf(P({ kind: 'servo', name: 'ST3215 Servo v2:5' }))).toBe('wrist_roll');
    expect(
      jointOf(P({ kind: 'horn', path: 'SO101 Assembly v4/ST3215 Servo v2:2/SCS215 v6_7:1' })),
    ).toBe('shoulder_lift');
  });
  it('installs parts, servos by slot, horns by slot, and keeps future things hidden', () => {
    expect(installedAt(P({ id: 'base-so101' }), steps)).toBe(2);
    expect(
      installedAt(
        P({ kind: 'servo', id: 'servo-sts3215-c001-345', name: 'ST3215 Servo v2:1' }),
        steps,
      ),
    ).toBe(1);
    expect(
      installedAt(
        P({ kind: 'servo', id: 'servo-sts3215-c001-345', name: 'ST3215 Servo v2:2' }),
        steps,
      ),
    ).toBe(3);
    expect(
      installedAt(
        P({ kind: 'horn', id: 'servo-horn-plain', path: 'SO101 Assembly v4/ST3215 Servo v2:1/x' }),
        steps,
      ),
    ).toBe(1);
    expect(
      installedAt(
        P({ kind: 'servo', id: 'servo-sts3215-c001-345', name: 'ST3215 Servo v2:6' }),
        steps,
      ),
    ).toBe(-1);
  });
  it('classifies current / installed / future and respects the arm tag', () => {
    expect(visibility(P({ id: 'base-so101' }), steps, 2, 'follower')).toBe('current');
    expect(visibility(P({ id: 'base-so101' }), steps, 3, 'follower')).toBe('installed');
    expect(visibility(P({ id: 'base-so101' }), steps, 1, 'follower')).toBe('future');
    expect(visibility(P({ id: 'base-so101', assembly: ['leader'] }), steps, 3, 'follower')).toBe(
      'future',
    );
    // a prep step highlights what it handles without installing anything
    expect(visibility(P({ id: 'upper-arm-so101' }), steps, 0, 'follower')).toBe('current');
    expect(visibility(P({ id: 'base-so101' }), steps, 0, 'follower')).toBe('current');
  });
  it('accumulates cables', () => {
    expect([...cablesAt(steps, 3)]).toEqual(['cable-shoulder-pan-to-shoulder-lift']);
    expect(cablesAt(steps, 2).size).toBe(0);
  });
  it('shows a fastener at the step the pipeline allocated it to, per arm', () => {
    const f = P({
      kind: 'fastener',
      id: 'motor-tab-screw',
      host: ['base-so101'],
      step: { follower: 'F-011', leader: 'L-011' },
    });
    expect(installedAt(f, steps, 'follower')).toBe(2);
    expect(installedAt(f, steps, 'leader')).toBe(-1); // L-011 is not in this step list
    expect(visibility(f, steps, 2, 'follower')).toBe('current');
    expect(visibility(f, steps, 1, 'follower')).toBe('future');
    // unallocated (listed by no step) fasteners never show, host or not
    expect(installedAt(P({ kind: 'fastener', id: 'm3-nut', host: ['base-so101'] }), steps)).toBe(
      -1,
    );
    // fasteners are never highlighted by a prep step
    expect(visibility(f, steps, 0, 'follower')).toBe('future');
  });
  it('prefers an explicit joint over the STEP instance name', () => {
    expect(jointOf(P({ kind: 'horn', path: 'hand-placed', joint: 'gripper' }))).toBe('gripper');
    expect(
      installedAt(
        P({
          kind: 'servo',
          id: 'servo-sts3215-c001-345',
          name: 'x (leader, hand-placed)',
          joint: 'shoulder_pan',
        }),
        steps,
      ),
    ).toBe(1);
  });
  it('reads a screw axis off its row-major transform', () => {
    // identity: canonical +Y
    expect(screwAxis([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toEqual([0, 1, 0]);
    // rotated so local +Y -> world -X (second column = (-1, 0, 0)), with a translation
    expect(screwAxis([0, -1, 0, 0.1, 1, 0, 0, 0.2, 0, 0, 1, 0.3, 0, 0, 0, 1])).toEqual([-1, 0, 0]);
  });
});
