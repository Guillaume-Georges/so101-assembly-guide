# CLAUDE.md — so101-assembly-guide

## Mission
Functional, source-traceable interactive 3D assembly guide for the SO-101 arm.
Accuracy beats polish. A wrong step is worse than a missing step.

## Non-negotiables
1. **No invented facts.** Dimensions, servo assignments, gear ratios, fastener
   sizes, torque, cable routes come from a cited public source or are flagged
   `unverified: true`. Never fill a gap from general knowledge of "how robot
   arms usually go together". An `unverified` step renders with a visible
   flag, is `noindex`, and is left out of the sitemap until sourced.
2. **Every step cites its source.** `source:` is a required field: upstream
   file path + section, or URL + retrieved date, or video URL + timestamp.
3. **Licence hygiene.** Upstream files keep their licence and attribution.
   SOURCES.md lists every external asset, its licence, and where it lives in
   the repo. Nothing scraped from behind a login: Discord threads are not
   citable; find or create a public source (GitHub issue, forum post, wiki)
   instead. If a licence is unclear, don't import — ask.
4. **Data model is the product.** The site is one renderer of
   `data/`; the 3D island and the printable checklist are two more. Anything
   a renderer needs must be expressible in the schema first.
5. **Build fails loudly.** Schema violation, part in geometry without a BOM
   id, step referencing an unknown part/tool/fastener, missing source — all
   fail CI.

## Repo layout
```
/data
  parts.yaml            # BOM: id, name, qty, category, source_file, licence
  servos.yaml           # joint -> servo id, gear ratio, orientation, leader|follower
  fasteners.yaml        # id, spec (e.g. M2x6 SHCS), qty, where used
  tools.yaml            # id, name, size, optional purchase note
  troubleshooting.yaml  # id, title = exact error string, aliases, symptoms, cause, fix, related_steps, source
  vendors.yaml          # vendor, kit name, part-numbering map to our ids, notes
  assemblies/
    follower.yaml       # ordered steps
    leader.yaml
  discrepancies.md      # where sources disagree
  schema/*.json         # JSON Schema for each file above
/upstream               # pinned upstream repos (submodules or snapshots + hashes)
/pipeline               # Python (uv): STEP/STL -> GLB + placements.json
/viewer                 # Astro static pages + React Three Fiber client island (ADR-0002)
/scripts                # validate, build-data, export-checklist
/docs                   # thesis, decisions (ADRs), phase reports
SOURCES.md
```

## Step schema (minimum)
```yaml
- id: F-012
  slug: mount-shoulder-lift-servo   # frozen at first publish, unique, never changed
  title: Mount shoulder-lift servo
  assembly: follower
  parts: [servo-sts3215-345, shoulder-bracket]
  servo_slot: shoulder_lift          # resolves via servos.yaml
  orientation_note: "horn faces +X; cable exits toward base"
  fasteners: [{ id: m2x6-shcs, qty: 4 }]
  tools: [hex-1.5]
  cable_path: [pt, pt, pt]           # optional, in assembly frame
  warnings: ["Do not power servo before setting ID"]
  check: "Servo horn rotates freely by hand through full range"
  source:
    - { ref: upstream/SO-ARM100/README.md#follower-assembly }
    - { ref: "https://…", retrieved: 2026-09-07 }
  unverified: false
  approximation: false
```

## Stack decisions (don't relitigate without an ADR)
- Geometry: cadquery/OCP for STEP; Blender headless only as fallback.
  Output GLB, Y-up, metres, one file per part, names = part ids.
- Site: Astro pre-renders one static HTML page per step, part, servo slot,
  tool, troubleshooting issue, comparison, plus `/kits` and `/faq`, all from
  the compiled data bundle. The React Three Fiber + drei viewer is a client
  island; every page is complete without it (ADR-0002).
- URLs: `/{assembly}/{id-number}-{slug}`; slugs come from ids and the frozen
  `slug` field, never from list position. An indexed URL never changes.
- Hosting: static on GitHub Pages. No backend, no auth. Analytics only if
  cookieless, consentless, script-only and run by nobody we operate; Google
  Search Console from first deploy. No user tracking.
- Per page: title, meta description, canonical, BreadcrumbList + TechArticle
  JSON-LD, OG image (text card in v1), sitemap.xml, robots.txt, PWA manifest.
  Lighthouse CI: SEO 100 hard-fails; performance gated by per-metric budget
  (LCP < 2.5 s on a throttled mid-range phone), not by score.
- Geometry delivery: GLBs meshopt- or Draco-compressed by the pipeline,
  loaded per step, next step preloaded. Embed route `/embed/{assembly}/{slug}`
  mounts the island standalone for vendor wikis.
- i18n: English in `data/`; translations later as sidecar overlays under
  `data/i18n/{locale}/` keyed by stable id. No schema change for this in v1.
- Data: YAML authored by humans, compiled to JSON at build, validated by
  JSON Schema. IDs are stable and never reused.
- JS: pnpm. Python: uv. Lint: prettier, eslint, ruff. Tests: vitest, pytest.

## Working rules
- Phases gate on Guillaume's review. Don't start the next phase unasked.
- Small commits, one concern each, typed trailers per global CLAUDE.md.
- Every phase ends with: C&C report, flag list (`unverified`,
  `approximation`) with the action that would clear each, and open questions.
- Remote actions (creating repos, enabling Pages, adding secrets) are
  confirmed before execution. Nothing here is production, but treat the
  GitHub org as shared.
- When a source and reality disagree (e.g. a kit vendor ships a different
  bracket), record it in discrepancies.md and prefer the upstream
  TheRobotStudio spec, noting the variant.
- `docs/private/` is gitignored and local-only. Anything about the project
  as a venture rather than as an engineering artefact goes there and nowhere
  else in the tree: positioning, audience and search reasoning, naming and
  domain, commercial terms, outreach and partner notes. Public files record
  the resulting decision, never the reasoning kept there. Claude's memory
  store lives outside the repo and is never committed either.

## Out of scope for v1
Firmware, calibration, LeRobot software setup, leader-follower teleop, kit
vendor variants beyond noting them (a part-numbering cross-reference in
`vendors.yaml` is "noting"), and any brand other than SO-101. Consequences:
troubleshooting pages in v1 cover assembly issues only (wrong servo at joint,
wrong ID, binding, cable pinch); calibration and LeRobot error strings are a
named post-v1 phase. `/compare/` in v1 is SO-100 vs SO-101 only, sourced from
the shared upstream repo. `/kits` links vendors; no prices without a
`retrieved` date.
