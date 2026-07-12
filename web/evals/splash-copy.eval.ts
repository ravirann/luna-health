// EVAL: splash copy (lib/splash-copy.ts → generateOne, real model call).
//
// Grading is mostly DETERMINISTIC (mode #1): generated copy must contain zero
// banned vocabulary (DESIGN.md §2) and keep the headline short. We hard-fail on
// any banned phrase and soft-gate on overall pass rate to absorb model variance.
//
// Run:  npm run eval   (skips automatically if no OPENAI/SARVAM key is set)

import { describe, it, expect } from 'vitest';
import { generateOne, type TimeOfDay } from '@/lib/splash-copy';
import { findBannedPhrases } from './lib/banned-vocab';
import { hasAnyLLMKey, summarize, type CaseResult } from './lib/harness';

const BUCKETS: TimeOfDay[] = ['morning', 'evening', 'late_night', 'midnight', 'predawn'];
// Bump EVAL_SPLASH_SAMPLES to sample each bucket multiple times and catch variance.
const SAMPLES = Math.max(1, Number(process.env.EVAL_SPLASH_SAMPLES ?? 1));

describe.skipIf(!hasAnyLLMKey())('eval: splash copy', () => {
  it('is on-brand and banned-vocab-free across every time-of-day', async () => {
    const results: CaseResult[] = [];

    for (const tod of BUCKETS) {
      for (let i = 0; i < SAMPLES; i++) {
        const id = `${tod}#${i + 1}`;
        const copy = await generateOne(tod);
        if (!copy) {
          results.push({ id, pass: false, detail: 'model returned no usable copy' });
          continue;
        }
        const text = `${copy.headline} ${copy.subtitle}`;
        const banned = findBannedPhrases(text);
        const headlineWords = copy.headline.trim().split(/\s+/).length;

        const problems: string[] = [];
        if (banned.length) problems.push(`banned: ${banned.join(', ')}`);
        if (headlineWords > 7) problems.push(`headline ${headlineWords} words (>7)`);

        results.push({
          id,
          pass: problems.length === 0,
          detail: problems.join('; ') || `“${copy.headline}” / “${copy.subtitle}”`,
        });
      }
    }

    const { accuracy } = summarize('splash copy', results);

    // Hard gate: banned vocabulary is never acceptable.
    const bannedFailures = results.filter((r) => r.detail?.startsWith('banned')).length;
    expect(bannedFailures, 'banned vocabulary must never appear in generated copy').toBe(0);

    // Soft gate: tolerate occasional length drift, but most must pass.
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });
});
