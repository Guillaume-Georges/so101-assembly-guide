# ADR-0001 — Founding stack

Status: accepted (2026-09-07). Recorded from the project contract; change only
with a superseding ADR.

- **Data:** human-authored YAML in `data/`, compiled to JSON at build,
  validated by JSON Schema (draft 2020-12, ajv) plus cross-reference rules in
  `scripts/src/validate-lib.ts`. IDs are stable and never reused.
- **Geometry:** cadquery/OCP reads the assembled STEP; Blender headless (bpy)
  only for parts missing from the STEP. Output: GLB, Y-up, metres, one file
  per part, file name = part id.
- **Viewer:** Vite + React + TypeScript + React Three Fiber + drei. Static,
  GitHub Pages, no backend/auth/analytics in v1.
- **Tooling:** pnpm (JS), uv (Python), prettier + eslint + ruff, vitest + pytest.

Why JSON Schema + a script rather than schema only: references between files
(step → part, step → servo slot) and the "source required unless unverified"
rule cannot be expressed in JSON Schema alone; both layers fail CI.
