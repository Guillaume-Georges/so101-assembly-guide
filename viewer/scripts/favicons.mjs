// Generates the favicon set in public/ from the header's brand mark (Base.astro: hexagon + hub),
// in the site palette (styles/global.css: --bg #101827, --accent #4da3ff, --fg #eef2f7).
// Run: node scripts/favicons.mjs   (outputs are committed; rerun after a palette or mark change)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const BG = '#101827';
const ACCENT = '#4da3ff';
const FG = '#eef2f7';

/** Mark on a rounded dark tile. `inset` scales the mark down (maskable icons need a 40% safe zone). */
function svg({ size = 64, radius = 12, inset = 0, rounded = true } = {}) {
  const s = 24 * (1 + inset * 2);
  const off = 24 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}">
<rect width="${s}" height="${s}" rx="${rounded ? (radius * s) / 64 : 0}" fill="${BG}"/>
<g transform="translate(${off} ${off})" fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-linejoin="round">
<path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/>
<circle cx="12" cy="12" r="3" fill="${FG}" stroke="none"/>
</g>
</svg>`;
}

const out = new URL('../public/', import.meta.url).pathname;
const png = (opts, size) =>
  sharp(Buffer.from(svg(opts)))
    .resize(size, size)
    .png()
    .toBuffer();

/** ICO container holding PNG-encoded images (supported since Windows Vista, by every browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = [];
  let offset = 6 + 16 * images.length;
  for (const { size, buf } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0);
    e.writeUInt8(size === 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...images.map((i) => i.buf)]);
}

writeFileSync(out + 'favicon.svg', svg());
const icoSizes = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, buf: await png({}, size) })),
);
writeFileSync(out + 'favicon.ico', ico(icoSizes));
writeFileSync(out + 'apple-touch-icon.png', await png({ rounded: false }, 180));
writeFileSync(out + 'icon-192.png', await png({}, 192));
writeFileSync(out + 'icon-512.png', await png({}, 512));
writeFileSync(out + 'icon-maskable-512.png', await png({ inset: 0.25, rounded: false }, 512));
console.log('favicons written to', out);
