import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each CLI test spawns a node process; allow headroom on slow machines.
    testTimeout: 30000,
  },
});
