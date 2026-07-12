// Minimal eval harness. Three things every eval needs:
//   1. a way to record per-case pass/fail            -> CaseResult + summarize()
//   2. a way to know if it can run (API keys present) -> hasAnyLLMKey()
//   3. an LLM-as-judge for subjective dimensions      -> llmJudge()
//
// Evals call real models, so they are SLOW and cost tokens. They live under a
// separate vitest config (`npm run eval`) and skip themselves when keys are
// absent. Keep deterministic graders (assertions) for anything you can express
// as a rule; reserve llmJudge for genuinely subjective quality.

import { openaiChat, hasOpenAIKey } from '@/lib/openai';
import { sarvamChat } from '@/lib/sarvam';

export type CaseResult = { id: string; pass: boolean; detail?: string };

/** Print a compact report and return aggregate stats. */
export function summarize(name: string, results: CaseResult[]) {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const pct = total ? Math.round((100 * passed) / total) : 0;
  // eslint-disable-next-line no-console
  console.log(`\n[eval] ${name}: ${passed}/${total} (${pct}%)`);
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.id}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  return { passed, total, accuracy: total ? passed / total : 0 };
}

export function hasAnyLLMKey(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.SARVAM_API_KEY);
}

/** Run `fn` over `items` with at most `limit` in flight. Results keep input
 *  order. Evals over a dataset are I/O-bound on the model API — running a few
 *  concurrently keeps wall-time well under the test timeout without hammering
 *  rate limits. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type Judgement = { pass: boolean; score: number; reason: string };

/**
 * LLM-as-a-judge. Grades `output` against a written `rubric`, returning a
 * 0..1 score, a pass flag, and a one-line reason. Uses OpenAI when available
 * (deterministic temperature 0), else Sarvam.
 *
 * Caveat: judges have biases (position, verbosity, self-preference). Validate
 * a judge against human labels before trusting it for gating.
 */
export async function llmJudge(opts: {
  rubric: string;
  output: string;
  context?: string;
}): Promise<Judgement> {
  const system =
    'You are a strict evaluator. Grade the OUTPUT against the RUBRIC. ' +
    'Return ONLY JSON: {"score": <number 0..1>, "pass": <boolean>, "reason": "<one sentence>"}. ' +
    'Set pass=true only when the output clearly satisfies the rubric.';
  const user =
    `RUBRIC:\n${opts.rubric}\n\n` +
    (opts.context ? `CONTEXT:\n${opts.context}\n\n` : '') +
    `OUTPUT:\n${opts.output}`;

  const raw = hasOpenAIKey()
    ? await openaiChat({
        model: process.env.EVAL_JUDGE_MODEL ?? 'gpt-4.1-mini',
        system,
        user,
        json: true,
        temperature: 0,
      })
    : await sarvamChat({ system, user, responseFormat: 'json_object' });

  const match = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').match(/\{[\s\S]*\}/);
  if (!match) return { pass: false, score: 0, reason: 'judge returned no JSON' };
  try {
    const j = JSON.parse(match[0]) as Partial<Judgement>;
    return { pass: !!j.pass, score: Number(j.score) || 0, reason: String(j.reason ?? '') };
  } catch {
    return { pass: false, score: 0, reason: 'judge JSON parse failed' };
  }
}
