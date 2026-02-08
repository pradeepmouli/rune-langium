#!/usr/bin/env zx

/**
 * Verify template setup and dependencies
 * Checks that all required tools and configurations are in place
 */

console.log('🔍 Verifying template setup...');
console.log('');

let errors = 0;
let warnings = 0;

// Check Node.js
process.stdout.write('Checking Node.js version... ');
try {
  const nodeVersion = (await $`node -v`).stdout.trim().replace('v', '');
  const major = parseInt(nodeVersion.split('.')[0]);
  if (major >= 20) {
    console.log(`✅ ${nodeVersion}`);
  } else {
    console.log(`⚠️  ${nodeVersion} (recommended: >=20.0.0)`);
    warnings++;
  }
} catch {
  console.log('❌ Not installed');
  errors++;
}

// Check pnpm
process.stdout.write('Checking pnpm version... ');
try {
  const pnpmVersion = (await $`pnpm -v`).stdout.trim();
  console.log(`✅ ${pnpmVersion}`);
} catch {
  console.log('❌ Not installed');
  errors++;
}

// Check TypeScript
process.stdout.write('Checking TypeScript... ');
if (await fs.pathExists('node_modules/typescript/package.json')) {
  const tsPkg = await fs.readJSON('node_modules/typescript/package.json');
  console.log(`✅ ${tsPkg.version}`);
} else {
  console.log('❌ Not installed');
  errors++;
}

// Check Vitest
process.stdout.write('Checking Vitest... ');
if (await fs.pathExists('node_modules/vitest/package.json')) {
  const vtPkg = await fs.readJSON('node_modules/vitest/package.json');
  console.log(`✅ ${vtPkg.version}`);
} else {
  console.log('❌ Not installed');
  errors++;
}

// Check oxlint
process.stdout.write('Checking oxlint... ');
try {
  const oxlintVersion = (await $`oxlint --version 2>&1`).stdout.trim().split('\n')[0];
  console.log(`✅ ${oxlintVersion}`);
} catch {
  console.log('❌ Not installed');
  errors++;
}

// Check oxfmt
process.stdout.write('Checking oxfmt... ');
try {
  await $`which oxfmt`;
  console.log('✅ Installed');
} catch {
  console.log('❌ Not installed');
  errors++;
}

console.log('');
console.log('📁 Checking project structure...');

// Check key files
const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'pnpm-workspace.yaml',
  'vitest.config.ts',
  'oxlintrc.json',
  '.editorconfig'
];

for (const file of requiredFiles) {
  if (await fs.pathExists(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ Missing: ${file}`);
    errors++;
  }
}

console.log('');
console.log('📚 Checking documentation...');

const docFiles = [
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'docs/WORKSPACE.md',
  'docs/TESTING.md',
  'docs/DEVELOPMENT.md'
];

for (const file of docFiles) {
  if (await fs.pathExists(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`⚠️  Missing: ${file}`);
    warnings++;
  }
}

console.log('');
console.log('🔧 Checking scripts...');

const scripts = [
  'scripts/init-template.mjs',
  'scripts/create-package.mjs',
  'scripts/rename-scope.mjs'
];

for (const script of scripts) {
  if (await fs.pathExists(script)) {
    console.log(`✅ ${script}`);
  } else {
    console.log(`⚠️  Missing: ${script}`);
    warnings++;
  }
}

console.log('');
console.log('📊 Summary:');
if (errors > 0) {
  console.log(`  ❌ Errors: ${errors}`);
}
if (warnings > 0) {
  console.log(`  ⚠️  Warnings: ${warnings}`);
}

console.log('');

if (errors === 0) {
  console.log('🎉 All required setup checks passed!');
  console.log('');
  console.log('You can now:');
  console.log('  • Run tests: pnpm test');
  console.log('  • Start development: pnpm run dev');
  console.log('  • Create new packages: node scripts/create-package.mjs my-package');
  process.exit(0);
} else {
  console.log('❌ Setup incomplete. Please install missing dependencies:');
  console.log('  pnpm install');
  process.exit(1);
}
