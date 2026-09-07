// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

// GitHub Pages project site until a custom domain exists (ADR-0002). CI passes SITE/BASE.
const site = process.env.SITE ?? 'https://guillaume-georges.github.io';
const base = (process.env.VITE_BASE ?? process.env.BASE ?? '/').replace(/\/$/, '') || '/';

// unverified steps and issues are noindex and never in the sitemap (CLAUDE.md non-negotiable 1)
const data = JSON.parse(
  readFileSync(new URL('./src/generated/data.json', import.meta.url), 'utf8'),
);
const noindex = new Set();
for (const [asm, steps] of Object.entries(data.assemblies)) {
  for (const s of steps) if (s.unverified) noindex.add(`/${asm}/${s.id.slice(2)}-${s.slug}/`);
}
for (const t of data.troubleshooting) if (t.unverified) noindex.add(`/troubleshooting/${t.slug}/`);

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [
    react(),
    sitemap({
      // site-relative paths; `page` is the absolute URL. Embeds are noindex too.
      filter: (page) => !page.includes('/embed/') && ![...noindex].some((p) => page.includes(p)),
    }),
  ],
  build: { inlineStylesheets: 'auto' },
  vite: {
    build: { chunkSizeWarningLimit: 1200 },
    // Site-wide index switch, baked at build time so pages, robots.txt and the sitemap link agree.
    define: { __SITE_INDEXABLE__: JSON.stringify(process.env.SITE_INDEXABLE ?? 'false') },
  },
});
