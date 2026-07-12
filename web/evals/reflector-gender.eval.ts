// EVAL: reflector user_gender (lib/memory.ts → REFLECT_SYS, real Sarvam call).
//
// The reflector's hardest, highest-stakes field: it must label gender ONLY on a
// clear self-cue (gendered Hindi verb, explicit statement) and NEVER guess from
// names or topics. A wrong label is costly because mergeFacts() makes
// user_gender sticky across future calls.
//
// Grading is ASSERTION-based against a labeled golden set
// (datasets/reflector-gender.jsonl). Two gates:
//   - HARD: zero "over-claims" (predicting masculine/feminine when truth is
//           unknown/neutral) — the dangerous, stereotype-driven direction.
//   - SOFT: overall label accuracy threshold.
//
// Run:  npm run eval   (skips automatically if SARVAM_API_KEY is unset)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { REFLECT_SYS, parseReflectionJson } from '@/lib/memory';
import { sarvamChat } from '@/lib/sarvam';
import { summarize, mapWithConcurrency, type CaseResult } from './lib/harness';

// FINDING: the first run scored ~0.64 — the reflector under-detected
// romanized-Hindi gendered verbs and they/them requests. Adding explicit
// gendered-verb cues + few-shot examples to REFLECT_SYS raised it to ~0.79 on
// sarvam-30b, and the hard gate (no over-claims) still holds. Remaining gaps:
// English explicit statements ("as a guy") are caught only intermittently, and
// near-empty transcripts can yield an invalid-shape parse error. This floor
// guards the gain; ratchet it toward ~0.85 as those are addressed. See README.
const BASELINE_ACCURACY = 0.65;

type GenderCase = { id: string; note: string; transcript: string; expected: string };

const dir = path.dirname(fileURLToPath(import.meta.url));
const cases: GenderCase[] = readFileSync(path.join(dir, 'datasets', 'reflector-gender.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as GenderCase);

describe.skipIf(!process.env.SARVAM_API_KEY)('eval: reflector user_gender', () => {
  it('labels gender only on clear self-cues, never guesses', async () => {
    // Run cases concurrently (capped) — the Sarvam reasoning model is slow, so
    // sequential calls over the set can blow the test timeout.
    const evaluated = await mapWithConcurrency(cases, 4, async (c) => {
      let got = 'error';
      try {
        const raw = await sarvamChat({
          system: REFLECT_SYS,
          user: `Conversation:\n\n${c.transcript}\n\nWrite the JSON reflection now.`,
          responseFormat: 'json_object',
        });
        const parsed = parseReflectionJson(raw);
        got = String((parsed.facts as Record<string, unknown>).user_gender ?? 'missing');
      } catch (err) {
        got = `error: ${String(err)}`.slice(0, 50);
      }
      return { c, got };
    });

    const results: CaseResult[] = [];
    const overClaims: string[] = [];
    for (const { c, got } of evaluated) {
      const pass = got === c.expected;
      const truthIsNoCue = c.expected === 'unknown' || c.expected === 'neutral';
      const guessedConcrete = got === 'masculine' || got === 'feminine';
      if (truthIsNoCue && guessedConcrete) overClaims.push(`${c.id}→${got}`);
      results.push({ id: `${c.id} (${c.note})`, pass, detail: `expected=${c.expected} got=${got}` });
    }

    const { accuracy } = summarize('reflector user_gender', results);

    expect(
      overClaims,
      `must not guess a gender on no-cue/neutral cases: ${overClaims.join(', ')}`,
    ).toHaveLength(0);
    expect(accuracy).toBeGreaterThanOrEqual(BASELINE_ACCURACY);
  });
});
