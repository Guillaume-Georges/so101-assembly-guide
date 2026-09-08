/** Slim per-arm JSON the 3D island fetches: step ids, parts, servo slot, cables, and cable paths. */
import type { APIRoute } from 'astro';
import { ASSEMBLIES, steps, stepLite, data } from '../../../lib/data';
export function getStaticPaths() {
  return ASSEMBLIES.map((assembly) => ({ params: { assembly } }));
}
export const GET: APIRoute = ({ params }) => {
  const assembly = params.assembly as string;
  const body = {
    assembly,
    steps: steps(assembly).map(stepLite),
    cables: data.cables
      .filter((c) => c.assembly.includes(assembly))
      .map((c) => ({ id: c.id, path: c.path, diameter_m: c.diameter_m ?? 0.0025 })),
    parts: Object.fromEntries(
      data.parts.map((p) => [p.id, { name: p.name_plain ?? p.name, category: p.category }]),
    ),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
