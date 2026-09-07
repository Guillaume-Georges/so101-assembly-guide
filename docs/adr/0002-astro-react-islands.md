# ADR-0002 — Astro static pages with a React Three Fiber island

Status: accepted (2026-09-07). Supersedes the **Viewer** line of ADR-0001
only; data, geometry and tooling lines stand. Reasoning in
`docs/seo-market-brief.md`.

## Context

ADR-0001 fixed the viewer as a Vite + React SPA. The SEO & market brief
(`docs/seo-market-brief.md`, §4) shows that an SPA whose content lives inside
a WebGL canvas is invisible to crawlers and heavy on a bench phone. The
audiences that matter arrive by search for step names, part names and exact
error strings, and by links from upstream docs. None of that traffic reaches a
page that renders as an empty `<canvas>`.

`viewer/` is an uncommitted three-file scaffold at the time of writing, so
the cost of changing now is near zero.

## Decision

- **Astro** builds every page as static HTML at build time from the compiled
  data bundle. One URL per step, part, servo slot, tool, troubleshooting
  issue, comparison, and the kits/FAQ pages.
- The **React Three Fiber viewer is a client island** (`client:visible` or
  `client:idle`), loaded after the HTML. The page is complete and correct
  without it; the island is an enhancement.
- **Slugs are stable.** Step URL = `/{assembly}/{id-number}-{slug}` where
  `slug` is a required, unique, never-changed field on the step. Position in
  the list never appears in a URL.
- The same data bundle feeds three renderers: HTML pages, the island's JSON,
  and the printable checklist. "Data model is the product" is unchanged.
- Static hosting on GitHub Pages stays; `base` is configured for the
  repository path until a custom domain exists.
- Analytics: cookieless, consentless, script-only, no backend we operate.
  Google Search Console from first deploy. This amends ADR-0001's "no
  analytics" to "no user-tracking analytics".

## Consequences

- Phase 3 scope grows: per-page metadata, JSON-LD, sitemap, robots, OG
  images (text cards first), PWA manifest, error-string search, embed route.
- New schema files land in Phase 1 alongside the existing ones:
  `troubleshooting.yaml`, `vendors.yaml`, each with a JSON Schema and
  cross-reference rules in `scripts/src/validate-lib.ts`.
- Lighthouse CI: SEO 100 hard-fails; performance is budgeted per metric.
- GLB compression (meshopt or Draco) becomes a Phase 2 pipeline output rule.

## Considered & rejected

- **Keep Vite SPA + prerender (react-snap or similar).** Prerendering a
  WebGL app in CI is fragile and still leaves content inside React state
  rather than in HTML authored from data.
- **Next.js static export.** Works, but pulls the whole page into React;
  Astro's island model keeps the non-3D page framework-free and smaller on
  a phone.
- **Self-hosted Umami.** Conflicts with "no backend" in ADR-0001.
