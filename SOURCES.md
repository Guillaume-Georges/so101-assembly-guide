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

| Source                                                                                                                                                                                                  | Licence                                                                    | Retrieved  | Used for                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Feetech STS3215 product specification A/0, 2020-03-28](https://www.mantech.co.za/Datasheets/Products/STS3215-200620A.pdf) (distributor-hosted copy of the Feetech document; original at feetechrc.com) | Manufacturer datasheet, no licence stated; facts cited, drawing not copied | 2026-09-07 | Outside dimensions 45.23 x 24.73 x 35 mm, ø6 output boss, 25T horn, M3x6 horn screw, "No Accessories"; drives the servo primitive |

The assembly STEP embeds six `ST3215 Servo v2` sub-assemblies (internal
names `SCS215`, `ZK_122`, `MOTOR-1723`, Chinese horn names) and a
`Bus Servo Adapter (A)` PCB with full component models. Their provenance is
not stated in the upstream repo and they do not match the repo's own
`STEP/SO100/STS3215_03a.step` (single body, Autodesk export). The pipeline
uses them **only to extract transforms** and exports datasheet/bounding-box
primitives (`approximation: true`) in their place; no vendor mesh is
redistributed. Upstream issue drafted in
`docs/upstream-issues/embedded-vendor-models.md`.

## Derived assets

| Asset      | Derived from | Licence | Lives in |
| ---------- | ------------ | ------- | -------- |
| _none yet_ |              |         |          |
