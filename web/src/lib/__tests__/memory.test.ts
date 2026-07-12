import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { mergeFacts, parseReflectionJson, reflectOnSession } from '@/lib/memory';
import { getDb, schema } from '@/lib/db';

describe('parseReflectionJson', () => {
  it('parses a clean JSON object', () => {
    const raw = '{"facts":{"mood":"calm"},"free_text":"hello"}';
    expect(parseReflectionJson(raw)).toEqual({
      facts: { mood: 'calm' },
      free_text: 'hello',
    });
  });

  it('strips a <think> block from a reasoning model', () => {
    const raw = `<think>
Ok let me write a JSON response with the facts.
</think>
{"facts":{"mood":"reflective"},"free_text":"Tonight's chat felt..."}`;
    const result = parseReflectionJson(raw);
    expect(result.free_text).toContain("Tonight's chat");
  });

  it('strips a markdown code fence', () => {
    const raw = '```json\n{"facts":{},"free_text":"x"}\n```';
    expect(parseReflectionJson(raw).free_text).toBe('x');
  });

  it('handles think block, fence, and surrounding prose together', () => {
    const raw = `<think>reasoning here</think>

Here is the reflection:
\`\`\`json
{"facts":{"themes":["sleep"]},"free_text":"They mentioned trouble sleeping."}
\`\`\``;
    const result = parseReflectionJson(raw);
    expect(result.facts).toEqual({ themes: ['sleep'] });
    expect(result.free_text).toContain('sleeping');
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseReflectionJson('<think>only thinking, no JSON</think>')).toThrow();
  });

  it('throws when JSON has wrong shape', () => {
    expect(() => parseReflectionJson('{"facts":{}}')).toThrow();
  });
});

describe('mergeFacts user_gender stickiness', () => {
  // Reflections come back from the DB ordered NEWEST first (desc createdAt).
  // mergeFacts iterates oldest→newest so latest wins; user_gender skips the
  // overwrite when the newer value is "unknown" / blank.

  it('keeps a known masculine value across later unknown reflections', () => {
    const rows = [
      { facts: { user_gender: 'unknown', mood: 'tired' } }, // newest
      { facts: { user_gender: 'masculine' } }, // older
    ];
    expect(mergeFacts(rows).user_gender).toBe('masculine');
  });

  it('keeps a known feminine value across later blank/missing reflections', () => {
    const rows = [
      { facts: { mood: 'reflective' } }, // newest, no gender mentioned
      { facts: { user_gender: 'feminine' } },
    ];
    expect(mergeFacts(rows).user_gender).toBe('feminine');
  });

  it('lets a newer known value override an older known value', () => {
    const rows = [
      { facts: { user_gender: 'feminine' } }, // newest — user updated themselves
      { facts: { user_gender: 'neutral' } },
    ];
    expect(mergeFacts(rows).user_gender).toBe('feminine');
  });

  it('drops user_gender entirely when nothing was ever known', () => {
    // Sticky-blank skip is consistent: no row contributes a known value, so
    // the merged facts simply omit the key. memoryToPromptFragment then
    // never surfaces a USER GENDER line for these users.
    const rows = [
      { facts: { user_gender: 'unknown' } },
      { facts: { user_gender: 'unknown' } },
    ];
    expect(mergeFacts(rows)).not.toHaveProperty('user_gender');
  });

  it('still does latest-wins for non-sticky keys', () => {
    const rows = [
      { facts: { mood: 'calm' } },
      { facts: { mood: 'anxious' } },
    ];
    expect(mergeFacts(rows).mood).toBe('calm');
  });
});

describe('reflectOnSession embedding resilience', () => {
  const originalFetch = global.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalSarvamKey = process.env.SARVAM_API_KEY;

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
    if (originalSarvamKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = originalSarvamKey;
    if (!process.env.DATABASE_URL) return;
    const db = getDb();
    await db.execute(sql`
      DELETE FROM users
      WHERE is_anonymous = true
        AND clerk_user_id IS NULL
        AND created_at > now() - interval '5 minutes'
    `);
  });

  // Self-hosted deploys may not configure OPENAI_API_KEY at all — the
  // reflection (facts + free-text) is still worth keeping even without a
  // vector for similarity search. This is the DB-touching regression test
  // for that fallback (see lib/memory.ts:reflectOnSession).
  it.skipIf(!process.env.DATABASE_URL)(
    'inserts the reflection with a NULL embedding when the embeddings provider is unavailable',
    async () => {
      process.env.SARVAM_API_KEY = 'test-sarvam-key';
      delete process.env.OPENAI_API_KEY;

      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('api.sarvam.ai')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      facts: { mood: 'calm' },
                      free_text: 'A quiet check-in.',
                    }),
                  },
                },
              ],
            }),
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      }) as never;

      const db = getDb();
      const user = await db
        .insert(schema.users)
        .values({ isAnonymous: true })
        .returning({ id: schema.users.id });
      const session = await db
        .insert(schema.sessions)
        .values({ userId: user[0].id })
        .returning({ id: schema.sessions.id });
      await db.insert(schema.transcripts).values([
        { sessionId: session[0].id, role: 'user', text: 'hi' },
        { sessionId: session[0].id, role: 'assistant', text: 'hello' },
      ]);

      const result = await reflectOnSession(session[0].id);
      expect(result?.reflectionId).toBeTruthy();

      const rows = await db
        .select({
          embedding: schema.reflections.embedding,
          freeText: schema.reflections.freeText,
        })
        .from(schema.reflections)
        .where(eq(schema.reflections.id, result!.reflectionId));
      expect(rows[0].embedding).toBeNull();
      expect(rows[0].freeText).toBe('A quiet check-in.');
    },
  );
});
