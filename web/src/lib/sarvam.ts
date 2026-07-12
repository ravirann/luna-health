// Sarvam AI HTTP helpers used by the Next.js side (reflector + embeddings).
// The voice path uses the official Sarvam pipecat services in Python; this
// is just for one-shot text/embed calls from API routes.

const SARVAM_BASE = 'https://api.sarvam.ai';
const DEFAULT_SARVAM_CHAT_MODEL = 'sarvam-30b';

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error('SARVAM_API_KEY not set');
  return k;
}

function chatModel(): string {
  return process.env.SARVAM_CHAT_MODEL?.trim() || DEFAULT_SARVAM_CHAT_MODEL;
}

/**
 * Chat with Sarvam's instruction-tuned LLM via the OpenAI-compatible
 * endpoint. Used by the reflector to extract structured user-profile facts
 * and write a free-text reflection.
 */
export async function sarvamChat(opts: {
  system: string;
  user: string;
  responseFormat?: 'text' | 'json_object';
}): Promise<string> {
  const res = await fetch(`${SARVAM_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key()}`,
    },
    body: JSON.stringify({
      model: chatModel(),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      ...(opts.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    throw new Error(`sarvam chat failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0]?.message?.content ?? '';
}

/**
 * Embed a string into a 1024-d vector matching the `reflections.embedding`
 * schema. Sarvam removed their embeddings API in late 2025, so we route
 * through OpenAI's `text-embedding-3-small` with the `dimensions` parameter
 * truncating the native 1536-d output to 1024-d. The function name stays
 * `sarvamEmbed` for backwards compatibility with existing call sites.
 */
export async function sarvamEmbed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set (required for embeddings)');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small',
      dimensions: 1024,
    }),
  });
  if (!res.ok) {
    throw new Error(`embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!vec || vec.length !== 1024) {
    throw new Error(`embed returned unexpected shape: ${vec?.length ?? 'missing'}`);
  }
  return vec;
}
