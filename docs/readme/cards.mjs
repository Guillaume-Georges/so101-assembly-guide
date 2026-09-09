// README card images. 1) SHOTS=/tmp/kitsmith-shots npx -y playwright@1 install chromium && node shoot.mjs
//                     2) node cards.mjs  (sharp from viewer/node_modules). Cards are committed; rerun after a UI change.
import sharp from '../../viewer/node_modules/sharp/lib/index.js';
const OUT = new URL('./', import.meta.url).pathname;
const SHOTS = (process.env.SHOTS ?? '/tmp/kitsmith-shots/').replace(/\/?$/, '/');
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const BG = '#101827',
  FG = '#eef2f7',
  MUTED = '#9aa8bd',
  ACCENT = '#4da3ff',
  LINE = '#2a3650';
const W = 1600,
  H = 900;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
function text(lines, x, y, size, weight, fill, lh = 1.2) {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * size * lh}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(l)}</text>`,
    )
    .join('');
}
const rounded = (w, h, r) =>
  Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`,
  );
async function shot(file, { crop, width, radius = 18 }) {
  let img = sharp(SHOTS + file);
  if (crop) img = img.extract(crop);
  img = img.resize({ width });
  const { width: w, height: h } = await img
    .png()
    .toBuffer({ resolveWithObject: true })
    .then((r) => r.info);
  const buf = await img
    .composite([{ input: rounded(w, h, radius), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return { buf, w, h };
}
async function card(name, { title, sub, file, crop, layout }) {
  const parts = [];
  let overlays = [];
  if (layout === 'phone') {
    const s = await shot(file, { crop, width: 500, radius: 36 });
    overlays.push({ input: s.buf, left: W - s.w - 110, top: 80 });
    parts.push(
      text(title, 90, 250, 66, 700, FG),
      text(sub, 90, 250 + title.length * 80 + 30, 30, 400, MUTED, 1.35),
    );
    parts.push(
      `<rect x="${W - s.w - 122}" y="68" width="${s.w + 24}" height="${s.h + 24}" rx="48" fill="none" stroke="${LINE}" stroke-width="3"/>`,
    );
  } else if (layout === 'side') {
    const s = await shot(file, { crop, width: 700, radius: 24 });
    overlays.push({ input: s.buf, left: W - s.w - 90, top: Math.round((H - s.h) / 2) });
    parts.push(
      text(title, 90, 250, 60, 700, FG),
      text(sub, 90, 250 + title.length * 72 + 30, 30, 400, MUTED, 1.35),
    );
    parts.push(
      `<rect x="${W - s.w - 92}" y="${Math.round((H - s.h) / 2) - 2}" width="${s.w + 4}" height="${s.h + 4}" rx="26" fill="none" stroke="${LINE}" stroke-width="3"/>`,
    );
  } else {
    const subTop = 130 + title.length * 68 + 10;
    const top = subTop + sub.length * 38 + 30;
    parts.push(text(title, 90, 130, 56, 700, FG), text(sub, 90, subTop, 28, 400, MUTED, 1.35));
    const s = await shot(file, { crop, width: W - 180, radius: 18 });
    overlays.push({ input: s.buf, left: 90, top });
    parts.push(
      `<rect x="88" y="${top - 2}" width="${s.w + 4}" height="${s.h + 4}" rx="20" fill="none" stroke="${LINE}" stroke-width="3"/>`,
    );
  }
  const svg = `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${BG}"/><rect width="14" height="${H}" fill="${ACCENT}"/>${parts.join('')}</svg>`;
  await sharp(Buffer.from(svg))
    .composite(overlays)
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(OUT + name + '.png');
  console.log('wrote', name);
}
await card('00-hero', {
  title: ['Build the SO-101,', 'one checked step', 'at a time.'],
  sub: [
    'A source-cited build companion',
    'for the open-source robot arm.',
    '52 steps, a 3D view per step, any kit.',
  ],
  file: 'step-071.png',
  crop: { left: 540, top: 680, width: 860, height: 700 },
  layout: 'side',
});
// crops are in 2x pixels of the 2880x1800 desktop shots (phone: 780x1688)
await card('01-steps', {
  title: ['One page per step. Nothing to scroll past.'],
  sub: ['What to do, what you need, what "done" looks like, and a source behind every sentence.'],
  file: 'step-032.png',
  crop: { left: 300, top: 420, width: 2280, height: 980 },
});
await card('02-3d', {
  title: ['See the part', 'go on, in 3D.'],
  sub: [
    "This step's parts highlighted, the built arm beneath,",
    'later parts ghosted. Drag to turn, pull apart to see inside.',
  ],
  file: 'mobile-011.png',
  crop: { left: 0, top: 0, width: 780, height: 1150 },
  layout: 'phone',
});
await card('03-servos', {
  title: ['Which servo, which joint,', 'which gear ratio.'],
  sub: [
    'Bus IDs, product codes, voltages and supply per joint,',
    'with the 21 sources that say so.',
  ],
  file: 'servos.png',
  crop: { left: 300, top: 250, width: 2280, height: 1400 },
});
await card('04-kits', {
  title: ['Any kit. One guide.'],
  sub: [
    'Waveshare and Seeed part numbers cross-referenced',
    'to the upstream names. No vendor ties, nothing sold.',
  ],
  file: 'kits-full.png',
  crop: { left: 300, top: 5200, width: 2280, height: 1400 },
});
await card('05-issues', {
  title: ['Something wrong?', 'Paste the error string.'],
  sub: [
    'Assembly issues with symptoms, cause and fix,',
    'each linked to the step where it happens.',
  ],
  file: 'issue.png',
  crop: { left: 300, top: 250, width: 2280, height: 1400 },
});
