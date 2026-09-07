import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { ASSEMBLIES_DIR, DATA_DIR } from './paths.js';

export type SourceRef = { ref: string; retrieved?: string; timestamp?: string; note?: string };
type Flagged = { source: SourceRef[]; unverified?: boolean; approximation?: boolean };

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
  source: SourceRef[];
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
    source?: SourceRef[];
  }[];
  part_map?: { vendor_ref: string; part: string; note?: string }[];
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
  cable_path?: [number, number, number][];
  cables?: string[];
  warnings?: string[];
  check: string;
  instructions?: string;
  provenance?: string;
  title_short?: string;
  plain?: Plain;
};
/** The Plain register: sentences that reword sourced fields. `from` names what each one rewords (scripts/plain.ts). */
export type PlainSentence = { text: string; from: string[] };
export type Plain = { do: PlainSentence[]; done: PlainSentence };
export type GlossaryEntry = {
  id: string;
  term: string;
  match: string[];
  kind: 'definition' | 'fact';
  meaning: string;
  source?: SourceRef[];
  unverified?: boolean;
};

export type Dataset = {
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

export function readYaml(file: string): unknown {
  return parse(fs.readFileSync(file, 'utf8')) ?? [];
}

/** Every data file, keyed by the schema that validates it. */
export function dataFiles(dataDir = DATA_DIR): { file: string; schema: string }[] {
  const assembliesDir = path.join(dataDir, 'assemblies');
  const assemblies = fs.existsSync(assembliesDir)
    ? fs
        .readdirSync(assembliesDir)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => ({ file: path.join(assembliesDir, f), schema: 'assembly' }))
    : [];
  return [
    { file: path.join(dataDir, 'parts.yaml'), schema: 'parts' },
    { file: path.join(dataDir, 'servos.yaml'), schema: 'servos' },
    { file: path.join(dataDir, 'fasteners.yaml'), schema: 'fasteners' },
    { file: path.join(dataDir, 'tools.yaml'), schema: 'tools' },
    { file: path.join(dataDir, 'troubleshooting.yaml'), schema: 'troubleshooting' },
    { file: path.join(dataDir, 'vendors.yaml'), schema: 'vendors' },
    { file: path.join(dataDir, 'cables.yaml'), schema: 'cables' },
    { file: path.join(dataDir, 'compare.yaml'), schema: 'pages' },
    { file: path.join(dataDir, 'faq.yaml'), schema: 'pages' },
    { file: path.join(dataDir, 'printing.yaml'), schema: 'pages' },
    // Optional until every dataset (fixtures included) carries one.
    ...(fs.existsSync(path.join(dataDir, 'glossary.yaml'))
      ? [{ file: path.join(dataDir, 'glossary.yaml'), schema: 'glossary' }]
      : []),
    ...assemblies,
  ];
}

export function loadDataset(dataDir = DATA_DIR): Dataset {
  const assemblies: Record<string, Step[]> = {};
  const dir = dataDir === DATA_DIR ? ASSEMBLIES_DIR : path.join(dataDir, 'assemblies');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    assemblies[path.basename(f, '.yaml')] = readYaml(path.join(dir, f)) as Step[];
  }
  return {
    parts: readYaml(path.join(dataDir, 'parts.yaml')) as Part[],
    servos: readYaml(path.join(dataDir, 'servos.yaml')) as Servo[],
    fasteners: readYaml(path.join(dataDir, 'fasteners.yaml')) as Fastener[],
    tools: readYaml(path.join(dataDir, 'tools.yaml')) as Tool[],
    troubleshooting: readYaml(path.join(dataDir, 'troubleshooting.yaml')) as Issue[],
    vendors: readYaml(path.join(dataDir, 'vendors.yaml')) as Vendor[],
    cables: readYaml(path.join(dataDir, 'cables.yaml')) as Cable[],
    compare: readYaml(path.join(dataDir, 'compare.yaml')) as PageRow[],
    faq: readYaml(path.join(dataDir, 'faq.yaml')) as PageRow[],
    printing: readYaml(path.join(dataDir, 'printing.yaml')) as PageRow[],
    glossary: fs.existsSync(path.join(dataDir, 'glossary.yaml'))
      ? (readYaml(path.join(dataDir, 'glossary.yaml')) as GlossaryEntry[])
      : [],
    assemblies,
  };
}
