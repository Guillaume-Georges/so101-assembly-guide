/** Text-card Open Graph image per step (ADR-0002 v1: text card; exploded-view renders later). */
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { ASSEMBLIES, steps, stepNumber } from '../../../../lib/data';
import { card } from '../../../../lib/og';
export function getStaticPaths() {
  return ASSEMBLIES.flatMap((assembly) =>
    steps(assembly).map((s) => ({ params: { assembly, n: stepNumber(s.id) }, props: { s } })),
  );
}
export const GET: APIRoute = async ({ props }) => {
  const { s } = props as { s: { id: string; title: string; assembly: string; check: string } };
  const png = await sharp(
    Buffer.from(card(`${s.id} ${s.title}`, `${s.assembly} arm · check: ${s.check}`)),
  )
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
