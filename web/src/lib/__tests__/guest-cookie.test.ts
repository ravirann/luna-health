import { describe, it, expect, beforeAll } from 'vitest';
import { signGuestCookie, verifyGuestCookie, GUEST_COOKIE_NAME } from '@/lib/guest-cookie';

beforeAll(() => {
  process.env.GUEST_COOKIE_SECRET = 'test-secret-for-vitest-only-32bytes!!';
});

describe('guest-cookie', () => {
  it('exports the canonical cookie name', () => {
    expect(GUEST_COOKIE_NAME).toBe('luna_guest');
  });

  it('round-trips a valid payload', () => {
    const raw = signGuestCookie({ userId: '00000000-0000-0000-0000-000000000001' });
    const parsed = verifyGuestCookie(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.userId).toBe('00000000-0000-0000-0000-000000000001');
      expect(typeof parsed.payload.issuedAt).toBe('number');
    }
  });

  it('rejects a tampered payload (bad signature)', () => {
    const raw = signGuestCookie({ userId: '00000000-0000-0000-0000-000000000002' });
    const [body, sig] = raw.split('.');
    const tampered = body.slice(0, -1) + (body.slice(-1) === 'A' ? 'B' : 'A') + '.' + sig;
    const parsed = verifyGuestCookie(tampered);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('bad_signature');
  });

  it('rejects malformed input', () => {
    expect(verifyGuestCookie('').ok).toBe(false);
    expect(verifyGuestCookie('not-a-cookie').ok).toBe(false);
    expect(verifyGuestCookie('a.b.c').ok).toBe(false);
  });

  it('rejects when GUEST_COOKIE_SECRET is missing', () => {
    const old = process.env.GUEST_COOKIE_SECRET;
    delete process.env.GUEST_COOKIE_SECRET;
    try {
      expect(() => signGuestCookie({ userId: 'x' })).toThrow();
    } finally {
      process.env.GUEST_COOKIE_SECRET = old;
    }
  });
});
