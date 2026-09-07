import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/load.js';
import { resolveDataset } from '../src/resolve.js';
import { listFlags, validateAll, validateCrossRefs, validateSchemas } from '../src/validate-lib.js';
import { DATA_DIR, SCHEMA_DIR } from '../src/paths.js';

const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', n);
const NO_PLACEMENTS = '/nonexistent/placements.json';

describe('schemas', () => {
  it('accept the valid fixture', () => {
    expect(validateSchemas(fx('valid'), SCHEMA_DIR)).toEqual([]);
  });
  it('accept the real data directory', () => {
    expect(validateAll(DATA_DIR, SCHEMA_DIR, NO_PLACEMENTS)).toEqual([]);
  });
});

describe('cross-references', () => {
  it('pass on the valid fixture', () => {
    expect(validateCrossRefs(loadDataset(fx('valid')), NO_PLACEMENTS)).toEqual([]);
  });
  it('report every dangling reference and the missing source', () => {
    const msgs = validateCrossRefs(loadDataset(fx('invalid')), NO_PLACEMENTS).map((p) => p.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unknown part 'does-not-exist'"),
        expect.stringContaining("unknown fastener 'm3x8'"),
        expect.stringContaining("unknown tool 'nope'"),
        expect.stringContaining("servo_slot 'elbow_flex'"),
        expect.stringContaining('source is empty'),
      ]),
    );
  });
  it('rejects an unknown extends target', () => {
    const msgs = validateCrossRefs(loadDataset(fx('invalid-extends')), NO_PLACEMENTS).map(
      (p) => p.message,
    );
    expect(msgs).toEqual([expect.stringContaining("extends unknown step 'F-999'")]);
  });
  it('resolves extends: child inherits parent fields and keeps its own id/slug/assembly', () => {
    const { dataset, problems } = resolveDataset(loadDataset(fx('valid')));
    expect(problems).toEqual([]);
    const l = dataset.assemblies.leader[0];
    expect(l.id).toBe('L-001');
    expect(l.assembly).toBe('leader');
    expect(l.extends).toBe('F-001');
    expect(l.title).toBe('Mount shoulder-pan servo to base');
    expect(l.check).toBeDefined();
    expect(l.orientation_note).toBe('leader override');
    expect(l.fasteners).toEqual([{ id: 'm2x6-shcs', qty: 4 }]);
  });
  it('plain register: every rule fires once on the invalid-plain fixture', () => {
    const msgs = validateCrossRefs(loadDataset(fx('invalid-plain')), NO_PLACEMENTS).map(
      (p) => `${p.where}: ${p.message}`,
    );
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("'F-999.check' names nothing"),
        expect.stringContaining("number '6'"),
        expect.stringContaining('"step 3" but no step'),
        expect.stringContaining("'nonsense' names nothing"),
        expect.stringContaining("name_plain has number '8'"),
        expect.stringContaining("match 'Horn' already used by 'horn'"),
        expect.stringContaining('kind is fact but source is empty'),
      ]),
    );
    // The leader step inherits the same plain block through extends and fails the same way.
    expect(msgs.filter((m) => m.startsWith('L-001 plain'))).toHaveLength(
      msgs.filter((m) => m.startsWith('F-001 plain')).length,
    );
  });
  it('plain register: a correct block passes and "step N" resolves through extends', () => {
    expect(validateCrossRefs(loadDataset(fx('valid')), NO_PLACEMENTS)).toEqual([]);
  });
  it('lists flags', () => {
    expect(listFlags(loadDataset(fx('valid')))).toEqual([
      { file: 'tools.yaml', id: 'hex-1.5', flag: 'unverified' },
      { file: 'troubleshooting.yaml', id: 'horn-binds', flag: 'unverified' },
    ]);
  });
});
