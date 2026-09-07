# Phase 2 — geometry pipeline (2026-09-07)

## Landed

- `pipeline/`: `walk.py` (XCAF walk of `SO101 Assembly.step`: 258 solid
  leaves, 124 assemblies, 4 s), `mapping.py` + `mapping.yaml` (every solid
  resolves to a data id or the run fails), `geom.py` (tessellation, mm/Z-up
  → m/Y-up, primitives), `export.py`, `hand_place.py`, CLI `so101-pipeline`.
  Deps: cadquery 2.8 / OCP, trimesh, numpy, pyyaml. Tests: 4.
- Output: 29 meshes + 113 placements in `pipeline/out` (gitignored);
  `pnpm publish-geometry` meshopt-compresses them into
  `viewer/public/geometry/` (tracked, 4.4 MB → 0.85 MB) so Pages never needs
  cadquery. `placements.json` carries kind, id, mesh, raw STEP path, 4x4
  transform (m, Y-up), arm tags, approximation flag, and the feature used.
- Validator: every placement checked by kind against parts/fasteners.
  CI: pipeline job checks out the submodule and runs the mapping dry run.
- Pre-Phase-2 changes from the review, all in: `extends:` (22 leader steps
  inherit), servo `variants` with per-variant supply (D-002), `aka:`
  aliases (D-005), vendor kit hardware/servos (D-001/D-004), Waveshare
  F1–F11 / L1–L12 and Seeed maps in `vendors.yaml`, both mounting plates
  as vendor parts, supply warnings on F/L-002 and F/L-071.

## What the STEP turned out to be

A follower arm, "SO101 Assembly v4" (Fusion export). Findings, all logged
in `data/discrepancies.md`:

- Wiring holders (D-003): eleven zero-solid components nested in the
  printed-part sub-assemblies; the printed bodies' volumes equal the STLs.
  No part exists. Id `wiring-holder` retired. Upstream issue drafted.
- `Base_08p` is the base motor holder; `Wrist_Roll_Pitch_SO100` is the
  wrist holder (D-005). Matched via `aka`, confirmed by placement.
- Six servo sub-assemblies (`ST3215 Servo v2`, internal `SCS215`) and a
  full `Bus Servo Adapter (A)` PCB are embedded vendor models that do not
  match the repo's `STS3215_03a.step`. Used for transforms only; datasheet
  and bbox primitives exported instead. Upstream issue drafted.
- Six cable bodies (`Component1–4, 6, 7`) and two connector housings are
  drawn upstream: exported as-is under `servo-cable-3pin`; they are the
  source for Phase 3 cable paths.
- Fasteners in the STEP: 45× M3x6 pan head, 22× #1-42 tapping (motor
  tabs), 2× #0-48 tapping, 4× M2.5x4 + 4 spacers (board), 2× M3 nuts.
  Handle, trigger and the leader wrist have no solid.

## Placement check (clears Phase 1's role inferences)

Fraction of each servo's bounding box inside each printed part's bounding
box, world frame:

| Part                                | S1   | S2   | S3   | S4   | S5   | S6   | Confirms                                           |
| ----------------------------------- | ---- | ---- | ---- | ---- | ---- | ---- | -------------------------------------------------- |
| base-so101                          | 1.00 |      |      |      |      |      | motor 1 in the base                                |
| base-motor-holder-so101 (Base_08p)  | 0.74 |      |      |      |      |      | first motor holder; touches plate and board (0 mm) |
| rotation-pitch-so101                | 0.49 | 0.42 |      |      |      |      | shoulder on motor-1 horns                          |
| motor-holder-so101-base             |      | 0.42 |      |      |      |      | shoulder motor holder                              |
| upper-arm-so101                     |      | 0.48 | 0.44 |      |      |      | upper arm on motor-2 horns, motor 3 inside         |
| under-arm-so101                     |      |      | 0.50 | 0.36 |      |      | forearm on motor-3 horns                           |
| motor-holder-so101-wrist            |      |      |      | 0.44 |      |      | motor holder 4                                     |
| wrist-roll-pitch-so101 (SO100 name) |      |      |      | 0.49 | 0.97 |      | wrist holder                                       |
| wrist-roll-follower-so101           |      |      |      |      |      | 1.00 | gripper body; horn-5 recess at its origin          |
| moving-jaw-so101                    |      |      |      |      |      | 0.40 | claw on motor-6 horns                              |

Twelve follower steps, two parts and the Waveshare map lost their
`unverified` flag with the fact above cited to the STEP.

## Hand-placed leader parts (all `approximation: true`)

| Part                         | Feature                                                                                                                             | Residual assumption                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| wrist-roll-so101             | stepped horn recess r10/r12/r11.24/r13.24 about +Z at the origin, same as on the follower gripper body (offset y −0.22, z +0.95 mm) | in-plane heading from centre of mass (both −X)                                                        |
| leader gripper servo + horns | re-based with the holder                                                                                                            | the holder's servo pocket sits where the follower body's does                                         |
| trigger-so101                | r=10 horn face at the origin ↔ the jaw's drive-side r=10 face at z −17.4                                                            | rotation about the horn axis equals the jaw's                                                         |
| handle-so101                 | **unplaced** (mesh exported)                                                                                                        | one r=1.1 hole on a tilted face and an r=23.81 arc vs eight r=1.0 holes on the holder: no unique pair |

## Flags (19) and what clears each

| Flag                                                  | Entries                                      | Clears when                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `approximation` servo geometry                        | 4 servo parts, 2 horns, board                | a licence-clean STS3215 / bus-adapter model, or upstream confirming the embedded models' terms (issue drafted) |
| `unverified` L-060, L-062                             | 2                                            | a photo or measurement of the leader holder and trigger seated; D-006 for the horn count                       |
| `unverified` L-061 handle                             | 1                                            | a photo of the handle on the holder showing which hole the M2x6 uses                                           |
| `unverified` STEP-only fasteners                      | m2.5x4, spacer-m2.5-h6, m3-nut, tapping-0-48 | any assembly text naming them, or a kit inventory                                                              |
| `unverified` servo-cable-3pin qty                     | 1                                            | kit page listing cable count                                                                                   |
| `unverified` seeedstudio-mounting-plate-so101         | 1                                            | a source describing its use                                                                                    |
| `unverified` vendors roboseasy, neobot, autodiscovery | 3                                            | vendor page retrieved and dated                                                                                |

## Clarity & Coherence

- Fixed: `Placement.path` is the raw occurrence path (instance names), not
  the normalised one, so horns can be grouped with their servo.
- Fixed: `pipeline/pyproject.toml` ruff line length 100 → 120 (feature
  strings); prettier stays at 100 for TS.
- Dismissed: `viewer/` is still the Phase 0 Vite scaffold; ADR-0002 says
  Phase 3 starts from Astro and deletes it. The published geometry folder is
  framework-neutral.
- Dismissed: the six cable GLBs share one part id; per-occurrence mesh names
  keep them distinct until cable paths become data (Phase 3).
- Centralization: `scripts/src/paths.ts` and `pipeline/cli.py` both derive
  the repo root from their own file; two lines, two languages, kept.

## Open questions

1. Handle placement: can you photograph the handle seated on the leader
   holder (or say which of the eight M2 holes it uses)? That plus the r=23.81
   saddle gives a unique frame.
2. Servo primitive: the datasheet page read gives no horn diameter; the
   19.2 mm disc is the vendor model's extent. Acceptable as approximation,
   or measure a horn?
3. Phase 3 plan is Astro + R3F island per ADR-0002. The placements carry
   `assembly` tags and raw STEP paths; cable bodies are meshes, not
   polylines. Do you want `cable_path` derived (centreline skeleton) in
   Phase 3, or hand-authored from the meshes?
