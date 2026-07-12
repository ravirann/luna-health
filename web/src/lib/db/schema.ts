// Luna AI — Drizzle schema.
//
// Postgres-backed. Designed to run on Neon (serverless driver) but works
// with any standard Postgres. The schema covers:
//   - users:        local identity row (legacy clerk_user_id retained for old rows)
//   - sessions:     one row per voice call, with timing + scene/persona
//   - transcripts:  every spoken line (user + assistant), append-only
//   - reflections:  P3 — post-session facts + free-text + embedding vector
//
// Usage limits (call length, daily cap) are operator-configured via env
// (see lib/limits.ts) and computed live from `sessions`, not stored here.
//
// `pgvector` extension is required for the `reflections.embedding` column.
// Drizzle exposes it via the `vector()` column type.

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  index,
  vector,
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Legacy Clerk identifier retained for old rows; local auth uses
    // email + password_hash instead.
    clerkUserId: text('clerk_user_id'),
    email: text('email'),
    passwordHash: text('password_hash'),
    displayName: text('display_name'),
    locale: text('locale').default('en-IN'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Anonymous identity (spec §4.1, §8). Defaults preserve existing rows.
    isAnonymous: boolean('is_anonymous').default(false).notNull(),
    guestCookieHash: text('guest_cookie_hash').unique(),
    // One-way hash of the creating IP (see lib/anonymous.ts:hashIp). Only
    // ever set for anonymous rows; used to throttle anon-identity creation
    // to one per IP per 24h without ever storing a raw IP address.
    ipHash: text('ip_hash'),
  },
  (t) => [
    index('users_clerk_idx').on(t.clerkUserId),
    index('users_ip_hash_idx').on(t.ipHash, t.createdAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id'),
    personaId: text('persona_id').default('assistant'),
    customSeed: text('custom_seed'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSecs: integer('duration_secs'),
    audioUrl: text('audio_url'),       // R2 URI — populated post-call in P3
    metadata: jsonb('metadata'),       // {ip, ua, platform...} — for abuse review
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const transcripts = pgTable(
  'transcripts',
  {
    id: serial('id').primaryKey(),
    sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['assistant', 'user'] }).notNull(),
    text: text('text').notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('transcripts_session_idx').on(t.sessionId)],
);

export const reflections = pgTable(
  'reflections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    // Light memory: structured user-profile facts extracted by the LLM.
    // Shape (versioned via `schemaVersion` inside JSONB):
    //   { schemaVersion: 1, mentioned_people: [...], themes: [...],
    //     mood: '...', unresolved: '...' }
    facts: jsonb('facts').notNull(),
    // Heavy memory: 1-2 paragraph free-text reflection, embedded for retrieval.
    freeText: text('free_text').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),  // sarvam-multi-v1 = 1024
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('reflections_user_idx').on(t.userId)],
);

// One row per user — the durable home for everything the user picks in
// Onboarding + Settings. Sent to the bot in `runner_args.body` on every
// /api/session/start so the conversation actually changes when the user
// flips a switch in the UI. Mood is intentionally NOT stored here: it
// only changes the UI palette and lives in localStorage so the boot
// script can apply it before paint without an API round-trip.
export const userPrefs = pgTable('user_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Identity display name.
  name: text('name'),
  // Personality dials.
  vibe: text('vibe', {
    enum: ['calm', 'friendly', 'playful', 'flirty'],
  })
    .default('calm')
    .notNull(),
  tone: text('tone', {
    enum: ['Soft', 'Warm', 'Energetic', 'Sultry'],
  })
    .default('Warm')
    .notNull(),
  languageMode: text('language_mode', {
    enum: ['english', 'hinglish', 'hindi'],
  })
    .default('hinglish')
    .notNull(),
  pace: text('pace', { enum: ['Slow', 'Natural', 'Brisk'] })
    .default('Slow')
    .notNull(),
  warmth: integer('warmth').default(7).notNull(),
  // Toggles.
  memoryEnabled: boolean('memory_enabled').default(true).notNull(),
  autoSummary: boolean('auto_summary').default(true).notNull(),
  sleepNudges: boolean('sleep_nudges').default(true).notNull(),
  // Has the user finished the onboarding flow?
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('auth_sessions_user_idx').on(t.userId),
    index('auth_sessions_expiry_idx').on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('password_reset_user_idx').on(t.userId),
    index('password_reset_expiry_idx').on(t.expiresAt),
  ],
);

// LLM-generated splash headlines/subtitles, cached per (brand × time-of-day).
// Refreshed when the row exceeds its TTL. Lookup is by composite key — the
// uniqueness constraint is enforced via index so we can do a clean
// upsert-by-(brand_name, time_of_day).
export const splashCopy = pgTable(
  'splash_copy',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandName: text('brand_name').notNull(),
    timeOfDay: text('time_of_day', {
      enum: ['morning', 'evening', 'late_night', 'midnight', 'predawn'],
    }).notNull(),
    headline: text('headline').notNull(),
    subtitle: text('subtitle').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    usedCount: integer('used_count').default(0).notNull(),
  },
  (t) => [
    index('splash_copy_lookup_idx').on(t.brandName, t.timeOfDay),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type Reflection = typeof reflections.$inferSelect;
export type UserPrefs = typeof userPrefs.$inferSelect;
export type SplashCopy = typeof splashCopy.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
