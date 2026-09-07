import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/load.js';
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
  it('lists flags', () => {
    expect(listFlags(loadDataset(fx('valid')))).toEqual([
      { file: 'tools.yaml', id: 'hex-1.5', flag: 'unverified' },
      { file: 'troubleshooting.yaml', id: 'horn-binds', flag: 'unverified' },
    ]);
  });
});
