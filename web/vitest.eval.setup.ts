// Eval setup: load env so real provider calls (OpenAI / Sarvam) get their keys.
// Unlike vitest.setup.ts this stays node-only (no jsdom matchers) since evals
// grade model output, not the DOM.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
