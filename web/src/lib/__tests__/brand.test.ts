import { afterEach, describe, expect, it } from 'vitest';
import { readBrandFromEnv } from '@/lib/brand';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('readBrandFromEnv', () => {
  it('uses BOT_NAME when provided', () => {
    process.env.BRAND_NAME = 'luna';
    process.env.BOT_NAME = 'Anaya';

    expect(readBrandFromEnv().botName).toBe('Anaya');
  });

  it('does not invent a hardcoded persona name when BOT_NAME is missing', () => {
    process.env.BRAND_NAME = 'luna';
    delete process.env.BOT_NAME;
    delete process.env.NEXT_PUBLIC_BOT_NAME;

    expect(readBrandFromEnv().botName).toBe('luna');
  });
});
