import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'simulator/src/**/*.test.ts', 'api/src/**/*.test.ts', 'web/src/**/*.test.ts'],
    environment: 'node',
  },
});
