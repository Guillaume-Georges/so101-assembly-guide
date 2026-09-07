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
};
export type Tool = Flagged & { id: string; name: string; size?: string; purchase_note?: string };
export type Issue = Flagged & {
  id: string;
  slug: string;
  title: string;
  aliases?: string[];
  symptoms: string[];
  cause: string;
  fix: string;
  related_steps?: string[];
  related_parts?: string[];
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
export const servoBySlot = (assembly: string, joint: string) =>
  data.servos.find((s) => s.assembly === assembly && s.joint === joint);
export const steps = (assembly: string) => data.assemblies[assembly] ?? [];
export const stepNumber = (id: string) => id.slice(2); // F-012 -> 012
export const stepPath = (s: Step) => `/${s.assembly}/${stepNumber(s.id)}-${s.slug}/`;
export const stepById = (id: string) =>
  Object.values(data.assemblies)
    .flat()
    .find((s) => s.id === id);
export const jointLabel = (joint: string) => joint.replace(/_/g, ' ');
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
