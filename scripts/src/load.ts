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
  notes?: string;
};
export type Servo = Flagged & {
  id: string;
  assembly: string;
  joint: string;
  part: string;
  model: string;
  gear_ratio: string;
  voltage?: string;
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
export type Step = Flagged & {
  id: string;
  title: string;
  assembly: string;
  parts: string[];
  servo_slot?: string;
  orientation_note?: string;
  fasteners?: { id: string; qty: number }[];
  tools?: string[];
  cable_path?: [number, number, number][];
  warnings?: string[];
  check: string;
  instructions?: string;
};

export type Dataset = {
  parts: Part[];
  servos: Servo[];
  fasteners: Fastener[];
  tools: Tool[];
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
    assemblies,
  };
}
