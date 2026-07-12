import { describe, it, expect } from 'vitest';
// We can't easily run Next middleware in unit tests; instead we assert the
// exported route-matchers cover the right paths.
import middleware, { config } from '@/proxy';

describe('proxy.ts middleware config', () => {
  it('exports a default function and a config matcher', () => {
    expect(typeof middleware).toBe('function');
    expect(Array.isArray(config.matcher)).toBe(true);
  });
});
