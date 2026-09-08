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
  'Step-by-step SO-101 robot arm assembly guide: servo and gear ratio per joint, screws, tools, cable routing, a check and a 3D view per step. Every fact sourced.';
export const GITHUB = 'https://github.com/Guillaume-Georges/so101-assembly-guide';

/** Cut a meta description at a word boundary so the snippet never ends mid-word. */
export function clip(text: string, max = 155): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[\s,;:·]+$/, '') + '…';
}

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
  const arm = s.assembly === 'leader' ? 'leader' : 'follower';
  const bits = [`SO-101 ${arm} arm, step ${s.id}: ${s.title}.`];
  if (s.plain) return clip([...bits, ...s.plain.do.map((d) => d.text)].join(' '));
  if (s.servo_slot) bits.push(`Motor slot ${s.servo_slot.replace(/_/g, ' ')}.`);
  if (s.fasteners?.length)
    bits.push(`Fasteners: ${s.fasteners.map((f) => `${f.qty}× ${f.id}`).join(', ')}.`);
  bits.push(`Check: ${s.check}`);
  return clip(bits.join(' '));
}

/** Kitsmith as schema.org publisher/author of every page. */
export function organization(site: string) {
  return {
    '@type': 'Organization',
    name: BRAND,
    url: new URL(sitePath('/'), site).toString(),
    logo: new URL(sitePath('/icon-512.png'), site).toString(),
    sameAs: [GITHUB],
  };
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

export function techArticle(s: Step, site: string, image: string) {
  const arm = s.assembly === 'leader' ? 'leader' : 'follower';
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: `${s.title} (SO-101 ${arm} arm, step ${s.id})`,
    description: stepDescription(s),
    url: new URL(withBase(stepPath(s)), site).toString(),
    image: new URL(withBase(image), site).toString(),
    inLanguage: 'en',
    dateModified: data.generated_at,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: new URL(withBase('/'), site).toString() },
    author: organization(site),
    publisher: organization(site),
    proficiencyLevel: 'Beginner',
    dependencies: s.tools?.join(', '),
    about: {
      '@type': 'Product',
      name: 'SO-101 robot arm',
      url: 'https://github.com/TheRobotStudio/SO-ARM100',
    },
  };
}
