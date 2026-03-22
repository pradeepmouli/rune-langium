import { defineConfig } from 'vitest/config';

// Root vitest config for core packages only.
// Note: visual-editor and apps have their own vitest.config.ts with browser environment.
// Run `pnpm test` at the root to execute all tests across all packages via `pnpm -r run test`.

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'packages/visual-editor/**',
      'apps/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'packages/cli/src/**/*.ts',
        'packages/core/src/**/*.ts',
        'packages/lsp-server/src/**/*.ts'
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/test/**', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        lines: 30,
        functions: 20,
        branches: 30,
        statements: 30
      }
    },
    typecheck: {
      enabled: false // Run type checking separately with tsc
    }
  }
});
