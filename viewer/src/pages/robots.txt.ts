import type { APIRoute } from 'astro';
import { NOINDEX } from '../lib/seo';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const sitemap = new URL(`${base}/sitemap-index.xml`, site).toString();
  // Until the custom domain is live nothing is indexed: SITE_INDEXABLE=true at build flips
  // this file and the per-page noindex meta together (see lib/seo.ts).
  const body = NOINDEX
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: ${base}/so101/embed/\n\nSitemap: ${sitemap}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
