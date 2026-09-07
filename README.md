# SO-101 Interactive Assembly Guide

A functional, source-traceable 3D build companion for people assembling the
[SO-101](https://github.com/TheRobotStudio/SO-ARM100) open-source robot arm
(TheRobotStudio / Hugging Face LeRobot) for the first time. Every step shows
which parts go on, which servo (with gear ratio) sits at which joint and in
which orientation, which fasteners and tool to use, how the cable routes, and a
check to perform before moving on. Every fact traces to a public source; what
cannot be sourced is flagged `unverified`, never invented. The data model in
`data/` is the product. The 3D viewer is one renderer of it, a printable
checklist is another.

## Status

| Phase | Scope                                                                 | State       |
| ----- | --------------------------------------------------------------------- | ----------- |
| 0     | Repo, monorepo layout, schemas, CI, pre-commit, licence ledger        | in review   |
| 1     | Ingest upstream (SO-ARM100, LeRobot docs), BOM, servo table, steps, cross-check vs. secondary guides, `discrepancies.md` | pending |
| 2     | Geometry pipeline: STEP → per-part GLB + `placements.json`, servo model | pending    |
| 3     | Viewer: step navigation, highlight/ghost, explode, side panel, cable path, part inspector, mobile | pending |
| 4     | Printable checklist from the same data; call for builders to break it | pending     |

Phases gate on review. The standing rules live in [CLAUDE.md](CLAUDE.md).

## Layout

```
data/        YAML source of truth (parts, servos, fasteners, tools, assemblies/*, discrepancies.md) + JSON Schemas
upstream/    pinned upstream repos (Phase 1)
pipeline/    Python (uv): STEP/STL -> GLB + placements.json (Phase 2)
viewer/      Vite + React + TypeScript + React Three Fiber (Phase 3)
scripts/     validate, build-data, export-checklist (pnpm)
docs/        thesis, ADRs, phase reports
SOURCES.md   every external asset, its licence, where it lives here
```

## Develop

```sh
pnpm install                    # JS workspaces (scripts, viewer)
pnpm validate --flags           # JSON Schema + cross-reference checks, lists unverified/approximation flags
pnpm build                      # data -> viewer/src/generated/data.json -> viewer/dist
pnpm dev                        # viewer dev server
uv run --directory pipeline pytest
uvx pre-commit install          # ruff, prettier, schema validation on commit
```

Node 22+, pnpm 10, uv. CI runs the same validation on every push and deploys
the viewer to GitHub Pages from `main`.

## Licence

Our code and data files: MIT (see [LICENSE](LICENSE)). Upstream assets keep
their own licences and attribution; see [SOURCES.md](SOURCES.md).
