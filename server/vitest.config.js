import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/prisma/**', 'src/__tests__/**'],
      thresholds: {
        statements: 37,
        branches: 29,
        functions: 36,
        lines: 38,
      },
    },
  },
})
