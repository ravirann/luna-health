import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('BOT_URL', () => {
  it('does not fall back to localhost in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.NEXT_PUBLIC_BOT_URL;

    const env = await import('@/lib/env');

    expect(env.BOT_URL).toBe('');
  });

  it('keeps the localhost fallback for local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.NEXT_PUBLIC_BOT_URL;

    const env = await import('@/lib/env');

    expect(env.BOT_URL).toBe('http://localhost:7860');
  });

  it('uses BOT_INTERNAL_URL for server-side bot calls when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BOT_URL', 'https://bot.luna.example.com');
    vi.stubEnv('BOT_INTERNAL_URL', 'http://bot:7860');

    const env = await import('@/lib/env');

    expect(env.BOT_URL).toBe('https://bot.luna.example.com');
    expect(env.BOT_SERVER_URL).toBe('http://bot:7860');
  });
});
