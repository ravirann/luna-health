// Spec §4.2: signed HTTP-only cookie carrying { userId, issuedAt }.
// Format: base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(secret, body))
// The HMAC is computed over the *base64url body*, not the raw JSON, so
// verification doesn't need to re-parse before authenticating.

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  GUEST_COOKIE_MAX_AGE_SEC,
  GUEST_COOKIE_NAME,
} from '@/lib/guest-constants';

export { GUEST_COOKIE_NAME, GUEST_COOKIE_MAX_AGE_SEC };

type GuestPayload = {
  userId: string;
  issuedAt: number;
};

type SignInput = { userId: string };

type VerifyResult =
  | { ok: true; payload: GuestPayload }
  | { ok: false; error: 'no_secret' | 'malformed' | 'bad_signature' | 'expired' };

function getSecret(): string {
  const s = process.env.GUEST_COOKIE_SECRET;
  if (!s || s.length < 16) {
    throw new Error('GUEST_COOKIE_SECRET not set or too short (needs ≥16 chars)');
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export function signGuestCookie(input: SignInput): string {
  const secret = getSecret();
  const payload: GuestPayload = {
    userId: input.userId,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyGuestCookie(raw: string): VerifyResult {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, error: 'no_secret' };
  }
  if (!raw || raw.indexOf('.') === -1) {
    return { ok: false, error: 'malformed' };
  }
  const parts = raw.split('.');
  if (parts.length !== 2) return { ok: false, error: 'malformed' };
  const [body, sig] = parts;
  if (!body || !sig) return { ok: false, error: 'malformed' };

  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (expected.length !== sig.length) return { ok: false, error: 'bad_signature' };
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (!timingSafeEqual(a, b)) return { ok: false, error: 'bad_signature' };

  let payload: GuestPayload;
  try {
    const json = b64urlDecode(body).toString('utf8');
    const parsed = JSON.parse(json) as Partial<GuestPayload>;
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.issuedAt !== 'number') {
      return { ok: false, error: 'malformed' };
    }
    payload = { userId: parsed.userId, issuedAt: parsed.issuedAt };
  } catch {
    return { ok: false, error: 'malformed' };
  }

  const ageSec = Math.floor(Date.now() / 1000) - payload.issuedAt;
  if (ageSec > GUEST_COOKIE_MAX_AGE_SEC) {
    return { ok: false, error: 'expired' };
  }
  return { ok: true, payload };
}
