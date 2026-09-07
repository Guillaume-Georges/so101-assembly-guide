/**
 * The Plain register is a rewording layer, never a knowledge layer (CLAUDE.md rule 1). Each plain
 * sentence names what it rewords in `from`; these rules make that checkable:
 *   1. every `from` pointer resolves (a field of this step, of another step, or a listed record);
 *   2. every number in the sentence appears in what it points at ("4 screws" needs a 4 upstream);
 *   3. "step N" names a step that `from` points at and that sits at position N in this assembly;
 *   4. a part or fastener name_plain carries no number its name/spec/notes lack.
 * What no rule catches, a reviewer does: the pointer puts the exact sentence beside the plain one.
 */
import type { Dataset, Fastener, Part, PlainSentence, Step } from './load.js';

export type Problem = { file: string; where: string; message: string };

const STEP_FIELDS = new Set([
  'title',
  'title_short',
  'check',
  'orientation_note',
  'instructions',
  'warnings',
  'servo_slot',
  'parts',
  'fasteners',
  'tools',
  'cables',
  'prep',
]);

/** Numeric tokens as a builder reads them: 4, 2, 1:345, 7.4, 3x6 (from M3x6), 002 (from F-002). */
export function numbersIn(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(/\d+(?:[.:x/-]\d+)*/g), (m) => m[0]));
}

/** "step 8" tokens: the N and the character span, so rule 2 can skip them. */
export function stepRefsIn(text: string): { n: number; index: number; length: number }[] {
  return Array.from(text.matchAll(/\bstep (\d+)\b/gi), (m) => ({
    n: Number(m[1]),
    index: m.index ?? 0,
    length: m[0].length,
  }));
}

/** Records without their provenance: sources carry URLs and dates whose digits would pad the pool. */
function recordText(rec: object): string {
  const copy: Record<string, unknown> = { ...(rec as Record<string, unknown>) };
  delete copy.source;
  delete copy.geometry_names;
  delete copy.path;
  return JSON.stringify(copy);
}

export type Resolved = { text: string; stepId?: string };

/** Resolve one `from` pointer against the resolved dataset. Null when it names nothing. */
export function resolveFrom(ref: string, step: Step, ds: Dataset): Resolved | null {
  const rec = ref.match(/^(part|fastener|tool|cable):(.+)$/);
  if (rec) {
    const rows: Record<string, { id: string }[]> = {
      part: ds.parts,
      fastener: ds.fasteners,
      tool: ds.tools,
      cable: ds.cables,
    };
    const row = rows[rec[1]].find((r) => r.id === rec[2]);
    return row ? { text: recordText(row) } : null;
  }
  let target: Step | undefined = step;
  let field = ref;
  const m = ref.match(/^([FL]-\d{3})\.(.+)$/);
  if (m) {
    target = Object.values(ds.assemblies)
      .flat()
      .find((s) => s.id === m[1]);
    field = m[2];
    if (!target) return null;
  }
  const stepId = m ? m[1] : undefined;
  const src = field.match(/^source\[(\d+)\]$/);
  if (src) {
    const s = target.source?.[Number(src[1])];
    return s ? { text: JSON.stringify(s), stepId } : null;
  }
  if (field === 'servo') {
    if (!target.servo_slot) return null;
    const slot = target.servo_slot;
    const servo = ds.servos.find((v) => v.assembly === target.assembly && v.joint === slot);
    return servo ? { text: recordText(servo), stepId } : null;
  }
  if (!STEP_FIELDS.has(field)) return null;
  const v = (target as unknown as Record<string, unknown>)[field];
  if (v === undefined) return null;
  return { text: typeof v === 'string' ? v : JSON.stringify(v), stepId };
}

/** 1-based position of the step that is, or extends, `id` in this assembly's list. */
function positionOf(id: string, list: Step[]): number {
  const i = list.findIndex((s) => s.id === id || s.extends === id);
  return i < 0 ? -1 : i + 1;
}

function checkSentence(
  sentence: PlainSentence,
  step: Step,
  list: Step[],
  ds: Dataset,
  file: string,
  label: string,
  p: Problem[],
) {
  const where = `${step.id} plain.${label}`;
  const pool: string[] = [];
  const stepIds: string[] = [];
  for (const ref of sentence.from) {
    const r = resolveFrom(ref, step, ds);
    if (!r) {
      p.push({ file, where, message: `plain: '${ref}' names nothing on this step` });
      continue;
    }
    pool.push(r.text);
    if (r.stepId) stepIds.push(r.stepId);
  }
  const poolNumbers = new Set<string>();
  for (const t of pool) for (const n of numbersIn(t)) poolNumbers.add(n);

  // Rule 3 first, so its digits are excluded from rule 2.
  let text = sentence.text;
  for (const s of stepRefsIn(sentence.text).reverse()) {
    const hit = stepIds.some((id) => positionOf(id, list) === s.n);
    if (!hit)
      p.push({
        file,
        where,
        message: `plain: "step ${s.n}" but no step in \`from\` sits at position ${s.n} of ${step.assembly}`,
      });
    text = text.slice(0, s.index) + text.slice(s.index + s.length);
  }
  for (const n of numbersIn(text))
    if (!poolNumbers.has(n))
      p.push({
        file,
        where,
        message: `plain: number '${n}' in "${sentence.text}" is not in anything \`from\` points at`,
      });
}

/** Rules 1–4 over a resolved dataset (extends already merged). */
export function validatePlain(ds: Dataset): Problem[] {
  const p: Problem[] = [];
  for (const [name, list] of Object.entries(ds.assemblies)) {
    const file = `assemblies/${name}.yaml`;
    for (const st of list) {
      if (!st.plain) continue;
      st.plain.do.forEach((s, i) => checkSentence(s, st, list, ds, file, `do[${i}]`, p));
      checkSentence(st.plain.done, st, list, ds, file, 'done', p);
    }
  }
  const namePlain = (
    file: string,
    rows: (Part | Fastener)[],
    base: (r: Part | Fastener) => string,
  ) => {
    for (const r of rows) {
      if (!r.name_plain) continue;
      const allowed = numbersIn(`${base(r)} ${r.notes ?? ''}`);
      for (const n of numbersIn(r.name_plain))
        if (!allowed.has(n))
          p.push({ file, where: r.id, message: `name_plain has number '${n}' its record lacks` });
    }
  };
  namePlain('parts.yaml', ds.parts, (r) => (r as Part).name);
  namePlain('fasteners.yaml', ds.fasteners, (r) => (r as Fastener).spec);
  return p;
}

/** Glossary: ids and match words unique; a `fact` needs a source like any row. */
export function validateGlossary(ds: Dataset): Problem[] {
  const p: Problem[] = [];
  const file = 'glossary.yaml';
  const ids = new Set<string>();
  const words = new Map<string, string>();
  for (const g of ds.glossary) {
    if (ids.has(g.id)) p.push({ file, where: g.id, message: 'duplicate id' });
    ids.add(g.id);
    for (const w of g.match) {
      const k = w.toLowerCase();
      const other = words.get(k);
      if (other && other !== g.id)
        p.push({ file, where: g.id, message: `match '${w}' already used by '${other}'` });
      words.set(k, g.id);
    }
    if (g.kind === 'fact' && !g.unverified && !g.source?.length)
      p.push({
        file,
        where: g.id,
        message: 'kind is fact but source is empty and unverified is not true',
      });
  }
  return p;
}
