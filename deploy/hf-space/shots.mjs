// Screenshots of kitsmith.dev pages for the Space's "On each page of the guide" strip: phone width,
// dark, one upright clip per page starting at the section it shows. The WebPs are committed; rerun
// after a UI or copy change on those pages, then `pnpm build-hf-space` and upload.
// Usage: npx -y playwright@1 install chromium && node deploy/hf-space/shots.mjs
//        (set PLAYWRIGHT=/path/to/playwright/index.mjs when 'playwright' does not resolve here)
import { mkdirSync } from 'node:fs';
import sharp from '../../viewer/node_modules/sharp/lib/index.js';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const W = 430; // CSS px, an upright phone screen; index.template.html sizes the cards to match
const H = 760;
const jobs = [
  ['steps', 'https://kitsmith.dev/so101/follower/071-follower-daisy-chain/', 'aside.steppanel'],
  ['servos', 'https://kitsmith.dev/so101/servos/', 'main h1'],
  [
    'issue',
    'https://kitsmith.dev/so101/troubleshooting/wrist-roll-servo-cable-torn/',
    'section.match',
  ],
  [
    'need',
    'https://kitsmith.dev/so101/follower/032-follower-joint3-forearm/',
    'aside.steppanel section.servo',
  ],
];
const browser = await chromium.launch();
for (const [name, url, anchor] of jobs) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  });
  // Filed under owner automation by the traffic report (docs/ops/traffic-report.md).
  await ctx.addCookies([
    {
      name: 'ks_self',
      value: 'auto',
      domain: 'kitsmith.dev',
      path: '/',
      secure: true,
      sameSite: 'None',
    },
  ]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  // Fixed and sticky bars (the step nav, the header) would land on top of the clipped section.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') el.style.visibility = 'hidden';
    }
  });
  const top = await page
    .locator(anchor)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const y = Math.max(0, Math.round(top) - 12);
  const png = await page.screenshot({ fullPage: true, clip: { x: 0, y, width: W, height: H } });
  await sharp(png).webp({ quality: 80 }).toFile(`${OUT}${name}.webp`);
  console.log('wrote', name, 'from y', y);
  await ctx.close();
}
await browser.close();
