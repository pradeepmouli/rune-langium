import { defineConfig } from 'oxlint';

export default defineConfig({
  rules: {
    'typescript/no-explicit-any': 'warn',
    'no-unused-vars': 'warn',
    'typescript/consistent-type-imports': 'warn',
    'import/no-duplicates': 'warn',
    'unicorn/filename-case': 'off'
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '*.config.ts',
    '*.config.js',
    '**/test/fixtures/**',
    '**/*.expected.ts',
    '**/*.expected.zod.ts',
    '**/expected.ts',
    '**/expected.zod.ts',
    '.agents/**',
    '.github/skills/**',
    'scratch/**',
    'specs/**',
    'rule-tests/**',
    'rules/**'
  ],
  plugins: ['unicorn', 'typescript', 'oxc', 'import']
});
