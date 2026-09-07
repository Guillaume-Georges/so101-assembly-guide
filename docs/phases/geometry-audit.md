# Geometry and step audit (2026-09-07)

Independent review of the 3D model against the step data, prompted by
screws appearing in the viewer with no hole to go into. Method: for every
fastener placement, sample its shank axis and a ring around it against every
printed part mesh (trimesh containment); "in a hole" means the shank runs
through free space with the part's material around it. Then replay the
island's visibility rule step by step and compare what it shows with what
each step declares.

## Findings

| #   | Finding                                                                                                                                                                                                                                                                                                                           | Cause                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | F/L-011 drew two screws into the base motor holder, a part that arrives one step later; F/L-012 drew none.                                                                                                                                                                                                                        | `host` was "bbox + 2 mm contains the screw centre"; a screw through the holder also sits inside the base's bbox.        |
| 2   | F/L-052 drew 13 M3x6 instead of 8 (the four gripper-body screws and motor 5's horn screw came early); F-060 drew 8 instead of 4 (the claw screws); F-063 drew none.                                                                                                                                                               | Same bbox rule, cascading down the wrist.                                                                               |
| 3   | The horn screws for motors 1, 2, 3, 4 and 6 never appeared; F/L-010, 020, 030, 040, 062 declared one each.                                                                                                                                                                                                                        | The STEP models only motor 5's horn screw.                                                                              |
| 4   | The leader gripper horns never appeared (L-062).                                                                                                                                                                                                                                                                                  | Hand-placed horns carry `path: hand-placed`, so the joint regex found nothing.                                          |
| 5   | The two `tapping-0-48` screws, "location not described by any text", are motor 1's upper pair: they enter from above through base holes into the servo tabs. With them the STEP has 24 tapping-screw positions per arm, exactly LeRobot's count.                                                                                  | Nobody had asked the geometry where they sit.                                                                           |
| 6   | The base motor holder's "one on each side" screws are horizontal, pass through the holder into the base and sit 17 mm from the servo: they hold the holder, not the motor. The shoulder and wrist motor holders have no screws of their own; each is clamped by the motor's four side screws (per side one arm part, one holder). | Not stated by LeRobot or Waveshare; read from the STEP.                                                                 |
| 7   | The handle was placed from the video pose and interpenetrated the leader holder (a third of the holder's surface samples inside the handle). `Handle_SO101.step` and `Wrist_Roll_SO101.step` share one authoring frame: the handle's single M2 hole is coaxial with a pilot hole in the holder.                                   | The Phase 2 feature search looked for hole pairs across frames and missed that no transform was needed.                 |
| 8   | The trigger plate sat 4 mm inside the horn and its four M3 holes were 13.7 degrees off the screws, so L-063 showed no screws.                                                                                                                                                                                                     | Placed from the jaw's pocket face with the jaw's rotation; the trigger's hole pattern is rotated relative to the jaw's. |
| 9   | The two M3 nuts were tagged for both arms and, in the leader, sat inside the holder's solid.                                                                                                                                                                                                                                      | They are pockets of the follower gripper body only.                                                                     |
| 10  | The nut primitive was drawn across its flats, not along its axis.                                                                                                                                                                                                                                                                 | "Axis = longest bbox extent" is wrong for a nut.                                                                        |
| 11  | The pipeline rewrites `data/cables.yaml` on every run with sub-millimetre differences (random surface sampling in the centreline derivation), so a geometry regeneration always dirties the cable data.                                                                                                                           | No fixed seed. Not fixed here; the file was restored from git after regeneration.                                       |

## Explode view

With the slider up, a current-step screw used to fly off radially from the
assembly centroid, so it hung in mid-air with nothing pointing at its hole.
A screw now backs out along its own axis, head first, with a dashed guide
from the hole to the screw (`screwAxis` in `state.ts`, read off the
placement transform). Printed parts keep the radial explode.

The servo primitive stays a box: the STS3215 datasheet drawing (section 9)
has no ears; its four mounting holes go through the body corners, and the
STEP's tab screws enter the box's top and bottom faces at the rear corners
(about 17 mm and 20 mm behind the centre, 10 mm either side), which the
primitive already reproduces.

## Changes

- `pipeline/so101_pipeline/fasteners.py` (new): hole test per fastener and
  printed part; `host` = parts whose hole the shank passes through; the
  fastener's arms follow from its hosts. Horn screws synthesized on every
  geared horn that has none (approximation, `joint` set). Steps are read from
  `data/assemblies/` (with `extends` resolved) and each declared
  `fasteners: [{id, qty}]` is allocated up to `qty` ready placements, in
  step order: a horn screw when the step's `servo_slot` is its joint, a
  hosted screw when all its hosts in this arm are installed. Result:
  `step: {follower: 'F-011', leader: 'L-011'}` on each placement.
- `export.py`: one canonical primitive per fastener id (tip at the origin,
  axis +Z) placed by tip point and direction; `joint` on servos and horns.
  Nut axis fixed.
- `hand_place.py`: handle takes the holder's transform; its M2x6 is placed in
  the coaxial hole pair. Trigger set on the STEP's drive-side jaw screws with
  the fit chosen from the upstream leader photo (loop down and toward the
  tip); the leader gripper servo and horns carry `joint: gripper`.
- `mapping.yaml`: the two #0-48 screws map to `motor-tab-screw` (variant noted
  in D-001); `tapping-0-48` retired, never to be reused.
- `viewer/src/island/state.ts`: fasteners are shown at the step the pipeline
  allocated; unallocated fasteners never show; `joint` wins over the instance
  name regex; `screwAxis` for the explode. Tests updated.
- `viewer/src/island/Viewer.tsx`: fastener explode along the screw axis with a
  dashed guide. The design branch reworks the same offset (explode away from
  the host part); the fastener branch slots in ahead of it at merge time.
- `scripts/src/validate-lib.ts`: a fastener placement with neither hole host
  nor joint fails; a step whose declared quantity the geometry cannot place
  at that step fails. Both arms currently match exactly.
- Data: F-011, 012, 014, 021, 041, 042 gained the seating facts above with
  STEP placement-check sources; L-061 lost `unverified` (its hole is now
  sourced) and keeps `approximation`; L-063 gained `approximation` and the
  photo source; `fasteners.yaml`, `parts.yaml`, `discrepancies.md`
  (D-001, D-005) and `SOURCES.md` updated.

## Verified

- Pipeline: every declared fastener quantity in both arms is placed at its
  step; 6 horn screws synthesized; pytest 4/4; ruff clean.
- `pnpm validate` passes with the new rules; vitest 7/7 (scripts), 6/6
  (viewer); site builds (162 pages).
- Chrome, local preview: F-011 (four screws, none in the holder), F-012
  (holder plus its two side screws), F-063 (claw with its screws in the plate
  holes), L-061 (handle under the wrist), L-063 (trigger with four screws,
  loop ahead of the grip).

## Flags changed

| Flag                      | Before                 | After                                                           |
| ------------------------- | ---------------------- | --------------------------------------------------------------- |
| L-061 `unverified`        | set                    | cleared: hole pair sourced to the two STEP files                |
| L-063 `approximation`     | unset                  | set: trigger rest angle from the photo                          |
| `tapping-0-48 unverified` | set                    | id retired; the screws are `motor-tab-screw` (D-001 stays open) |
| `m3-nut`                  | both arms              | follower only                                                   |
| horn screws               | absent from the viewer | 6 synthesized placements, `approximation: true`                 |

## Open questions

1. The trigger overlaps the leader holder in its rest pose (the leader servo
   pocket is assumed to sit where the follower body's does). A photo of the
   leader wrist from the side, or a measurement of the holder's servo pocket
   position, would settle both.
2. The two M3 nuts in the follower gripper body: what are they for? No text
   mentions them. They stay hidden until a step lists them.
3. Should the cable centreline derivation be seeded so regeneration is
   reproducible? Until then `git checkout data/cables.yaml` after a pipeline
   run.
