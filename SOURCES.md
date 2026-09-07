# SOURCES — external assets and their licences

Every external repo, file, page, or video this project draws from, with its
licence (verified by reading the LICENSE file, not assumed), the commit or
retrieval date, and where it lives in this repo. Add a row before importing
anything. If a licence is unclear, do not import; ask.

## Upstream repositories

| Source | Licence (verified) | Pinned at | Lives in | Used for |
| --- | --- | --- | --- | --- |
| [TheRobotStudio/SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100) | Apache-2.0 — `LICENSE` read 2026-09-07 | not yet pinned; `main` was `eecbe3e0a9ebb23e25ad7b2759b03884c6660903` on 2026-09-07 | `upstream/SO-ARM100/` (Phase 1) | STEP/STL geometry, BOM, assembly instructions (`README.md`, `3DPRINT.md`, `docs/`, `STEP/`, `STL/`) |
| [huggingface/lerobot](https://github.com/huggingface/lerobot) | Apache-2.0 — `LICENSE` read 2026-09-07 (copyright The Hugging Face team) | not yet pinned; `main` was `3f2c29ef7e44b1ddccbcda3b6a63939e53639e9e` on 2026-09-07 | `upstream/lerobot/docs/source/so101.mdx` snapshot (Phase 1) | SO-101 page: servo IDs, leader/follower motor differences, assembly video links |

Apache-2.0 obligations we honour: keep the LICENSE and any NOTICE with the
copied files, keep attribution, mark any modifications we make (we do not
plan to modify upstream files; derived GLBs are listed below when produced).

## Secondary guides (Phase 1 cross-check)

Candidates, to be verified for licence and recorded here before use:
Seeed Studio wiki (SO-101 page), phospho docs, SVRC setup guide. Not yet
imported; nothing is cited from them until this table has their rows.

## Servo geometry (Phase 2)

Feetech STS3215 CAD: no licence-clean public model confirmed yet. If none is
found, the pipeline emits a datasheet-driven primitive flagged
`approximation: true`, and the datasheet reference goes here.

## Derived assets

| Asset | Derived from | Licence | Lives in |
| --- | --- | --- | --- |
| _none yet_ | | | |
