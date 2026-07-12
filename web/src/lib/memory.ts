// Memory: hydrate (read at session start) + reflect (write at session end).

import { desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { sarvamChat, sarvamEmbed } from '@/lib/sarvam';

// ---------------------------------------------------------------------------
// Hydration — read recent + relevant memories for the bot's system prompt.
// ---------------------------------------------------------------------------

export type HydratedMemory = {
  /** structured user-profile facts merged across recent reflections */
  facts: Record<string, unknown>;
  /** the 3 most-recent reflections, free-text */
  recent: { text: string; createdAt: Date }[];
  /** vector-search top-k against `currentSeed` if provided */
  relevant: { text: string; createdAt: Date; score: number }[];
};

const MERGE_LAST_N = 5;
const RECENT_N = 3;
const VEC_K = 3;

/** Keys whose value should not be overwritten by a later "unknown" / blank.
 * Sticky inferences — once we've learned a user is masculine/feminine, a later
 * call where it wasn't re-mentioned should NOT silently revert to unknown.
 */
const STICKY_KEYS = new Set(['user_gender']);
const STICKY_BLANKS = new Set([undefined, null, '', 'unknown', 'unsure']);

/** Merge facts JSON across the last N reflections, latest wins per key —
 * except for STICKY_KEYS where a later "unknown" never overwrites a known
 * earlier value. */
export function mergeFacts(reflections: { facts: unknown }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of reflections.slice().reverse()) {
    const f = r.facts;
    if (!f || typeof f !== 'object') continue;
    for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
      if (STICKY_KEYS.has(k) && STICKY_BLANKS.has(v as string | undefined | null)) {
        continue;
      }
      out[k] = v;
    }
  }
  return out;
}

export async function hydrateMemory(
  userId: string,
  currentSeed?: string | null,
): Promise<HydratedMemory> {
  const db = getDb();

  const recentRows = await db
    .select({
      facts: schema.reflections.facts,
      freeText: schema.reflections.freeText,
      createdAt: schema.reflections.createdAt,
    })
    .from(schema.reflections)
    .where(eq(schema.reflections.userId, userId))
    .orderBy(desc(schema.reflections.createdAt))
    .limit(MERGE_LAST_N);

  const facts = mergeFacts(recentRows);
  const recent = recentRows.slice(0, RECENT_N).map((r) => ({
    text: r.freeText,
    createdAt: r.createdAt as unknown as Date,
  }));

  let relevant: HydratedMemory['relevant'] = [];
  if (currentSeed && currentSeed.trim().length > 0) {
    try {
      const vec = await sarvamEmbed(currentSeed);
      const literal = `[${vec.join(',')}]`;
      // Use raw SQL for the vector op since drizzle-orm's pgvector helpers
      // are still in flux; the parameterised literal is safe (numeric only).
      const sims = await db.execute<{ free_text: string; created_at: Date; score: number }>(sql`
        SELECT free_text, created_at,
               1 - (embedding <=> ${literal}::vector) AS score
          FROM reflections
         WHERE user_id = ${userId}
           AND embedding IS NOT NULL
         ORDER BY embedding <=> ${literal}::vector
         LIMIT ${VEC_K}
      `);
      const rows = sims.rows ?? [];
      relevant = rows.map((r) => ({
        text: r.free_text,
        createdAt: r.created_at,
        score: Number(r.score),
      }));
    } catch (err) {
      // Memory is best-effort — never fail the call because retrieval broke.
      console.warn('hydrateMemory: vector search failed', err);
    }
  }

  return { facts, recent, relevant };
}

/** Format the hydrated memory as a system-prompt fragment. */
export function memoryToPromptFragment(mem: HydratedMemory): string {
  const lines: string[] = [];
  // Surface user_gender on its own line so the bot uses correct grammar
  // from turn 1 instead of having to re-infer from the conversation.
  const gender = mem.facts.user_gender;
  if (typeof gender === 'string' && gender !== 'unknown' && gender.trim()) {
    lines.push(
      `USER GENDER (from past calls — use for Hindi grammar without asking): ${gender}`,
    );
  }
  if (Object.keys(mem.facts).length) {
    lines.push('USER PROFILE (from past calls): ' + JSON.stringify(mem.facts));
  }
  if (mem.recent.length) {
    lines.push('RECENT REFLECTIONS (latest first):');
    for (const r of mem.recent) {
      lines.push(`- ${r.text}`);
    }
  }
  if (mem.relevant.length) {
    lines.push('POTENTIALLY RELEVANT MOMENTS:');
    for (const r of mem.relevant) {
      lines.push(`- ${r.text} (relevance ${r.score.toFixed(2)})`);
    }
  }
  if (!lines.length) return '';
  return [
    '',
    '--- MEMORY (use sparingly; never recite verbatim, only let it inform tone)---',
    ...lines,
    '--- END MEMORY ---',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reflector — read the session's transcript, extract facts + free-text,
// embed, store. Run in the background after the call ends.
// ---------------------------------------------------------------------------

export const REFLECT_SYS = `You are a careful note-taker for a voice companion app called Luna.
Your job after each conversation: write a short, accurate post-call note for
future sessions to draw on.

Output ONLY a single JSON object with this shape:

  {
    "facts": {
      "mentioned_people": ["..."],
      "themes": ["..."],
      "mood": "...",
      "unresolved": "...",
      "language_preference": "hinglish|en|hi",
      "user_gender": "masculine|feminine|neutral|unknown"
    },
    "free_text": "1-2 paragraph reflection in plain prose, no bullet points,
                  written from Luna's perspective in past tense.
                  Mention concrete details the user shared. Avoid platitudes."
  }

Rules for user_gender — read carefully; infer ONLY from how the user refers
to THEMSELVES (first person). There are two valid cues:

(a) A gendered Hindi/Hinglish verb or adjective ending the user applies to
    themselves. These endings ARE a clear cue — when you see one, USE it; do
    NOT default to "unknown":
      - masculine endings -aa / -ta hoon / -ya: e.g. "main gaya / aaya / gaya
        tha", "main nahi gaya", "karta hoon", "soch raha tha", "akela",
        "thaka hua".
      - feminine endings -i / -ti hoon / -yi: e.g. "main gayi / aayi / gayi
        thi", "karti hoon", "soch rahi thi", "akeli", "thaki hui".
(b) An explicit statement of their own gender: "I'm a man/woman", "as a
    guy/girl", or a clearly gendered self-descriptor.

Set "neutral" when the user explicitly asks for neutral phrasing or they/them
pronouns, or signals non-binary identity.

Otherwise output "unknown". NEVER infer gender from: a name, the people or
topics they mention (e.g. "my wife" / "my husband" says nothing about the
USER), their voice, or gender-neutral Hindi like "main theek hoon" / "main
thik thaak hoon". When there is no first-person gendered self-cue and no
explicit statement, output "unknown".

Worked examples (conversation cue -> user_gender):
  "main kal gaya tha"        -> masculine
  "main akela feel karta hoon" -> masculine
  "main thaki hui hoon"      -> feminine
  "main akeli feel karti hoon" -> feminine
  "please use they/them"     -> neutral
  "hi, I'm Priya"            -> unknown   (a name is NOT a cue)
  "my wife and I fought"     -> unknown   (a relationship is NOT a self-cue)

Be concise. Do NOT include any text outside the JSON.
`;

type ReflectionPayload = {
  facts: Record<string, unknown>;
  free_text: string;
};

export function parseReflectionJson(raw: string): ReflectionPayload {
  // Reasoning models prepend <think>...</think> blocks; strip them. Then
  // strip code fences. Finally, slice the first balanced {…} block since the
  // model may still emit prose around the JSON.
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const withoutFences = withoutThink
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('reflector response had no JSON object');
  }
  const obj = JSON.parse(withoutFences.slice(start, end + 1)) as ReflectionPayload;
  if (!obj || typeof obj.free_text !== 'string') {
    throw new Error('reflector returned invalid shape');
  }
  return obj;
}

export async function reflectOnSession(sessionId: string): Promise<{
  reflectionId: string;
} | null> {
  const db = getDb();

  // Skip if we already have a reflection for this session.
  const existing = await db
    .select({ id: schema.reflections.id })
    .from(schema.reflections)
    .where(eq(schema.reflections.sessionId, sessionId))
    .limit(1);
  if (existing.length > 0) return { reflectionId: existing[0].id };

  const sess = (
    await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1)
  )[0];
  if (!sess) return null;

  const lines = await db
    .select({ role: schema.transcripts.role, text: schema.transcripts.text })
    .from(schema.transcripts)
    .where(eq(schema.transcripts.sessionId, sessionId))
    .orderBy(schema.transcripts.ts);

  if (lines.length === 0) return null;

  const transcript = lines
    .map((l) => (l.role === 'user' ? `USER: ${l.text}` : `ASSISTANT: ${l.text}`))
    .join('\n');

  const raw = await sarvamChat({
    system: REFLECT_SYS,
    user: `Conversation:\n\n${transcript}\n\nWrite the JSON reflection now.`,
    responseFormat: 'json_object',
  });

  const parsed = parseReflectionJson(raw);

  // Embedding is best-effort: an unconfigured/failing embeddings provider
  // (e.g. no OPENAI_API_KEY in a self-hosted deploy) should never sink the
  // reflection — the facts + free-text are still worth keeping. A NULL
  // embedding just means hydrateMemory's vector-similarity search (which
  // already filters `WHERE embedding IS NOT NULL`) silently skips this row;
  // the recent-reflections + merged-facts recall paths are unaffected.
  let literal: string | null = null;
  try {
    const embedding = await sarvamEmbed(parsed.free_text);
    literal = `[${embedding.join(',')}]`;
  } catch (err) {
    console.warn('reflectOnSession: embedding failed, storing reflection without one', err);
  }

  // Drizzle's vector type takes number[] but the neon-http driver round-trips
  // arrays as JSON; we use raw SQL for the embedding to be safe.
  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO reflections (user_id, session_id, facts, free_text, embedding)
    VALUES (${sess.userId}, ${sessionId}, ${JSON.stringify(parsed.facts)}::jsonb,
            ${parsed.free_text}, ${literal}::vector)
    RETURNING id
  `);
  const rows = inserted.rows ?? [];
  return { reflectionId: rows[0]?.id ?? '' };
}
