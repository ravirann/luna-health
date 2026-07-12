// Dynamic splash headline + subtitle.
//
// Generated once per (brand × time-of-day) bucket via Sarvam, then cached
// in the splash_copy table. We refresh when the cached row is older than
// COPY_TTL_MS (default 24h). Failures fall back to a static set so the
// splash NEVER ends up blank — the home page must always render something
// usable.
//
// Tone is fixed by the system prompt: soft, human, emotionally aware,
// minimal. Output schema is tiny JSON: { headline, subtitle }.

import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import { sarvamChat } from './sarvam';
import { openaiChat, hasOpenAIKey } from './openai';

export type TimeOfDay =
  | 'morning'
  | 'evening'
  | 'late_night'
  | 'midnight'
  | 'predawn';

export type SplashCopy = { headline: string; subtitle: string };

/** TTL before a cached row is considered stale and we re-generate. The
 *  cache is shared across all users on a given brand, so 24h is plenty. */
const COPY_TTL_MS = 24 * 60 * 60 * 1000;

/** Map IST hours to the design's enum. The bands match the spec the
 *  user provided — late_night and midnight are intentionally distinct
 *  so the LLM can hit two different emotional registers between 22:00
 *  and 03:00. */
export function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour >= 22 || hour < 1) return 'late_night';
  if (hour >= 1 && hour < 3) return 'midnight';
  if (hour >= 3 && hour < 5) return 'predawn';
  if (hour >= 5 && hour < 11) return 'morning';
  // Daytime + early evening collapses to 'evening' — the spec's enum
  // doesn't cover noon/afternoon and 'evening' is the closest neutral.
  return 'evening';
}

const SYSTEM_PROMPT = `You are writing landing screen copy for a late-night voice AI companion app.
The app provides a calm, emotionally safe space where users can talk or just feel less alone.

Your job is to generate:
1. A short headline (3–6 words max)
2. A short subtitle (1–2 lines, max 12 words total)

The tone must be:
- Soft
- Human
- Emotionally aware
- Slightly intimate, but NOT romantic or explicit
- Calm, not energetic

The copy should feel like:
- Someone gently speaking to the user
- Not marketing, not promotional
- No buzzwords, no product language

Avoid:
- Generic phrases like "Welcome" or "Start your journey"
- Anything salesy or technical
- Overly poetic or abstract language

The headline should:
- Reflect the user's emotional state at the given time of day
- Feel like a gentle question or observation
- Be natural and conversational

The subtitle should:
- Reinforce safety and openness
- Suggest talking or simply being present
- Feel grounding and minimal

Time of day context will be provided as one of:
evening · late_night · midnight · predawn · morning

Return ONLY valid JSON in this exact shape:
{"headline":"...","subtitle":"..."}

Keep style consistent across generations. Prefer simple, grounded language
over creative variations. When in doubt, be more minimal.

Examples of the right register (study these — match them in tone):

Input: late_night
Output: {"headline":"It’s one of those nights?","subtitle":"Talk about anything. Or just stay for the quiet."}

Input: predawn
Output: {"headline":"Still awake…","subtitle":"You don’t have to be alone right now."}

Input: evening
Output: {"headline":"Long day?","subtitle":"Talk about anything. Or just stay for the quiet."}

Input: morning
Output: {"headline":"Morning already?","subtitle":"Talk about anything. Or just stay for the quiet."}

Input: midnight
Output: {"headline":"It’s one of those nights?","subtitle":"Talk about anything. Or just stay for the quiet."}`;

/** Static fallbacks. Used when the LLM is unavailable or returns junk.
 *  Hand-written to feel as good as the generated set. */
const FALLBACKS: Record<TimeOfDay, SplashCopy> = {
  morning: {
    headline: 'Morning already?',
    subtitle: 'Talk about anything. Or just stay for the quiet.',
  },
  evening: {
    headline: 'Long day?',
    subtitle: 'Talk about anything. Or just stay for the quiet.',
  },
  late_night: {
    headline: 'Couldn’t sleep?',
    subtitle: 'Talk about anything. Or just stay for the quiet.',
  },
  midnight: {
    headline: 'It’s one of those nights?',
    subtitle: 'Talk about anything. Or just stay for the quiet.',
  },
  predawn: {
    headline: 'Still awake…',
    subtitle: 'You don’t have to be alone right now.',
  },
};

function isFreshEnough(generatedAt: Date): boolean {
  return Date.now() - generatedAt.getTime() < COPY_TTL_MS;
}

function isReasonable(c: { headline: string; subtitle: string }): boolean {
  const h = c.headline?.trim() ?? '';
  const s = c.subtitle?.trim() ?? '';
  if (!h || !s) return false;
  if (h.length > 60 || s.length > 120) return false;
  // Reject the obvious banned phrases.
  if (/welcome|begin your journey|start your journey/i.test(h)) return false;
  if (/welcome|begin your journey|start your journey/i.test(s)) return false;
  return true;
}

/** Sarvam-m is a reasoning model and prefixes responses with a
 *  `<think>…</think>` block. Strip everything up to and including that
 *  block, then extract the first {...} object via a brace-balanced scan
 *  so any trailing prose (also common with reasoning models) doesn't
 *  fail JSON.parse. */
function extractJsonObject(raw: string): string | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString: false | '"' | "'" = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (inString) {
      if (ch === inString) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function isContentFilterRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ((err as { isContentFilter?: unknown }).isContentFilter === true) {
    return true;
  }
  return /\bcontent_filter\b/i.test(err.message);
}

/** Call the configured cheap LLM once. Returns null on any failure
 *  (network / parse / shape).
 *
 *  Provider selection:
 *    - COPY_PROVIDER=openai (default when OPENAI_API_KEY is set)
 *    - COPY_PROVIDER=sarvam (fallback when no openai key)
 *  Model:
 *    - COPY_MODEL — defaults to gpt-4.1-nano for openai (cheapest tier,
 *      ~$0.10/M input). Use gpt-4o-mini for a slightly bigger drop-in.
 *      sarvam path uses `SARVAM_CHAT_MODEL` or the Sarvam helper default.
 */
export async function generateOne(
  timeOfDay: TimeOfDay,
): Promise<SplashCopy | null> {
  const providerEnv = (process.env.COPY_PROVIDER ?? '').trim().toLowerCase();
  const provider =
    providerEnv === 'sarvam' || providerEnv === 'openai'
      ? providerEnv
      : hasOpenAIKey()
        ? 'openai'
        : 'sarvam';
  const userPrompt = `Time of day: ${timeOfDay}\n\nGenerate one headline and one subtitle.`;

  try {
    const raw =
      provider === 'openai'
        ? await openaiChat({
            model: process.env.COPY_MODEL ?? 'gpt-4.1-nano',
            system: SYSTEM_PROMPT,
            user: userPrompt,
            json: true,
            temperature: 0.6,
          })
        : await sarvamChat({
            system: SYSTEM_PROMPT,
            user: userPrompt,
            responseFormat: 'json_object',
          });

    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) {
      console.warn('[splash-copy] no JSON object in response');
      return null;
    }
    const parsed = JSON.parse(jsonStr) as {
      headline?: unknown;
      subtitle?: unknown;
    };
    if (
      typeof parsed?.headline !== 'string' ||
      typeof parsed?.subtitle !== 'string'
    ) {
      return null;
    }
    const c: SplashCopy = {
      headline: parsed.headline.trim(),
      subtitle: parsed.subtitle.trim(),
    };
    if (!isReasonable(c)) return null;
    return c;
  } catch (err) {
    if (isContentFilterRejection(err)) {
      return null;
    }
    console.warn(`[splash-copy] ${provider} generation failed:`, err);
    return null;
  }
}

/** Return a copy row for (brand × time-of-day), generating + persisting
 *  on miss / stale, returning fallback if everything fails. Increments
 *  used_count on a hit so we can later detect "show too often, refresh
 *  earlier". Always returns a usable copy — never throws. */
export async function getOrGenerateSplashCopy(
  brandName: string,
  timeOfDay: TimeOfDay,
): Promise<SplashCopy> {
  const db = getDb();

  try {
    const existing = await db
      .select()
      .from(schema.splashCopy)
      .where(
        and(
          eq(schema.splashCopy.brandName, brandName),
          eq(schema.splashCopy.timeOfDay, timeOfDay),
        ),
      )
      .limit(1);

    if (existing.length > 0 && isFreshEnough(existing[0].generatedAt)) {
      // Bump usage counter (best-effort).
      void db
        .update(schema.splashCopy)
        .set({ usedCount: existing[0].usedCount + 1 })
        .where(eq(schema.splashCopy.id, existing[0].id))
        .catch(() => {});
      return {
        headline: existing[0].headline,
        subtitle: existing[0].subtitle,
      };
    }

    // Miss or stale — generate.
    const fresh = await generateOne(timeOfDay);
    const copyToServe =
      fresh ??
      (existing[0]
        ? { headline: existing[0].headline, subtitle: existing[0].subtitle }
        : FALLBACKS[timeOfDay]);

    // Upsert: replace the stale row in place if there is one, else insert.
    // If generation failed on a cold miss, cache the static fallback too so
    // subsequent requests do not keep retrying the provider for this bucket.
    if (existing.length > 0) {
      await db
        .update(schema.splashCopy)
        .set({
          headline: copyToServe.headline,
          subtitle: copyToServe.subtitle,
          generatedAt: new Date(),
          usedCount: 0,
        })
        .where(eq(schema.splashCopy.id, existing[0].id));
    } else {
      await db.insert(schema.splashCopy).values({
        brandName,
        timeOfDay,
        headline: copyToServe.headline,
        subtitle: copyToServe.subtitle,
      });
    }
    return copyToServe;
  } catch (err) {
    console.warn('[splash-copy] db lookup failed:', err);
    return FALLBACKS[timeOfDay];
  }
}
