// Screenshots of the live site for the README cards (Playwright, WebGL via SwiftShader).
// Usage: cd docs/readme && npx -y playwright@1 install chromium && SHOTS=/tmp/kitsmith-shots node shoot.mjs
import { chromium } from 'playwright';
const out = process.env.SHOTS ?? '/tmp/kitsmith-shots/';
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });
const jobs = [
  [
    'step-052',
    1440,
    900,
    'https://kitsmith.dev/so101/follower/052-follower-joint5-wrist-to-motor4/',
  ],
  ['step-032', 1440, 900, 'https://kitsmith.dev/so101/follower/032-follower-joint3-forearm/'],
  ['step-071', 1440, 900, 'https://kitsmith.dev/so101/follower/071-follower-daisy-chain/'],
  ['home', 1440, 900, 'https://kitsmith.dev/so101/'],
  ['servos', 1440, 900, 'https://kitsmith.dev/so101/servos/'],
  ['kits', 1440, 900, 'https://kitsmith.dev/so101/kits/'],
  ['issue', 1440, 900, 'https://kitsmith.dev/so101/troubleshooting/wrist-roll-servo-cable-torn/'],
  [
    'mobile-011',
    390,
    844,
    'https://kitsmith.dev/so101/follower/011-follower-joint1-motor-into-base/',
  ],
  ['mobile-home', 390, 844, 'https://kitsmith.dev/so101/'],
];
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [name, w, h, url] of jobs) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    isMobile: w < 500,
    hasTouch: w < 500,
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
  await page.waitForTimeout(6000);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    gl: !!document.querySelector('canvas'),
    txt: document.querySelector('.viewer')?.innerText.slice(0, 60),
  }));
  await page.screenshot({ path: out + name + '.png' });
  console.log(name, JSON.stringify(m));
  await ctx.close();
}
await browser.close();
