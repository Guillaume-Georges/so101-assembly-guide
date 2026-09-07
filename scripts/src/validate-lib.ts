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
import { resolveDataset } from './resolve.js';

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
export function validateCrossRefs(raw: Dataset, placementsPath = PLACEMENTS_JSON): Problem[] {
  const { dataset: ds, problems: resolveProblems } = resolveDataset(raw);
  const p: Problem[] = [...resolveProblems];
  if (resolveProblems.length) return p; // unresolved extends: nothing below is meaningful
  const partIds = uniqueIds(ds.parts, 'parts.yaml', p);
  const fastenerIds = uniqueIds(ds.fasteners, 'fasteners.yaml', p);
  const toolIds = uniqueIds(ds.tools, 'tools.yaml', p);
  uniqueIds(ds.servos, 'servos.yaml', p);
  uniqueIds(ds.troubleshooting, 'troubleshooting.yaml', p);
  uniqueIds(ds.vendors, 'vendors.yaml', p);

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
  const slugs = new Set<string>();
  const uniqueSlug = (file: string, it: { id: string; slug: string }) => {
    if (slugs.has(it.slug)) p.push({ file, where: it.id, message: `duplicate slug '${it.slug}'` });
    slugs.add(it.slug);
  };
  for (const [name, steps] of Object.entries(ds.assemblies)) {
    const file = `assemblies/${name}.yaml`;
    const prefix = name === 'follower' ? 'F-' : name === 'leader' ? 'L-' : null;
    for (const st of steps) {
      if (stepIds.has(st.id)) p.push({ file, where: st.id, message: 'duplicate step id (global)' });
      if (st.extends === st.id) p.push({ file, where: st.id, message: 'step extends itself' });
      stepIds.add(st.id);
      uniqueSlug(file, st);
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

  for (const t of ds.troubleshooting) {
    requireSource('troubleshooting.yaml', t);
    uniqueSlug('troubleshooting.yaml', t);
    for (const id of t.related_steps ?? [])
      if (!stepIds.has(id))
        p.push({ file: 'troubleshooting.yaml', where: t.id, message: `unknown step '${id}'` });
    for (const id of t.related_parts ?? [])
      if (!partIds.has(id))
        p.push({ file: 'troubleshooting.yaml', where: t.id, message: `unknown part '${id}'` });
  }
  for (const v of ds.vendors) {
    requireSource('vendors.yaml', v);
    for (const m of v.part_map ?? [])
      if (!partIds.has(m.part))
        p.push({
          file: 'vendors.yaml',
          where: v.id,
          message: `unknown part '${m.part}' in part_map`,
        });
  }

  // Geometry ↔ BOM mapping (Phase 2 output). Every placement must resolve to a BOM id of the right kind.
  if (fs.existsSync(placementsPath)) {
    const doc = JSON.parse(fs.readFileSync(placementsPath, 'utf8')) as {
      placements?: { kind?: string; id?: string; name?: string; mesh?: string }[];
    };
    const placements = Array.isArray(doc.placements) ? doc.placements : [];
    if (placements.length === 0)
      p.push({ file: 'pipeline/out/placements.json', where: '/', message: 'no placements' });
    for (const pl of placements) {
      const where = pl.name ?? '?';
      if (pl.kind === 'fastener') {
        if (!pl.id || !fastenerIds.has(pl.id))
          p.push({
            file: 'pipeline/out/placements.json',
            where,
            message: `no fastener id for solid (id='${pl.id ?? ''}')`,
          });
      } else if (!pl.id || !partIds.has(pl.id)) {
        p.push({
          file: 'pipeline/out/placements.json',
          where,
          message: `no BOM id for solid (id='${pl.id ?? ''}', kind='${pl.kind ?? ''}')`,
        });
      }
      if (!pl.mesh)
        p.push({ file: 'pipeline/out/placements.json', where, message: 'placement without mesh' });
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
  raw: Dataset,
): { file: string; id: string; flag: 'unverified' | 'approximation' }[] {
  const ds = resolveDataset(raw).dataset;
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
  scan('troubleshooting.yaml', ds.troubleshooting);
  scan('vendors.yaml', ds.vendors);
  for (const [n, s] of Object.entries(ds.assemblies)) scan(`assemblies/${n}.yaml`, s);
  return out;
}
