# Phase 3 — site + 3D island (2026-09-07)

Live: https://guillaume-georges.github.io/so101-assembly-guide/

## Landed

- Astro static site replaces the Vite scaffold (ADR-0002). 161 pre-rendered
  pages from the data bundle; the React Three Fiber viewer is a
  `client:visible` island and every page is complete without it.
- Pre-Phase-3 changes: D-001 stays open (`motor-tab-screw` carries the
  STEP default plus LeRobot/Waveshare variants, unverified until a kit is
  measured; `m2x6` is now only the handle screw); horn disc ø19.2 sourced
  as measured from the embedded vendor model; handle placed from the
  LeRobot leader video pose (0:14, 0:24) as `approximation` since neither a
  feature pair nor the assembly STL (a follower, no handle body) allows
  registration; six cable centrelines derived in the pipeline and written
  to `data/cables.yaml` (hand-authored entries win on regeneration); steps
  reference cables by id and the island draws them from data only.
- New datasets with schema: `compare.yaml`, `faq.yaml`, `printing.yaml`;
  `prep: true` on preparation steps; fastener placements carry `host` parts.
- Per page: title, description, canonical, OG text card (PNG via sharp),
  BreadcrumbList + TechArticle / FAQPage JSON-LD, sitemap (unverified steps
  and embeds excluded: 105 URLs), robots.txt (embeds disallowed), PWA
  manifest, dark default, 44 px targets, sticky step nav with progress,
  resume-last-step, error-string search (troubleshooting titles/aliases +
  step titles, client-side).
- Island: per-arm JSON endpoint + placements.json; visibility from a pure,
  tested module (`state.ts`, 5 tests): current = orange, installed = grey,
  future ghosted or hidden; explode slider on current-step parts; cable
  polylines; click a part for its BOM link; camera fits the built-so-far
  group; meshopt decoder; next-step meshes preloaded. Embed route
  `/embed/{assembly}/{nnn}-{slug}/` mounts it standalone (noindex).
- Lighthouse CI workflow: SEO 100 hard-fails, performance/LCP/bytes warn.
- Analytics: injected only when `PUBLIC_ANALYTICS_SCRIPT` and
  `PUBLIC_ANALYTICS_DOMAIN` are set at build time. Not set: choosing and
  registering a cookieless provider is a remote/account action for you.
  Search Console verification likewise needs the token from you.

## Generated URLs (160 HTML pages + endpoints)

| Section                                                        | Count                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| /follower/ + 26 steps                                          | 27                                                                                                                 |
| /leader/ + 26 steps                                            | 27                                                                                                                 |
| /parts/ + 26 parts                                             | 27                                                                                                                 |
| /servos/ + 12 slots                                            | 13                                                                                                                 |
| /tools/ + 4                                                    | 5                                                                                                                  |
| /troubleshooting/ + 3                                          | 4                                                                                                                  |
| /kits/, /faq/, /compare/so-100-vs-so-101/, /print-settings/, / | 5                                                                                                                  |
| /embed/{assembly}/{step}/ (noindex)                            | 52                                                                                                                 |
| endpoints                                                      | /data/{assembly}.json, /og/{assembly}/{nnn}.png, /og/site.png, robots.txt, manifest.webmanifest, sitemap-index.xml |

Full list: `docs/phases/phase-3-urls.txt`. Output 8.4 MB: 2.9 MB OG cards,
1.2 MB JS (three.js chunk 1.0 MB, loaded only with the island), 1.2 MB
geometry (meshopt).

## Lighthouse (CI run on 1ce8be3, desktop preset)

| Page                 | SEO | Performance    |
| -------------------- | --- | -------------- |
| step F-011           | 100 | ≥ 0.90         |
| home                 | 100 | ≥ 0.90         |
| troubleshooting page | 100 | 0.89 (warning) |

Reports are linked from the workflow log (temporary public storage). The
0.89 comes from the header search index inlined as a data attribute on
every page; moving it to a fetched JSON is the obvious fix and is deferred
to Phase 4 alongside a real device check (LCP < 2.5 s on a throttled phone
was not measured locally: Lighthouse could not find Chrome on this Mac).

## Verified in Chrome (local preview)

Step pages on desktop and at 400 px width: 3D island loads, current parts
highlighted, ghosted future parts, cable routes on the leader's final step,
embed route standalone, explode slider, sticky nav. No console errors.

## Flags (28)

`approximation`: 4 servo parts, 2 horns, board, handle part, L-061 (handle
pose from video), 6 derived cables. `unverified`: L-060, L-061, L-062,
motor-tab-screw, m2.5x4, spacer-m2.5-h6, m3-nut, tapping-0-48,
servo-cable-3pin qty, seeedstudio-mounting-plate, 3 vendors. What clears
each is unchanged from the Phase 2 report; the handle additionally needs a
photo showing which M2 hole the screw uses.

## Clarity & Coherence

- Fixed: drei `Bounds` replaced by an explicit fit that ignores `Line2`
  (extends Mesh with a unit quad) and runs after meshes exist.
- Fixed: motor-step checks reworded from "M2x6" to "motor-tab screws" after
  D-001 was reopened.
- Fixed: validator now checks step `cables` references (the earlier edit had
  not landed).
- Dismissed: the header nav wraps to three rows at 400 px; usable, a
  collapsed menu is polish.
- Coherence: `scripts/src/load.ts` and `viewer/src/lib/data.ts` declare the
  same types twice (TS in two packages). Kept for now; a shared
  `@so101/types` package is the clean fix once the schema settles. Ticketed
  here, not done.
- Centralization: `withBase()` in the viewer and `base` handling in
  `astro.config.mjs` derive the same prefix from `VITE_BASE`; two lines,
  kept.

## Open questions

1. Analytics provider (cookieless, script-only) and Search Console: which,
   and may I add the script/verification file once you have the tokens?
2. Domain: the brief's naming note (repo `so101`, multi-kit ambition) argues
   for deciding the custom domain before URLs get indexed. Deploy is live on
   the Pages URL now; say if you want `noindex` site-wide until the domain
   is decided.
3. Phase 4 scope check: printable checklist route from the same data, the
   search-index perf fix, and the Discord/forum post draft. Go?
