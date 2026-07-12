// Load .env.local so DB-touching tests can connect to the dev Postgres.
// We deliberately do NOT mock the DB (CLAUDE.md: "Don't mock the database
// in tests"). Tests that require DB will gate on DATABASE_URL.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

// Extend vitest expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, toBeVisible, etc.)
import '@testing-library/jest-dom/vitest';
