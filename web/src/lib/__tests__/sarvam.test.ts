import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe('sarvamChat', () => {
  it('uses the active low-latency Sarvam chat model by default', async () => {
    vi.stubEnv('SARVAM_API_KEY', 'test-sarvam-key');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { sarvamChat } = await import('@/lib/sarvam');

    await sarvamChat({ system: 'system', user: 'user', responseFormat: 'json_object' });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.model).toBe('sarvam-30b');
  });

  it('allows opting into Sarvam 105B for higher-quality reflection jobs', async () => {
    vi.stubEnv('SARVAM_API_KEY', 'test-sarvam-key');
    vi.stubEnv('SARVAM_CHAT_MODEL', 'sarvam-105b');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ choices: [{ message: { content: 'done' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { sarvamChat } = await import('@/lib/sarvam');

    await sarvamChat({ system: 'system', user: 'user' });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.model).toBe('sarvam-105b');
  });
});
