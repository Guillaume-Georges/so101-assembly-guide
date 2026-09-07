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

| Source                                                                                                            | Licence (verified)                                                                                           | Retrieved  | Cited as                       | Used for                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [Waveshare wiki — SO-ARM100/101 Kit Assembly](https://www.waveshare.com/wiki/SO-ARM100/101_Kit_Aassembly)         | Not stated on the page; cited by permalink (`oldid=109741`), no text or images copied                        | 2026-09-07 | `source.ref` URL + `retrieved` | Step-by-step wording (F1–F11, L9–L12 part numbering), servo-5 wiring warning, ID-before-assembly advice, kit servo variants |
| [Seeed Studio wiki — Getting Started with SO-ARM10x in LeRobot](https://wiki.seeedstudio.com/lerobot_so100m_new/) | Repo `Seeed-Studio/wiki-documents` is GPL-3.0 (`LICENSE` read 2026-09-07); cited by URL only, nothing copied | 2026-09-07 | `source.ref` URL + `retrieved` | Servo/joint table (L1–L6, F1–F6), kit editions and voltages, "cable clips" note                                             |
| [SVRC — SO-101 Setup Guide](https://www.roboticscenter.ai/en/hardware/so-101/setup)                               | No licence or terms shown; cited by URL only                                                                 | 2026-09-07 | `source.ref` URL + `retrieved` | Cross-check only; carries no screw or servo detail. Its 12V supply claim is logged as D-002                                 |
| [phospho docs — SO-101 quickstart](https://github.com/phospho-app/docs/blob/main/mintlify/so-101/quickstart.mdx)  | Repo has no LICENSE file; cited by URL only                                                                  | 2026-09-07 | not cited in data              | Read for cross-check; no assembly detail beyond "keep the gears in the motors" for the SO-101 leader                        |

Discord and other login-gated pages are not citable (contract).

## Servo geometry (Phase 2)

Feetech STS3215 CAD: no licence-clean public model confirmed yet. If none is
found, the pipeline emits a datasheet-driven primitive flagged
`approximation: true`, and the datasheet reference goes here.

## Derived assets

| Asset      | Derived from | Licence | Lives in |
| ---------- | ------------ | ------- | -------- |
| _none yet_ |              |         |          |
