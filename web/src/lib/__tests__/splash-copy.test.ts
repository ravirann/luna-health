import { afterEach, describe, expect, it, vi } from 'vitest';

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const sarvamChatMock = vi.fn();
const openaiChatMock = vi.fn();
const hasOpenAIKeyMock = vi.fn();
const insertedSplashValues: unknown[] = [];
const originalEnv = { ...process.env };

vi.mock('@/lib/sarvam', () => ({
  sarvamChat: sarvamChatMock,
}));

vi.mock('@/lib/openai', () => ({
  openaiChat: openaiChatMock,
  hasOpenAIKey: hasOpenAIKeyMock,
}));

vi.mock('@/lib/db', () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: vi.fn(async (values: unknown) => {
        insertedSplashValues.push(values);
      }),
    }),
  };

  return {
    getDb: () => db,
    schema: {
      splashCopy: {
        brandName: 'brand_name',
        timeOfDay: 'time_of_day',
      },
    },
  };
});

afterEach(() => {
  vi.clearAllMocks();
  insertedSplashValues.length = 0;
  process.env = { ...originalEnv };
});

describe('getOrGenerateSplashCopy', () => {
  it('falls back quietly when Sarvam rejects splash copy for content policy', async () => {
    process.env.COPY_PROVIDER = 'sarvam';
    hasOpenAIKeyMock.mockReturnValue(false);
    sarvamChatMock.mockRejectedValue(
      Object.assign(new Error('sarvam chat failed: 400 content_filter'), {
        isContentFilter: true,
      }),
    );

    const { getOrGenerateSplashCopy } = await import('@/lib/splash-copy');

    await expect(getOrGenerateSplashCopy('luna', 'late_night')).resolves.toEqual({
      headline: "Couldn’t sleep?",
      subtitle: 'Talk about anything. Or just stay for the quiet.',
    });
    expect(insertedSplashValues).toEqual([
      {
        brandName: 'luna',
        timeOfDay: 'late_night',
        headline: "Couldn’t sleep?",
        subtitle: 'Talk about anything. Or just stay for the quiet.',
      },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
