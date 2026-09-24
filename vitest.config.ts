import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  include: ['tests/unit/**/*.test.ts'],
  coverage: {
    provider: 'v8',
    include: ['src/arrows.ts', 'src/game.ts', 'src/share.ts', 'src/voices.ts', 'src/engine/search.ts'],
    reporter: ['text', 'json-summary'],
    thresholds: { statements: 94, branches: 90, functions: 97, lines: 98 },
  },
} });
