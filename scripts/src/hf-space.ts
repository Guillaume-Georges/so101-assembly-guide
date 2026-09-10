/**
 * The Hugging Face Space (KitSmith/so101-assembly-guide) rendered from the resolved dataset: every
 * verified step's 3D view iframed from kitsmith.dev, with titles only, each linking to its step page.
 * Step text, fasteners, checks and sources stay on kitsmith.dev, the one copy that gets corrected.
 */
import type { Dataset, Step } from './load.js';

export const GUIDE_URL = 'https://kitsmith.dev/so101';
const ARMS: Record<string, string> = { follower: 'Follower arm', leader: 'Leader arm' };

// Same shape as viewer/src/lib/data.ts stepPath: /{assembly}/{id number}-{slug}/, frozen at first publish.
const stepSlug = (s: Step) => `${s.id.slice(2)}-${s.slug}`;
export const stepPage = (s: Step) => `${GUIDE_URL}/${s.assembly}/${stepSlug(s)}/`;
export const stepEmbed = (s: Step) => `${GUIDE_URL}/embed/${s.assembly}/${stepSlug(s)}/`;

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type SpaceStep = {
  id: string;
  assembly: string;
  title: string;
  meta: string;
  page: string;
  embed: string;
};

/** Verified steps in guide order (follower, then leader); unverified ones are held back. */
export function spaceSteps(ds: Dataset): { shown: SpaceStep[]; held: Step[]; total: number } {
  const unknown = Object.keys(ds.assemblies).filter((a) => !(a in ARMS));
  if (unknown.length) throw new Error(`hf-space: no label for assembly '${unknown.join("', '")}'`);
  const shown: SpaceStep[] = [];
  const held: Step[] = [];
  let total = 0;
  for (const [arm, label] of Object.entries(ARMS)) {
    const steps = ds.assemblies[arm] ?? [];
    total += steps.length;
    steps.forEach((s, i) => {
      if (s.unverified) held.push(s);
      else
        shown.push({
          id: s.id,
          assembly: arm,
          title: s.title,
          meta: `${s.id} · ${label} · step ${i + 1} of ${steps.length}`,
          page: stepPage(s),
          embed: stepEmbed(s),
        });
    });
  }
  return { shown, held, total };
}

function heldBack(held: Step[]): string {
  if (!held.length) return '';
  const one = held.length === 1;
  return (
    `${held.length} ${one ? 'step' : 'steps'} that no public source confirms yet ` +
    `(${held.map((s) => s.id).join(', ')}) ${one ? 'is' : 'are'} left out here. ` +
    `${one ? 'It is' : 'They are'} on kitsmith.dev, flagged as unverified.`
  );
}

function fill(template: string, values: Record<string, string>, name: string): string {
  let out = template;
  for (const [key, value] of Object.entries(values))
    out = out.replaceAll(`{{${key}}}`, () => value);
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`hf-space: ${name} still has ${left[0]}`);
  return out;
}

export function renderSpace(
  ds: Dataset,
  templates: { html: string; readme: string },
): { html: string; readme: string; shown: number; held: number } {
  const { shown, held, total } = spaceSteps(ds);
  if (!shown.length) throw new Error('hf-space: no verified steps to show');
  const list = Object.entries(ARMS)
    .map(([arm, label]) => {
      const items = shown
        .filter((s) => s.assembly === arm)
        .map(
          (s) =>
            `<li><a href="${s.page}" data-id="${s.id}" target="_blank" rel="noopener">` +
            `<span>${s.id}</span>${esc(s.title)}</a></li>`,
        );
      // One section per arm, so each sticky heading only sticks while its own steps are in view.
      return items.length ? `<section><h3>${label}</h3><ol>${items.join('')}</ol></section>` : '';
    })
    .join('');
  const first = shown[0];
  const common = {
    GUIDE_URL,
    TOTAL: String(total),
    SHOWN: String(shown.length),
    HELD_BACK: heldBack(held),
  };
  const html = fill(
    templates.html,
    {
      ...common,
      HELD_BACK: esc(common.HELD_BACK),
      STEP_LIST: list,
      STEPS_JSON: JSON.stringify(shown).replace(/</g, '\\u003c'),
      FIRST_ID: first.id,
      FIRST_META: esc(first.meta),
      FIRST_TITLE: esc(first.title),
      FIRST_EMBED: first.embed,
      FIRST_PAGE: first.page,
    },
    'index.template.html',
  );
  const readme = fill(templates.readme, common, 'README.template.md');
  return { html, readme, shown: shown.length, held: held.length };
}
