// Astro integration: after the build, give every page that carries an <astro-island> a
// <link rel="modulepreload"> for the island's bundle, its renderer, and the bundle's own static
// imports. Astro's hydration script only starts fetching the bundle once it runs (and, for
// client:visible, once the island scrolls into view), so without this the ~270 KB gzipped three.js
// bundle waits behind the HTML parse. The hashed chunk names exist only after the build, hence a
// build:done hook rather than links in the page source.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, posix } from 'node:path';

export default function islandModulepreload() {
  return {
    name: 'island-modulepreload',
    hooks: {
      'astro:build:done': ({ dir, pages, logger }) => {
        const dist = fileURLToPath(dir);
        const importsOf = new Map();
        // Static imports at the head of a built chunk: `from"./client.XXXX.js"`.
        const staticImports = (url) => {
          if (importsOf.has(url)) return importsOf.get(url);
          // URLs carry the site base ("/guide/_astro/x.js"); on disk the chunk is dist/_astro/x.js.
          const i = url.indexOf('/_astro/');
          const file = i < 0 ? '' : join(dist, url.slice(i + 1));
          let found = [];
          try {
            const head = readFileSync(file, 'utf8').slice(0, 4096);
            found = [...head.matchAll(/from"(\.\/[^"]+)"/g)].map((m) =>
              posix.join(posix.dirname(url), m[1]),
            );
          } catch {
            /* chunk not on disk under the expected path: preload just the island */
          }
          importsOf.set(url, found);
          return found;
        };
        let touched = 0;
        for (const { pathname } of pages) {
          const file = join(dist, pathname, 'index.html');
          let html;
          try {
            html = readFileSync(file, 'utf8');
          } catch {
            continue;
          }
          if (!html.includes('<astro-island')) continue;
          const urls = new Set();
          for (const m of html.matchAll(/<astro-island[^>]*>/g)) {
            const tag = m[0];
            for (const key of ['component-url', 'renderer-url']) {
              const u = tag.match(new RegExp(`${key}="([^"]+)"`))?.[1];
              if (!u) continue;
              urls.add(u);
              for (const dep of staticImports(u)) urls.add(dep);
            }
          }
          if (urls.size === 0) continue;
          const links = [...urls].map((u) => `<link rel="modulepreload" href="${u}">`).join('');
          writeFileSync(file, html.replace('</head>', `${links}</head>`));
          touched++;
        }
        logger.info(`modulepreload links added to ${touched} island pages`);
      },
    },
  };
}
