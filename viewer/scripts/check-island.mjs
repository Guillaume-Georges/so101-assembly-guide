// Post-build guard for the 3D island. The island fetches `${base}so101/data/{arm}.json` and
// `${base}so101/geometry/placements.json` at runtime; if the `base` prop and the built files ever
// disagree (as they did after the /so101/ move, 4647752 → c3ccf95), every step page shows
// "Loading 3D view…" forever and no build step notices. This reads one built step page, extracts
// the island's `base` prop, and asserts the files it will fetch exist in dist/.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const fail = (msg) => {
  console.error(`check-island: ${msg}`);
  process.exit(1);
};

const arms = ['follower', 'leader'];
for (const arm of arms) {
  const dir = join(dist, 'so101', arm);
  if (!existsSync(dir)) fail(`missing ${dir}`);
  const step = readdirSync(dir).find((d) => /^\d{3}-/.test(d));
  if (!step) fail(`no step pages under ${dir}`);
  const html = readFileSync(join(dir, step, 'index.html'), 'utf8');
  const island = html.match(/<astro-island[^>]*component-url="([^"]+)"[^>]*props="([^"]+)"/);
  if (!island) fail(`${arm}/${step}: no <astro-island> with component-url and props`);
  const [, componentUrl, rawProps] = island;
  if (!existsSync(join(dist, componentUrl))) fail(`island bundle missing: ${componentUrl}`);
  const props = JSON.parse(rawProps.replace(/&quot;/g, '"'));
  const base = props.base?.[1];
  if (typeof base !== 'string') fail(`${arm}/${step}: island has no base prop`);
  for (const rel of [`so101/data/${arm}.json`, 'so101/geometry/placements.json']) {
    const file = join(dist, base, rel);
    if (!existsSync(file))
      fail(`${arm}/${step}: island would fetch ${base}${rel} but ${file} does not exist`);
  }
  console.log(`check-island: ${arm}/${step} ok (base "${base}")`);
}
