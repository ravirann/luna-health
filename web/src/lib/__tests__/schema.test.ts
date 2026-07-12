import { describe, it, expect } from 'vitest';
import { schema } from '@/lib/db';

describe('schema additions', () => {
  it('users has isAnonymous + guestCookieHash + nullable clerkUserId', () => {
    // In this version of drizzle-orm, columns are direct properties on the
    // table object rather than under _.columns. We assert presence via truthiness.
    const users = schema.users as unknown as Record<string, unknown>;
    expect(users['isAnonymous']).toBeDefined();
    expect(users['guestCookieHash']).toBeDefined();
    // Drizzle exposes notNull on the column builder
    const clerk = (schema.users as unknown as { clerkUserId: { notNull: boolean } }).clerkUserId;
    expect(clerk.notNull).toBe(false);
  });

  it('users and authSessions expose local password auth fields', () => {
    const users = schema.users as unknown as Record<string, unknown>;
    expect(users['passwordHash']).toBeDefined();
    expect(schema.authSessions).toBeDefined();
    const sessions = schema.authSessions as unknown as Record<string, unknown>;
    expect(sessions['userId']).toBeDefined();
    expect(sessions['tokenHash']).toBeDefined();
    expect(sessions['expiresAt']).toBeDefined();
  });

  it('users has ip_hash for the anon-creation IP throttle (no separate ledger table)', () => {
    const users = schema.users as unknown as Record<string, unknown>;
    expect(users['ipHash']).toBeDefined();
  });

  it('does not export the removed ledger tables — usage limits are operator-configured, not per-user spend rows', () => {
    const schemaRecord = schema as unknown as Record<string, unknown>;
    expect(schemaRecord['credits']).toBeUndefined();
    expect(schemaRecord['trialGrants']).toBeUndefined();
  });

  it('userPrefs has languageMode for app and bot localization', () => {
    const prefs = schema.userPrefs as unknown as Record<string, unknown>;
    expect(prefs['languageMode']).toBeDefined();
  });
});
