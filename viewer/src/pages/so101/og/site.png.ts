import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { card } from '../../../lib/og';
export const GET: APIRoute = async () => {
  const png = await sharp(
    Buffer.from(
      card('SO-101 Assembly Guide', 'Source-traceable, step-by-step, with a 3D view per step'),
    ),
  )
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
