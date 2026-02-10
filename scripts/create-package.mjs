#!/usr/bin/env zx

/**
 * Create a new package scaffold in the monorepo
 * Usage: node scripts/create-package.mjs <package-name>
 * Example: node scripts/create-package.mjs my-feature
 */

import { argv } from 'zx';

const packageName = argv._[0];
const scope = argv.scope || 'rune-langium';

if (!packageName) {
  console.log('Usage: node scripts/create-package.mjs <package-name>');
  console.log('Example: node scripts/create-package.mjs my-feature');
  process.exit(1);
}

const packageDir = `packages/${packageName}`;

// Check if directory already exists
if (await fs.pathExists(packageDir)) {
  console.log(`❌ Package directory already exists: ${packageDir}`);
  process.exit(1);
}

console.log(`📦 Creating new package: ${packageName}`);
console.log('');

// Create directory structure
await fs.ensureDir(`${packageDir}/src`);
await fs.ensureDir(`${packageDir}/dist`);
console.log('✅ Created directory structure');

// Create package.json
const packageJson = {
  name: `@${scope}/${packageName}`,
  version: '0.1.0',
  description: 'Package description',
  type: 'module',
  main: 'dist/index.js',
  types: 'dist/index.d.ts',
  exports: {
    '.': {
      types: './dist/index.d.ts',
      default: './dist/index.js'
    }
  },
  scripts: {
    build: 'tsgo -p tsconfig.json',
    clean: 'rm -rf dist',
    dev: 'tsgo -p tsconfig.json --watch',
    'type-check': 'tsgo -p tsconfig.json --noEmit',
    test: 'vitest run',
    'test:watch': 'vitest'
  },
  devDependencies: {
    '@types/node': '^25.0.3',
    '@vitest/ui': '^4.0.16',
    typescript: '^5.9.3',
    vitest: '^4.0.16'
  },
  license: 'MIT'
};

await fs.writeJSON(`${packageDir}/package.json`, packageJson, { spaces: 2 });
console.log('✅ Created package.json');

// Create tsconfig.json
const tsConfig = {
  extends: '../../tsconfig.json',
  compilerOptions: {
    outDir: 'dist',
    rootDir: 'src'
  },
  include: ['src'],
  references: []
};

await fs.writeJSON(`${packageDir}/tsconfig.json`, tsConfig, { spaces: 2 });
console.log('✅ Created tsconfig.json');

// Create src/index.ts
const indexTs = `/**
 * ${packageName} - Main entry point
 * @packageDocumentation
 */

/**
 * Example function
 * @param message - Message to display
 * @returns Formatted message
 */
export function greet(message: string): string {
  return \`Hello, \${message}!\`;
}
`;

await fs.writeFile(`${packageDir}/src/index.ts`, indexTs);
console.log('✅ Created src/index.ts');

// Create test file
const testTs = `import { describe, it, expect } from 'vitest';
import { greet } from './index';

describe('${packageName}', () => {
  it('should greet with message', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
});
`;

await fs.writeFile(`${packageDir}/src/index.test.ts`, testTs);
console.log('✅ Created src/index.test.ts');

// Create README.md
const readme = `# @${scope}/${packageName}

Package description.

## Installation

\`\`\`bash
pnpm add @${scope}/${packageName}
\`\`\`

## Usage

\`\`\`typescript
import { greet } from '@${scope}/${packageName}';

console.log(greet('World'));  // 'Hello, World!'
\`\`\`

## API

### \`greet(message: string): string\`

Returns a greeting message.

## Testing

\`\`\`bash
pnpm --filter @${scope}/${packageName} test
\`\`\`
`;

await fs.writeFile(`${packageDir}/README.md`, readme);
console.log('✅ Created README.md');

console.log('');
console.log('🎉 Package created successfully!');
console.log('');
console.log('Next steps:');
console.log(`  1. Update package description in ${packageDir}/package.json`);
console.log(`  2. Implement your functionality in ${packageDir}/src/index.ts`);
console.log(`  3. Write tests in ${packageDir}/src/index.test.ts`);
console.log(`  4. Update ${packageDir}/README.md`);
console.log('');
console.log('Build the package:');
console.log(`  pnpm --filter @${scope}/${packageName} build`);
console.log('');
console.log('Run tests:');
console.log(`  pnpm --filter @${scope}/${packageName} test`);
