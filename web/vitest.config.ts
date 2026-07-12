import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // DB tests share a real Neon instance; run files sequentially so
    // afterEach cleanup in one file doesn't race with inserts in another.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
