# SOURCES — external assets and their licences

Every external repo, file, page, or video this project draws from, with its
licence (verified by reading the LICENSE file, not assumed), the commit or
retrieval date, and where it lives in this repo. Add a row before importing
anything. If a licence is unclear, do not import; ask.

## Upstream repositories

| Source                                                                  | Licence (verified)                                                       | Pinned at                                                                                                     | Lives in                                             | Used for                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [TheRobotStudio/SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100) | Apache-2.0 — `LICENSE` read 2026-09-07                                   | not yet pinned; `main` was `eecbe3e0a9ebb23e25ad7b2759b03884c6660903` on 2026-09-07                           | `upstream/SO-ARM100/` (Phase 1)                      | STEP/STL geometry, BOM, assembly instructions (`README.md`, `3DPRINT.md`, `docs/`, `STEP/`, `STL/`) |
| [huggingface/lerobot](https://github.com/huggingface/lerobot)           | Apache-2.0 — `LICENSE` read 2026-09-07 (copyright The Hugging Face team) | snapshot at `3f2c29ef7e44b1ddccbcda3b6a63939e53639e9e` (main, 2026-09-03), see `upstream/lerobot/SNAPSHOT.md` | `upstream/lerobot/docs/source/so101.mdx` + `LICENSE` | SO-101 page: servo IDs, leader/follower motor differences, assembly video links                     |

Apache-2.0 obligations we honour: keep the LICENSE and any NOTICE with the
copied files, keep attribution, mark any modifications we make (we do not
plan to modify upstream files; derived GLBs are listed below when produced).

## Secondary guides (cross-check only; cited by URL, nothing copied)

| Source                                                                                                                                                                            | Licence (verified)                                                                                           | Retrieved  | Cited as                       | Used for                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [Waveshare wiki — SO-ARM100/101 Kit Assembly](https://www.waveshare.com/wiki/SO-ARM100/101_Kit_Aassembly)                                                                         | Not stated on the page; cited by permalink (`oldid=109741`), no text or images copied                        | 2026-09-07 | `source.ref` URL + `retrieved` | Step-by-step wording (F1–F11, L9–L12 part numbering), servo-5 wiring warning, ID-before-assembly advice, kit servo variants |
| [Seeed Studio wiki — Getting Started with SO-ARM10x in LeRobot](https://wiki.seeedstudio.com/lerobot_so100m_new/)                                                                 | Repo `Seeed-Studio/wiki-documents` is GPL-3.0 (`LICENSE` read 2026-09-07); cited by URL only, nothing copied | 2026-09-07 | `source.ref` URL + `retrieved` | Servo/joint table (L1–L6, F1–F6), kit editions and voltages, "cable clips" note                                             |
| [SVRC — SO-101 Setup Guide](https://www.roboticscenter.ai/en/hardware/so-101/setup)                                                                                               | No licence or terms shown; cited by URL only                                                                 | 2026-09-07 | `source.ref` URL + `retrieved` | Cross-check only; carries no screw or servo detail. Its 12V supply claim is logged as D-002                                 |
| [phospho docs — SO-101 quickstart](https://github.com/phospho-app/docs/blob/main/mintlify/so-101/quickstart.mdx)                                                                  | Repo has no LICENSE file; cited by URL only                                                                  | 2026-09-07 | not cited in data              | Read for cross-check; no assembly detail beyond "keep the gears in the motors" for the SO-101 leader                        |
| [LeRobot `SO101_Leader.webp`](https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/lerobot/SO101_Leader.webp) (image embedded by the pinned `so101.mdx`) | Served with the Apache-2.0 LeRobot docs; cited by URL only, not copied                                       | 2026-09-07 | `source.ref` URL + `retrieved` | Finished leader: trigger loop orientation (L-063), handle hanging below the wrist                                           |

Discord and other login-gated pages are not citable (contract).

## Servo geometry (Phase 2)

| Source                                                                                                                                                                                                  | Licence                                                                    | Retrieved  | Used for                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Feetech STS3215 product specification A/0, 2020-03-28](https://www.mantech.co.za/Datasheets/Products/STS3215-200620A.pdf) (distributor-hosted copy of the Feetech document; original at feetechrc.com) | Manufacturer datasheet, no licence stated; facts cited, drawing not copied | 2026-09-07 | Section 9: outside dimensions 45.23 x 24.73 x 35 mm, ø6 x 3.4 output boss, 25T horn, M3x6 horn screw. Section 10 (Accessories, read 2026-09-08): both horns ø19.95, ø14 bolt circle 4-M3, ø9 hub, plate 2.5 / 2.1 mm; drives the horn meshes and the boss on the servo body |

The assembly STEP embeds six `ST3215 Servo v2` sub-assemblies (internal
names `SCS215`, `ZK_122`, `MOTOR-1723`, Chinese horn names) and a
`Bus Servo Adapter (A)` PCB with full component models. Their provenance is
not stated in the upstream repo and they do not match the repo's own
`STEP/SO100/STS3215_03a.step` (single body, Autodesk export). Read 2026-09-08:
their internal names (`SCS215`, `MOTOR-1723`, `PCB-CHAZUO_92`, the 金属舵盘
horns) are those of Waveshare's ST3215 download (`ST3215-3D.zip`), which
states no licence. The pipeline uses them **only to extract transforms** and
exports the repo's own `STS3215_03a` body, datasheet horns and a bounding-box
board (`approximation: true`) in their place; no vendor mesh is
redistributed. Upstream issue drafted in
`docs/upstream-issues/embedded-vendor-models.md`.

## Derived assets

| Asset                                                                                                          | Derived from                                                                                                                                                                                                          | Licence                                                                                                                                                                                                                                      | Lives in                                         |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `servo-sts3215.glb` (servo body: case and rear boss, fused horn plates cut off, datasheet ø6 x 3.4 boss added) | `upstream/SO-ARM100/STEP/SO100/STS3215_03a.step` at `eecbe3e0a9ebb23e25ad7b2759b03884c6660903`; single solid, added upstream in `de67464` (2025-01-27) from the project's own SolidWorks export, no vendor part names | Apache-2.0 (repo `LICENSE` read 2026-09-08; attribution per `CITATION.cff`; modified, per Apache-2.0 §4(b)). Provenance question 2 in `docs/upstream-issues/embedded-vendor-models.md` is open, so the placement stays `approximation: true` | `viewer/public/so101/geometry/servo-sts3215.glb` |
| `servo-horn-geared.glb`, `servo-horn-plain.glb`                                                                | Feetech STS3215 datasheet section 10 drawings (dimensions only; outline drawn as the circle, spline omitted)                                                                                                          | Facts from the datasheet, no drawing copied                                                                                                                                                                                                  | `viewer/public/so101/geometry/`                  |
