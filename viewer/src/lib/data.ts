/** Typed access to the compiled data bundle (scripts/build-data) and the published geometry. */
import bundle from '../generated/data.json';

export type Source = { ref: string; retrieved?: string; timestamp?: string; note?: string };
type Flagged = { source: Source[]; unverified?: boolean; approximation?: boolean };
export type Part = Flagged & {
  id: string;
  name: string;
  qty: number;
  category: string;
  assembly: string[];
  source_file?: string;
  licence?: string;
  geometry_names?: string[];
  aka?: string[];
  notes?: string;
  name_plain?: string;
};
export type ServoVariant = {
  part: string;
  servo_voltage: string;
  supply: string;
  default?: boolean;
  note?: string;
  source: Source[];
};
export type Servo = Flagged & {
  id: string;
  assembly: string;
  joint: string;
  part: string;
  model: string;
  gear_ratio: string;
  variants: ServoVariant[];
  bus_id?: number;
  orientation_note?: string;
  notes?: string;
};
export type Fastener = Flagged & {
  id: string;
  spec: string;
  qty: number;
  assembly: string[];
  where_used?: string;
  drive?: string;
  notes?: string;
  name_plain?: string;
};
export type Tool = Flagged & { id: string; name: string; size?: string; purchase_note?: string };
export type IssueStage = 'setup-motors' | 'assembly' | 'calibration';
export type Issue = Flagged & {
  id: string;
  slug: string;
  title: string;
  stage: IssueStage;
  aliases?: string[];
  symptoms: string[];
  cause: string;
  fix: string[];
  related_steps?: string[];
  related_parts?: string[];
  servo_table?: 'follower' | 'leader';
};
export type Vendor = Flagged & {
  id: string;
  name: string;
  url: string;
  region?: string;
  kits?: {
    name: string;
    url: string;
    includes: string[];
    hardware?: string;
    servos?: string;
    source?: Source[];
  }[];
  part_map?: { vendor_ref: string; part: string; note?: string }[];
  notes?: string;
};
export type Cable = Flagged & {
  id: string;
  from: string;
  to: string;
  assembly: string[];
  diameter_m?: number;
  path: [number, number, number][];
  derived: boolean;
  notes?: string;
};
export type PageRow = Flagged & {
  id: string;
  slug?: string;
  title?: string;
  question?: string;
  answer?: string;
  topic?: string;
  so100?: string;
  so101?: string;
  setting?: string;
  value?: string;
  notes?: string;
  related?: string[];
};
export type Step = Flagged & {
  id: string;
  slug: string;
  title: string;
  assembly: string;
  extends?: string;
  prep?: boolean;
  parts: string[];
  servo_slot?: string;
  orientation_note?: string;
  fasteners?: { id: string; qty: number }[];
  tools?: string[];
  cables?: string[];
  cable_path?: [number, number, number][];
  warnings?: string[];
  check: string;
  instructions?: string;
  provenance?: string;
  title_short?: string;
  plain?: Plain;
};
/** Plain register: each sentence rewords what `from` points at (validated by scripts/src/plain.ts). */
export type PlainSentence = { text: string; from: string[] };
export type Plain = { do: PlainSentence[]; done: PlainSentence };
export type GlossaryEntry = {
  id: string;
  term: string;
  match: string[];
  kind: 'definition' | 'fact';
  meaning: string;
  source?: Source[];
  unverified?: boolean;
};
export type Bundle = {
  generated_at: string;
  commit: string;
  parts: Part[];
  servos: Servo[];
  fasteners: Fastener[];
  tools: Tool[];
  troubleshooting: Issue[];
  vendors: Vendor[];
  cables: Cable[];
  compare: PageRow[];
  faq: PageRow[];
  printing: PageRow[];
  glossary: GlossaryEntry[];
  assemblies: Record<string, Step[]>;
};

export const data = bundle as unknown as Bundle;
export const ASSEMBLIES = ['follower', 'leader'] as const;
export type Assembly = (typeof ASSEMBLIES)[number];

export const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
export const parts = byId(data.parts);
export const fasteners = byId(data.fasteners);
export const tools = byId(data.tools);
export const cables = byId(data.cables);
export const glossary = data.glossary ?? [];
/** Plain name for the builder, exact name for the record. */
export const partName = (id: string) => {
  const p = parts.get(id);
  return p?.name_plain ?? p?.name ?? id;
};
export const fastenerName = (id: string) => {
  const f = fasteners.get(id);
  return f?.name_plain ?? f?.spec ?? id;
};
export const servoBySlot = (assembly: string, joint: string) =>
  data.servos.find((s) => s.assembly === assembly && s.joint === joint);
export const steps = (assembly: string) => data.assemblies[assembly] ?? [];
export const stepNumber = (id: string) => id.slice(2); // F-012 -> 012
export const stepPath = (s: Step) => `/${s.assembly}/${stepNumber(s.id)}-${s.slug}/`;
/** The slim step the 3D island reasons over (per-arm JSON endpoint and build-time mesh preloads). */
export const stepLite = (s: Step) => ({
  id: s.id,
  prep: !!s.prep,
  parts: s.parts,
  servo_slot: s.servo_slot,
  cables: s.cables ?? [],
  fasteners: (s.fasteners ?? []).map((f) => f.id),
});
export const stepById = (id: string) =>
  Object.values(data.assemblies)
    .flat()
    .find((s) => s.id === id);
export const jointLabel = (joint: string) => joint.replace(/_/g, ' ');
/** How a builder names each arm and each troubleshooting stage; the search rows and the index page share these. */
export const ARM_LABEL: Record<string, string> = { follower: 'Follower arm', leader: 'Leader arm' };
export const STAGE_ORDER: IssueStage[] = ['setup-motors', 'assembly', 'calibration'];
export const STAGE_LABEL: Record<IssueStage, string> = {
  'setup-motors': 'Setting motor IDs',
  assembly: 'Building the arm',
  calibration: 'Calibrating',
};
export const JOINT_ORDER = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow_flex',
  'wrist_flex',
  'wrist_roll',
  'gripper',
];

/** A source ref as a link + label. Upstream paths point at the pinned GitHub tree. */
const UPSTREAM: Record<string, string> = {
  'upstream/SO-ARM100/':
    'https://github.com/TheRobotStudio/SO-ARM100/blob/eecbe3e0a9ebb23e25ad7b2759b03884c6660903/',
  'upstream/lerobot/':
    'https://github.com/huggingface/lerobot/blob/3f2c29ef7e44b1ddccbcda3b6a63939e53639e9e/',
};
export function sourceLink(s: Source): { href: string; label: string } {
  if (/^https?:\/\//.test(s.ref)) {
    let label: string;
    try {
      label = new URL(s.ref).hostname.replace(/^www\./, '');
    } catch {
      label = s.ref;
    }
    if (s.timestamp) label += ` @ ${s.timestamp}`;
    return { href: s.ref, label };
  }
  for (const [prefix, base] of Object.entries(UPSTREAM)) {
    if (s.ref.startsWith(prefix)) {
      const [file, anchor] = s.ref.slice(prefix.length).split('#');
      return {
        href: base + encodeURI(file) + (anchor ? '#' + anchor : ''),
        label: s.ref.replace('upstream/', ''),
      };
    }
  }
  return { href: '#', label: s.ref };
}

/**
 * Step groups from the id decade: F-00x are preparation, F-01x…F-06x install motor 1…6 (the
 * decade digit is the servo bus id, so the joint label comes from servos.yaml), F-07x are the
 * board and cables. Labels are UI chrome; the joint names are data.
 */
export type StepGroup = { key: string; label: string; steps: Step[] };
export function stepDecade(s: Step): number {
  return Number(s.id.slice(3, 4)); // F-013 -> 1
}
export function groupLabel(assembly: string, decade: number): string {
  if (decade === 0) return 'Before you build';
  if (decade === 7) return 'Board and cables';
  const servo = data.servos.find((v) => v.assembly === assembly && v.bus_id === decade);
  return servo ? `Motor ${decade} · ${jointLabel(servo.joint)}` : `Motor ${decade}`;
}
export function stepGroups(assembly: string): StepGroup[] {
  const out: StepGroup[] = [];
  for (const s of steps(assembly)) {
    const d = stepDecade(s);
    const key = String(d);
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, label: groupLabel(assembly, d), steps: [] };
      out.push(g);
    }
    g.steps.push(s);
  }
  return out;
}

/**
 * Glossary linking: split a plain sentence into text and term segments. Only the first occurrence of
 * each entry per page gets a popover; the caller owns `seen` so one set spans the whole page.
 */
export type GlossSegment = { text: string; entry?: GlossaryEntry };
const GLOSS_RE = (() => {
  const words = glossary
    .flatMap((g) => g.match.map((m) => ({ m, g })))
    .sort((a, b) => b.m.length - a.m.length);
  if (!words.length) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    re: new RegExp(`(?<![\\w:])(${words.map((w) => esc(w.m)).join('|')})(?![\\w:])`, 'gi'),
    byWord: new Map(words.map((w) => [w.m.toLowerCase(), w.g])),
  };
})();
export function glossify(text: string, seen: Set<string>): GlossSegment[] {
  if (!GLOSS_RE) return [{ text }];
  const out: GlossSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(GLOSS_RE.re)) {
    const entry = GLOSS_RE.byWord.get(m[1].toLowerCase());
    const i = m.index ?? 0;
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (i > last) out.push({ text: text.slice(last, i) });
    // Trailing punctuation rides inside the term so an inline-block popover never orphans a comma.
    const tail = /^[,.;:]/.exec(text.slice(i + m[1].length))?.[0] ?? '';
    out.push({ text: m[1] + tail, entry });
    last = i + m[1].length + tail.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * What a plain sentence rewords, as a label + the exact text, for the "src" marks. `href` is an
 * absolute URL (external source) or a guide-relative path the component passes through seo.withBase.
 */
export type FromDesc = { label: string; text: string; href?: string };
const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  title_short: 'short title',
  check: 'check',
  orientation_note: 'orientation note',
  instructions: 'instructions',
  warnings: 'warnings',
  servo_slot: 'motor slot',
  parts: 'parts',
  fasteners: 'fasteners',
  tools: 'tools',
  cables: 'cables',
  prep: 'preparation step',
};
export function describeFrom(ref: string, step: Step): FromDesc {
  const rec = ref.match(/^(part|fastener|tool|cable):(.+)$/);
  if (rec) {
    const id = rec[2];
    if (rec[1] === 'part')
      return {
        label: `parts.yaml · ${id}`,
        text: parts.get(id)?.name ?? id,
        href: `/parts/${id}/`,
      };
    if (rec[1] === 'fastener')
      return {
        label: `fasteners.yaml · ${id}`,
        text: fasteners.get(id)?.spec ?? id,
        href: `/parts/#fastener-${id}`,
      };
    if (rec[1] === 'tool')
      return {
        label: `tools.yaml · ${id}`,
        text: tools.get(id)?.name ?? id,
        href: `/tools/${id}/`,
      };
    const c = cables.get(id);
    return {
      label: `cables.yaml · ${id}`,
      text: c ? `${jointLabel(c.from)} → ${jointLabel(c.to)}` : id,
    };
  }
  let target: Step | undefined = step;
  let field = ref;
  const other = ref.match(/^([FL]-\d{3})\.(.+)$/);
  if (other) {
    target = stepById(other[1]);
    field = other[2];
  }
  const who = other ? `${other[1]} · ` : '';
  if (!target) return { label: `${who}${field}`, text: '' };
  const href = other ? stepPath(target) : undefined;
  const src = field.match(/^source\[(\d+)\]$/);
  if (src) {
    const s = target.source?.[Number(src[1])];
    if (!s) return { label: `${who}source`, text: '' };
    const l = sourceLink(s);
    return { label: `${who}${l.label}`, text: s.note ?? '', href: l.href };
  }
  if (field === 'servo') {
    const v = target.servo_slot ? servoBySlot(target.assembly, target.servo_slot) : undefined;
    return {
      label: `servos.yaml · ${target.assembly}/${target.servo_slot ?? '?'}`,
      text: v
        ? `ID ${v.bus_id} · ${v.model} ${v.gear_ratio} · ${parts.get(v.part)?.name ?? v.part}`
        : '',
      href: v ? `/servos/${v.assembly}/${v.joint}/` : undefined,
    };
  }
  const v = (target as unknown as Record<string, unknown>)[field];
  const text = Array.isArray(v)
    ? v
        .map((x) =>
          typeof x === 'string'
            ? x
            : `${(x as { qty?: number }).qty ?? ''} × ${(x as { id?: string }).id ?? ''}`,
        )
        .join(' · ')
    : v === undefined
      ? ''
      : String(v);
  return { label: `${who}${FIELD_LABEL[field] ?? field}`, text, href };
}
