import type { APIRoute } from 'astro';
export const GET: APIRoute = () => {
  const base = import.meta.env.BASE_URL;
  return new Response(
    JSON.stringify({
      name: 'Kitsmith build guides',
      short_name: 'Kitsmith',
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#101827',
      theme_color: '#101827',
      description:
        'Step-by-step, source-traceable build guides for open-hardware kits. First guide: the SO-101 robot arm.',
      icons: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        {
          src: `${base}icon-maskable-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        { src: `${base}favicon.svg`, sizes: 'any', type: 'image/svg+xml' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
};
