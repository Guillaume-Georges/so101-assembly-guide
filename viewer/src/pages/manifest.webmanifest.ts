import type { APIRoute } from 'astro';
export const GET: APIRoute = () => {
  const base = import.meta.env.BASE_URL;
  return new Response(
    JSON.stringify({
      name: 'SO-101 Assembly Guide',
      short_name: 'SO-101 Guide',
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#111318',
      theme_color: '#111318',
      description: 'Step-by-step, source-traceable assembly guide for the SO-101 robot arm.',
      icons: [{ src: `${base}favicon.svg`, sizes: 'any', type: 'image/svg+xml' }],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
};
