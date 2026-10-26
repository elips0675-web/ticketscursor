import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    globalSetup: ['./vitest.global-setup.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/prisma/**', 'src/__tests__/**'],
      thresholds: {
        statements: 80,
        branches: 74,
        functions: 81,
        lines: 81,
      },
    },
  },
})
