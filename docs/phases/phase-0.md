# Phase 0 — repo + infra (2026-09-07)

## Landed (local only; nothing remote yet)

- Contract in `CLAUDE.md` (verbatim, excluded from prettier), MIT `LICENSE`.
- Monorepo: `data/` (+ `schema/`), `upstream/` (empty), `pipeline/` (uv),
  `viewer/` (pnpm), `scripts/` (pnpm), `docs/`.
- JSON Schemas (draft 2020-12) for parts, servos, fasteners, tools, assembly
  steps; `common.json` for shared defs. Empty data stubs validate.
- `pnpm validate [--flags]`: schema + cross-reference rules + flag listing.
  `pnpm build-data`: refuses invalid data, writes the viewer bundle.
  `pnpm build`: data → JSON → Vite/R3F build. Vitest covers the validator.
- Pipeline skeleton with pytest + ruff; no geometry deps until Phase 2.
- CI: `validate.yml`, `build.yml`, `deploy.yml` (Pages). Pre-commit: hooks,
  ruff, prettier, schema validation — installed and passing.
- `SOURCES.md`: both upstream repos verified Apache-2.0 from their LICENSE
  files; head commits recorded as observed, not pinned.

## Verified locally

validate, scripts tests (5), typecheck, eslint, prettier, `pnpm build`,
`uv run pytest` (2), ruff check/format, `pre-commit run --all-files`.
CI workflows are unexercised until the repo is pushed.

## Flags

`unverified`: none. `approximation`: none. Data files are empty until Phase 1.

## Clarity & Coherence

- Fixed: `data/schema/common.json:35` explicit type in `if` (ajv strict).
- Fixed: `CLAUDE.md` added to `.prettierignore` after prettier rewrote the
  contract's YAML example.
- Centralization: none spotted.
- Dismissed: viewer chunk-size warning (1 MB three.js bundle) — Phase 3 decides
  code-splitting once the real viewer exists.

## Open questions (gate Phase 1)

1. GitHub repo name (default `so101-assembly-guide`) and visibility
   (default public).
2. Enable GitHub Pages with source = GitHub Actions after the first push?
   `deploy.yml` fails on `main` until this is set.
3. Toolchain: Homebrew stalled on its API download, so pnpm was installed via
   `npm i -g pnpm@10` and uv via Astral's installer into `~/.local/bin`.
   Say if you would rather these be Homebrew-managed.
4. Phase 1 upstream form: git submodules (exact hash, large clone including
   `STEP/`+`STL/`) vs. sparse snapshots with hashes in `SOURCES.md`.
   Leaning submodule for SO-ARM100, snapshot of one page for lerobot docs.
