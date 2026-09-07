# Phase 1 — data ingestion (2026-09-07)

## Landed

- `upstream/SO-ARM100` as a submodule pinned at `eecbe3e`; `upstream/lerobot`
  as a one-page snapshot (`docs/source/so101.mdx` + LICENSE) at `3f2c29e`.
  Both Apache-2.0, verified from their LICENSE files.
- Schema additions from ADR-0002: required frozen `slug` on steps,
  `troubleshooting.yaml`, `vendors.yaml`, with cross-reference rules.
- `data/parts.yaml` 26 parts, `servos.yaml` 12 slots, `fasteners.yaml` 2,
  `tools.yaml` 4, `assemblies/follower.yaml` 26 steps,
  `assemblies/leader.yaml` 26 steps, `troubleshooting.yaml` 3 issues,
  `vendors.yaml` 10 vendors. All validate; `pnpm build` produces the bundle.
- Cross-check against Waveshare wiki, Seeed wiki, SVRC guide and phospho
  docs. Six discrepancies logged in `data/discrepancies.md`; three
  "checked, consistent" items recorded so nobody re-checks them.

## What the primary source does and does not say

The SO-ARM100 README delegates assembly to the LeRobot so101 page. That page
gives, per joint: which motor number, screw sizes and counts, horn rules, and
a video. It does **not** name printed parts by file name, give a screw type,
list cable quantities, or give any orientation beyond "from the top". The
Waveshare wiki fills orientation and cable-routing gaps with its own F1–F11 /
L9–L12 numbering; those additions are cited to its permalink.

## Flags (32) and what clears each

| Flag                                                                  | Entries                                                                       | Clears when                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `unverified` step: printed part matched to its role by file name only | F/L-012, 013, 014, 021, 032, 041, 042, 050, 052, 060, 061, 070 and L-062 (25) | Phase 2 walks `SO101 Assembly.step`, places each solid, and the placement confirms the role. Clear per step in the mapping commit. |
| `unverified` part `servo-cable-3pin` (qty 0)                          | 1                                                                             | A source stating how many cables ship or are needed (kit page, or count from the assembly STEP wiring).                            |
| `unverified` part `wiring-holder` (qty 0)                             | 1                                                                             | A source that says where the eleven STEP wiring holders go, or upstream adding an STL and a step (D-003).                          |
| `unverified` part `seeedstudio-mounting-plate-so101`                  | 1                                                                             | A source describing its use (Seeed bus board plate?).                                                                              |
| `unverified` vendors roboseasy, neobot, autodiscovery                 | 3                                                                             | README lists them without kit contents; the vendor page, retrieved and dated.                                                      |
| `unverified` vendor waveshare part_map                                | 1                                                                             | Same Phase 2 placement check as the steps.                                                                                         |

`approximation`: none yet (Phase 2 servo geometry will add the first).

## Clarity & Coherence

- Fixed: none needed in code; data generated once from
  `scratchpad/gen.py` (not committed: the YAML is the source of truth, the
  generator was a one-off).
- Dismissed: `orientation_note` and `check` are prose fields the schema
  cannot validate against sources; the review rule is "restate, never add".
- Centralization: joints 1–5 steps are word-for-word identical between the
  two arms except the servo part. Kept duplicated: each step is its own URL
  (ADR-0002) and the follower/leader files are meant to be read alone.
- Coherence with ADR-0002: the second session's commit `ace3f96` landed
  between the schema and data commits; no data-affecting change.

## Open questions

1. D-001 screw size: LeRobot says M2x6, the STEP models M2.5x4. Do you have
   a kit at hand to measure? That single measurement settles fasteners.
2. Phase 2 will start from `STEP/SO101/SO101 Assembly.step` (20 MB, 387
   occurrences, includes servo internals and PCB components). It lacks
   `Base_motor_holder`, `Handle`, `Trigger` by name (D-005); the per-part
   STEP files cover them. OK to treat the per-part STEPs as fallback with
   hand-placed transforms flagged `approximation: true`?
3. Servo geometry: the assembly STEP embeds six servo sub-assemblies
   ("Сборка14", Russian for "Assembly 14"); provenance unknown. Use them
   as-is (Apache-2.0 via the upstream repo) or model a datasheet primitive?
