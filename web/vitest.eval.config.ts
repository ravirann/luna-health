// Separate config for evals. Evals call REAL models (slow, cost tokens), so
// they are NOT part of `npm test` — they only run via `npm run eval`.
//
// The default test config's glob is `**/*.{test,spec}.*`, which never matches
// our `*.eval.ts` files, so the two suites stay cleanly separated.
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.eval.setup.ts'],
    include: ['evals/**/*.eval.ts'],
    // LLM calls (esp. the Sarvam reasoning model over a dataset) are slow even
    // run concurrently; give generous headroom.
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
