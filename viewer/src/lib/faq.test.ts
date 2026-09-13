import { describe, expect, it } from 'vitest';
import { data, faqLink, FAQ_GROUP_ORDER } from './data';

describe('faq page data', () => {
  it('puts every question in a known group', () => {
    for (const q of data.faq) expect(FAQ_GROUP_ORDER).toContain(q.group);
  });
  it('names every related link instead of printing its path', () => {
    for (const q of data.faq)
      for (const r of q.related ?? []) {
        const l = faqLink(r);
        expect(l.label).not.toBe(r);
        expect(l.label.length).toBeGreaterThan(0);
      }
  });
  it('names a step by its short title and a discrepancy by its heading', () => {
    expect(faqLink('/follower/002-follower-set-servo-ids/')).toMatchObject({
      kind: 'F-002',
      label: 'Set motor IDs and baud rate',
      external: false,
    });
    const d = faqLink('D-001');
    expect(d).toMatchObject({ kind: 'D-001', label: 'Motor-mounting screw size', external: true });
    expect(d.href).toMatch(/discrepancies\.md#d-001--motor-mounting-screw-size$/);
  });
  it('throws on a target that is not a step, a section page or a discrepancy', () => {
    expect(() => faqLink('/nowhere/')).toThrow();
    expect(() => faqLink('/faq/')).toThrow();
  });
});
