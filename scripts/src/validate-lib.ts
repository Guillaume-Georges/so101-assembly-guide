/**
 * Validation = JSON Schema (shape) + cross-reference rules (meaning).
 * Both must pass; CI and pre-commit call `validate.ts`, which wraps this.
 */
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { dataFiles, loadDataset, readYaml, type Dataset } from './load.js';
import { DATA_DIR, PLACEMENTS_JSON, SCHEMA_DIR } from './paths.js';

export type Problem = { file: string; where: string; message: string };

function buildAjv(schemaDir: string): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  for (const f of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.json'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')));
  }
  return ajv;
}

export function validateSchemas(dataDir = DATA_DIR, schemaDir = SCHEMA_DIR): Problem[] {
  const ajv = buildAjv(schemaDir);
  const problems: Problem[] = [];
  for (const { file, schema } of dataFiles(dataDir)) {
    const rel = path.relative(dataDir, file);
    if (!fs.existsSync(file)) {
      problems.push({ file: rel, where: '', message: 'file missing' });
      continue;
    }
    const validate = ajv.getSchema(`https://so101-assembly-guide/schema/${schema}.json`);
    if (!validate) throw new Error(`schema ${schema} not registered`);
    const data = readYaml(file);
    if (!validate(data)) {
      for (const e of validate.errors ?? []) {
        problems.push({
          file: rel,
          where: e.instancePath || '/',
          message: `${e.message ?? 'invalid'}${e.params ? ' ' + JSON.stringify(e.params) : ''}`,
        });
      }
    }
  }
  return problems;
}

function uniqueIds(items: { id: string }[], file: string, problems: Problem[]): Set<string> {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) problems.push({ file, where: it.id, message: 'duplicate id' });
    seen.add(it.id);
  }
  return seen;
}

/** Rules that JSON Schema cannot express: references between files, source-or-flag, geometry mapping. */
export function validateCrossRefs(ds: Dataset, placementsPath = PLACEMENTS_JSON): Problem[] {
  const p: Problem[] = [];
  const partIds = uniqueIds(ds.parts, 'parts.yaml', p);
  const fastenerIds = uniqueIds(ds.fasteners, 'fasteners.yaml', p);
  const toolIds = uniqueIds(ds.tools, 'tools.yaml', p);
  uniqueIds(ds.servos, 'servos.yaml', p);

  const requireSource = (
    file: string,
    it: { id: string; source: unknown[]; unverified?: boolean },
  ) => {
    if (!it.unverified && (!Array.isArray(it.source) || it.source.length === 0)) {
      p.push({ file, where: it.id, message: 'source is empty and unverified is not true' });
    }
  };
  ds.parts.forEach((x) => requireSource('parts.yaml', x));
  ds.fasteners.forEach((x) => requireSource('fasteners.yaml', x));
  ds.tools.forEach((x) => requireSource('tools.yaml', x));

  const servoSlots = new Set<string>();
  for (const s of ds.servos) {
    requireSource('servos.yaml', s);
    if (!partIds.has(s.part))
      p.push({ file: 'servos.yaml', where: s.id, message: `unknown part '${s.part}'` });
    const key = `${s.assembly}/${s.joint}`;
    if (servoSlots.has(key))
      p.push({ file: 'servos.yaml', where: s.id, message: `duplicate joint '${key}'` });
    servoSlots.add(key);
  }

  const stepIds = new Set<string>();
  for (const [name, steps] of Object.entries(ds.assemblies)) {
    const file = `assemblies/${name}.yaml`;
    const prefix = name === 'follower' ? 'F-' : name === 'leader' ? 'L-' : null;
    for (const st of steps) {
      if (stepIds.has(st.id)) p.push({ file, where: st.id, message: 'duplicate step id (global)' });
      stepIds.add(st.id);
      if (st.assembly !== name)
        p.push({ file, where: st.id, message: `assembly '${st.assembly}' != file '${name}'` });
      if (prefix && !st.id.startsWith(prefix))
        p.push({ file, where: st.id, message: `id must start with '${prefix}'` });
      requireSource(file, st);
      for (const id of st.parts)
        if (!partIds.has(id)) p.push({ file, where: st.id, message: `unknown part '${id}'` });
      for (const f of st.fasteners ?? [])
        if (!fastenerIds.has(f.id))
          p.push({ file, where: st.id, message: `unknown fastener '${f.id}'` });
      for (const t of st.tools ?? [])
        if (!toolIds.has(t)) p.push({ file, where: st.id, message: `unknown tool '${t}'` });
      if (st.servo_slot && !servoSlots.has(`${name}/${st.servo_slot}`))
        p.push({
          file,
          where: st.id,
          message: `servo_slot '${st.servo_slot}' not in servos.yaml for ${name}`,
        });
    }
  }

  // Geometry ↔ BOM mapping (Phase 2 output). Every placed solid must map to a part id.
  if (fs.existsSync(placementsPath)) {
    const placements = JSON.parse(fs.readFileSync(placementsPath, 'utf8')) as {
      part_id?: string;
      name?: string;
    }[];
    for (const pl of placements) {
      if (!pl.part_id || !partIds.has(pl.part_id))
        p.push({
          file: 'pipeline/out/placements.json',
          where: pl.name ?? '?',
          message: `no BOM id for solid (part_id='${pl.part_id ?? ''}')`,
        });
    }
  }
  return p;
}

export function validateAll(
  dataDir = DATA_DIR,
  schemaDir = SCHEMA_DIR,
  placementsPath = PLACEMENTS_JSON,
): Problem[] {
  const schemaProblems = validateSchemas(dataDir, schemaDir);
  if (schemaProblems.length) return schemaProblems; // shape first; cross-refs assume valid shape
  return validateCrossRefs(loadDataset(dataDir), placementsPath);
}

/** Every unverified/approximation flag in the dataset, for phase reports. */
export function listFlags(
  ds: Dataset,
): { file: string; id: string; flag: 'unverified' | 'approximation' }[] {
  const out: { file: string; id: string; flag: 'unverified' | 'approximation' }[] = [];
  const scan = (
    file: string,
    items: { id: string; unverified?: boolean; approximation?: boolean }[],
  ) => {
    for (const it of items) {
      if (it.unverified) out.push({ file, id: it.id, flag: 'unverified' });
      if (it.approximation) out.push({ file, id: it.id, flag: 'approximation' });
    }
  };
  scan('parts.yaml', ds.parts);
  scan('servos.yaml', ds.servos);
  scan('fasteners.yaml', ds.fasteners);
  scan('tools.yaml', ds.tools);
  for (const [n, s] of Object.entries(ds.assemblies)) scan(`assemblies/${n}.yaml`, s);
  return out;
}
