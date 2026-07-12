import { afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  dailyLimitMinutes,
  gateForDailyLimit,
  maxCallSeconds,
  todaysUsageSecs,
} from '@/lib/limits';
import { getDb, schema } from '@/lib/db';

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.execute(sql`
    DELETE FROM users
    WHERE is_anonymous = true
      AND clerk_user_id IS NULL
      AND created_at > now() - interval '5 minutes'
  `);
});

describe('maxCallSeconds', () => {
  it('defaults to 600 when MAX_CALL_SECONDS is unset', () => {
    const original = process.env.MAX_CALL_SECONDS;
    delete process.env.MAX_CALL_SECONDS;
    try {
      expect(maxCallSeconds()).toBe(600);
    } finally {
      if (original !== undefined) process.env.MAX_CALL_SECONDS = original;
    }
  });

  it('uses the configured value', () => {
    const original = process.env.MAX_CALL_SECONDS;
    process.env.MAX_CALL_SECONDS = '300';
    try {
      expect(maxCallSeconds()).toBe(300);
    } finally {
      if (original === undefined) delete process.env.MAX_CALL_SECONDS;
      else process.env.MAX_CALL_SECONDS = original;
    }
  });

  it('falls back to the default for non-positive or non-numeric values', () => {
    const original = process.env.MAX_CALL_SECONDS;
    try {
      process.env.MAX_CALL_SECONDS = 'not-a-number';
      expect(maxCallSeconds()).toBe(600);
      process.env.MAX_CALL_SECONDS = '-5';
      expect(maxCallSeconds()).toBe(600);
      process.env.MAX_CALL_SECONDS = '0';
      expect(maxCallSeconds()).toBe(600);
    } finally {
      if (original === undefined) delete process.env.MAX_CALL_SECONDS;
      else process.env.MAX_CALL_SECONDS = original;
    }
  });
});

describe('dailyLimitMinutes', () => {
  it('defaults to 15 when DAILY_LIMIT_MINUTES is unset', () => {
    const original = process.env.DAILY_LIMIT_MINUTES;
    delete process.env.DAILY_LIMIT_MINUTES;
    try {
      expect(dailyLimitMinutes()).toBe(15);
    } finally {
      if (original !== undefined) process.env.DAILY_LIMIT_MINUTES = original;
    }
  });

  it('returns 0 when explicitly disabled', () => {
    const original = process.env.DAILY_LIMIT_MINUTES;
    process.env.DAILY_LIMIT_MINUTES = '0';
    try {
      expect(dailyLimitMinutes()).toBe(0);
    } finally {
      if (original === undefined) delete process.env.DAILY_LIMIT_MINUTES;
      else process.env.DAILY_LIMIT_MINUTES = original;
    }
  });

  it('uses the configured value', () => {
    const original = process.env.DAILY_LIMIT_MINUTES;
    process.env.DAILY_LIMIT_MINUTES = '30';
    try {
      expect(dailyLimitMinutes()).toBe(30);
    } finally {
      if (original === undefined) delete process.env.DAILY_LIMIT_MINUTES;
      else process.env.DAILY_LIMIT_MINUTES = original;
    }
  });
});

describe('todaysUsageSecs + gateForDailyLimit', () => {
  it.skipIf(!process.env.DATABASE_URL)('is 0 / ok for a user with no sessions', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    expect(await todaysUsageSecs(u[0].id)).toBe(0);
    expect(await gateForDailyLimit(u[0].id)).toBe('ok');
  });

  it.skipIf(!process.env.DATABASE_URL)("sums today's ended sessions for that user only", async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    const other = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    await db.insert(schema.sessions).values([
      { userId: u[0].id, startedAt: new Date(), endedAt: new Date(), durationSecs: 40 },
      { userId: u[0].id, startedAt: new Date(), endedAt: new Date(), durationSecs: 25 },
      // Another user's usage must not bleed into this one's total.
      { userId: other[0].id, startedAt: new Date(), endedAt: new Date(), durationSecs: 999 },
    ]);
    expect(await todaysUsageSecs(u[0].id)).toBe(65);
  });

  it.skipIf(!process.env.DATABASE_URL)('excludes sessions from earlier IST days', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await db.insert(schema.sessions).values({
      userId: u[0].id,
      startedAt: threeDaysAgo,
      endedAt: threeDaysAgo,
      durationSecs: 10_000,
    });
    expect(await todaysUsageSecs(u[0].id)).toBe(0);
  });

  it.skipIf(!process.env.DATABASE_URL)('gates once usage meets the configured daily cap', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    await db.insert(schema.sessions).values({
      userId: u[0].id,
      startedAt: new Date(),
      endedAt: new Date(),
      durationSecs: 120,
    });
    const original = process.env.DAILY_LIMIT_MINUTES;
    process.env.DAILY_LIMIT_MINUTES = '2';
    try {
      expect(await gateForDailyLimit(u[0].id)).toBe('rate_limited');
    } finally {
      if (original === undefined) delete process.env.DAILY_LIMIT_MINUTES;
      else process.env.DAILY_LIMIT_MINUTES = original;
    }
  });

  it.skipIf(!process.env.DATABASE_URL)('DAILY_LIMIT_MINUTES=0 disables the cap entirely', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    await db.insert(schema.sessions).values({
      userId: u[0].id,
      startedAt: new Date(),
      endedAt: new Date(),
      durationSecs: 100_000,
    });
    const original = process.env.DAILY_LIMIT_MINUTES;
    process.env.DAILY_LIMIT_MINUTES = '0';
    try {
      expect(await gateForDailyLimit(u[0].id)).toBe('ok');
    } finally {
      if (original === undefined) delete process.env.DAILY_LIMIT_MINUTES;
      else process.env.DAILY_LIMIT_MINUTES = original;
    }
  });
});
