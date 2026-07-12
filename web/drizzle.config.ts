// drizzle-kit config — used only by the migration CLI.
// Run: `npm run db:generate` (after schema changes) and `npm run db:push`
// (to apply locally) or `npm run db:migrate` (production migrations).

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
} satisfies Config;
