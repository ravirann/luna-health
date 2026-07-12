# Evals — grading Luna's AI surfaces

Unit tests (`npm test`) check **deterministic** code. **Evals** check the
**non-deterministic** output of our LLM surfaces — the reflector, splash copy,
the bot. They call real models, so they're slow and cost tokens, and they live
behind a separate command.

```bash
npm run eval                          # run every eval (skips ones whose keys are unset)
npm run eval -- reflector             # run one file (vitest name filter)
EVAL_SPLASH_SAMPLES=3 npm run eval    # sample the splash buckets 3× each
```

Keys come from `.env.local` / `.env` (same as the app). An eval **skips itself**
when its provider key is missing, so `npm run eval` is always safe to run.

## The three ways to grade (cheapest first)

1. **Assertion / code-based** — express the rule in code. Most reliable; use it
   whenever you can. → `findBannedPhrases()`, JSON-schema checks, label match.
2. **LLM-as-a-judge** — a model grades against a written rubric, for subjective
   quality (tone, warmth). → `llmJudge()` in `lib/harness.ts`. Judges have
   biases (position, verbosity, self-preference) — validate against human
   labels before you trust one to gate.
3. **Human review** — ground truth, expensive. Use it to build the golden set
   and to sanity-check your judge.

The loop: **collect real examples → label a small golden set (20–50) → write a
grader → run → measure → fix the prompt → re-run as a regression.** Start tiny.

## What's here

| File | Surface | Mode | Gate |
|---|---|---|---|
| `splash-copy.eval.ts` | `lib/splash-copy.ts` `generateOne` | assertion (banned vocab + length) | hard: 0 banned phrases; soft: ≥80% pass |
| `reflector-gender.eval.ts` | `lib/memory.ts` `REFLECT_SYS` | assertion vs labeled set | hard: 0 gender over-claims; soft: ≥75% accuracy |
| `lib/banned-vocab.ts` | — | encoded DESIGN.md §2 banned list | shared grader |
| `lib/harness.ts` | — | `summarize()`, `hasAnyLLMKey()`, `llmJudge()` | shared |
| `datasets/reflector-gender.jsonl` | — | 14 labeled mini-transcripts | golden set |
| `datasets/safety-crisis.jsonl` | — (see TODO below) | 12 labeled messages (crisis + benign-lookalike) | golden set, no grader yet |

"Hard gate" = the failure we never tolerate (banned vocab; guessing gender from
a name/topic). "Soft gate" = a pass-rate threshold that absorbs model variance.

## Adding an eval

1. If it's a rule, add/extend a grader in `lib/`. If it's subjective, write a
   rubric for `llmJudge()`.
2. Put labeled examples in `datasets/` (JSON or JSONL).
3. Create `your-surface.eval.ts`, wrap it in `describe.skipIf(!keyPresent)`, and
   end with a hard gate (the thing that must never happen) + a soft gate
   (accuracy threshold). Print results with `summarize()`.

Keep evals out of the prod DB — call the generator/prompt directly (as these
do), don't go through the DB-backed cache/persistence paths.

## Findings (what the evals have already surfaced)

- **Reflector gender detection — found and fixed.** The first run scored ~0.64:
  `sarvam-30b` returned `unknown` for clear cues like "main gaya tha" / "karta
  hoon" (masculine) and explicit they/them requests, while never *guessing*
  (hard gate passed). Adding explicit romanized gendered-verb cues + few-shot
  examples to `REFLECT_SYS` raised accuracy to **~0.79**. The soft-gate floor
  was ratcheted 0.5 → 0.65 to lock in the gain.
  - *Still open:* a gendered cue that appears only late in a multi-turn
    conversation is sometimes missed; English explicit statements ("as a guy")
    are detected only intermittently; and near-empty transcripts can yield an
    invalid-shape parse error. Good next targets to push the floor toward ~0.85
    (a lower reflector temperature would likely also reduce the variance).
  - *Lesson:* one "failure" was actually a **bad label** — a case meant to be
    gender-neutral contained "akela" (the masculine form of "alone"), so the
    model was right and the dataset was wrong. When an eval fails, check the
    gold label before blaming the model.
  - *Note:* the golden set's gendered-verb forms overlap with the prompt's
    examples by design (they're canonical Hindi grammar); add held-out cases as
    you grow the set to keep it an honest generalization check.

## TODO — crisis-detection eval (`datasets/safety-crisis.jsonl`)

`datasets/safety-crisis.jsonl` is a labeled golden set (12 cases: clear crisis
signals + benign lookalikes that share surface vocabulary — hyperbole like
"this traffic is going to kill me", third-person film discussion, ordinary
sadness — the same "don't over-claim on a near-miss" shape as the reflector
gender hard-gate) for grading crisis-detection **classification precision**.

There is deliberately **no `.eval.ts` file for it yet**. The actual
classifier this would grade is real-time crisis detection in the Python bot
(`server/`) — out of scope for this web/-only pass, and there's no prompt,
endpoint, or shared module on the web/ side to call the same way
`reflector-gender.eval.ts` calls `REFLECT_SYS` directly in-process. Web/ only
*reacts* to the bot's `{ kind: 'risk', level: 'crisis' }` RTVI signal (see
`hooks/use-pipecat.ts`); it never re-derives the classification itself, so
there's nothing on this side to assert against without faking the thing
you'd be testing.

Wiring this up for real needs one of:
- The bot's crisis-detection prompt/logic exposed as an importable module
  (mirroring how `lib/memory.ts` exports `REFLECT_SYS` for
  `reflector-gender.eval.ts` to call directly) — likely means porting or
  sharing it from `server/luna_bot/` if it's Python, or extracting a
  TS/JS version if a shared surface is ever built.
- Or an integration-style eval that posts each `message` to a running bot
  instance's actual endpoint and asserts on the resulting RTVI signal —
  heavier (needs a live bot process) and a different pattern from every
  other eval here, which all call in-process.

Once either exists, `safety-crisis.eval.ts` should follow the
`reflector-gender.eval.ts` shape exactly: hard gate on **zero missed crises**
(the dangerous direction — never silently pass over a real signal) and a
soft gate on overall accuracy, using `summarize()` from `lib/harness.ts`.

## Roadmap (good next evals)

- **Reflector `free_text` quality** — `llmJudge()` rubric: concrete details, no
  platitudes, first-person Luna, past tense.
- **Memory recall@k** — labeled `seed → expected reflection` pairs against
  `hydrateMemory`'s vector search (precision@k).
- **Bot openers / conversation** — Python side (`server/`): persona/time fit,
  Hindi gender grammar from memory, and safety (never explicit / clinical /
  manipulative).
- **Promptfoo** — if you want a config-driven runner + dashboards for the
  model-graded suites, `promptfoo` works against Sarvam (OpenAI-compatible) and
  OpenAI; these vitest evals and promptfoo can coexist.
