import { data, stepPath, type Step } from './data';

export const SITE_NAME = 'SO-101 Assembly Guide';
/** Brand and product names for chrome and titles: "{page} · SO-101 guide · Kitsmith". */
export const BRAND = 'Kitsmith';
export const GUIDE_NAME = 'SO-101 guide';
/**
 * kitsmith.dev is the canonical host, so builds are indexable unless SITE_INDEXABLE=false is set
 * (a staging host, or a build that must never reach search). robots.txt and the sitemap link follow.
 */
declare const __SITE_INDEXABLE__: string;
export const NOINDEX = __SITE_INDEXABLE__ === 'false';
export const DESCRIPTION =
  'Source-traceable, step-by-step assembly guide for the SO-101 robot arm: parts, servos and gear ratios per joint, screws, tools, cable routing, checks, and a 3D view for every step.';

/** The SO-101 guide lives under /so101/ on kitsmith.dev (brand site, more kits later). */
export const GUIDE = '/so101';
/** Site-relative path for a page of the SO-101 guide. */
export function withBase(path: string): string {
  return sitePath(GUIDE + (path.startsWith('/') ? path : '/' + path));
}
/** Site-relative path for a root-level asset or page (manifest, favicon, landing). */
export function sitePath(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + (path.startsWith('/') ? path : '/' + path);
}

export function stepDescription(s: Step): string {
  const bits = [`Step ${s.id}: ${s.title}.`];
  if (s.plain) return [...bits, ...s.plain.do.map((d) => d.text)].join(' ').slice(0, 158);
  if (s.servo_slot) bits.push(`Motor slot ${s.servo_slot.replace(/_/g, ' ')}.`);
  if (s.fasteners?.length)
    bits.push(`Fasteners: ${s.fasteners.map((f) => `${f.qty}× ${f.id}`).join(', ')}.`);
  bits.push(`Check: ${s.check}`);
  return bits.join(' ').slice(0, 158);
}

export function breadcrumbs(items: { name: string; path: string }[], site: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: new URL(withBase(it.path), site).toString(),
    })),
  };
}

export function techArticle(s: Step, site: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${s.id} ${s.title}`,
    description: stepDescription(s),
    url: new URL(withBase(stepPath(s)), site).toString(),
    dateModified: data.generated_at,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: new URL(withBase('/'), site).toString() },
    proficiencyLevel: 'Beginner',
    dependencies: s.tools?.join(', '),
  };
}
