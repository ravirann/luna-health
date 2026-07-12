// Minimal OpenAI chat client used for cheap text-generation jobs
// (splash copy, future short-form helpers). Direct fetch — no SDK, since
// we only need /v1/chat/completions and don't want the install bloat.
//
// Set OPENAI_API_KEY in env. Model is chosen at the call site; the
// splash-copy generator defaults to gpt-4.1-nano (the cheapest tier),
// falling back to gpt-4o-mini if you want a slightly bigger model.

const OPENAI_BASE = 'https://api.openai.com';

export type OpenAIChatOpts = {
  model: string;
  system: string;
  user: string;
  /** When true, asks for `response_format: { type: 'json_object' }`. */
  json?: boolean;
  temperature?: number;
};

export function hasOpenAIKey(): boolean {
  return !!(process.env.OPENAI_API_KEY ?? '').trim();
}

export async function openaiChat(opts: OpenAIChatOpts): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      temperature: opts.temperature ?? 0.6,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`openai chat failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0]?.message?.content ?? '';
}
