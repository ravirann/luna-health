import { describe, it, expect } from 'vitest';
import { copyForRecall, type RecallShape } from '@/lib/recall';

describe('copyForRecall', () => {
  it('uses emotional copy when facts.mood is truthy', () => {
    const r: RecallShape = { kind: 'reflection', mood: 'restless', themes: [] };
    expect(copyForRecall(r)).toMatch(/restless/i);
  });
  it('uses topical copy when only themes are present', () => {
    const r: RecallShape = { kind: 'reflection', mood: null, themes: ['sleep'] };
    expect(copyForRecall(r)).toMatch(/trouble sleeping/i);
  });
  it('uses fallback when no usable reflection (§17.17)', () => {
    const r: RecallShape = { kind: 'no-reflection' };
    expect(copyForRecall(r)).toMatch(/talked here before/i);
  });
});
