import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'off'
  },
  plugins: ['typescript', 'unicorn', 'oxc'],
  options: {
    typeAware: true
  },
  rules: {
    'typescript/no-unnecessary-type-assertion': 'warn',
    'typescript/no-redundant-type-constituents': 'warn',
    'typescript/no-useless-default-assignment': 'warn',
    'no-useless-catch': 'warn',
    'no-constant-binary-expression': 'warn',
    'no-dupe-else-if': 'warn',
    'unicorn/no-useless-spread': 'warn'
  },
  ignorePatterns: [
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/scripts/**',
    '**/fixtures/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**'
  ]
});
