import { defineConfig } from 'vitest/config';
import path             from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include:     ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude:     ['node_modules', 'e2e', '.next'],
    // Coverage gate (Template v2) — opt-in: `npm run test:coverage`.
    // Requires devDep `@vitest/coverage-v8`. Raise thresholds as the new app
    // gains tests; 60% is the platform floor (C-41 Phase-0 gate).
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'json-summary'],
      thresholds: { lines: 60, functions: 60, statements: 60, branches: 50 },
      exclude:   ['**/*.test.*', '**/*.spec.*', 'src/lib/i18n/**', 'e2e/**'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
