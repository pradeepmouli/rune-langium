#!/usr/bin/env zx

/**
 * Rename package scope across the entire project
 * Usage: node scripts/rename-scope.mjs old-scope new-scope
 * Example: node scripts/rename-scope.mjs rune-langium myorg
 */

import { argv } from 'zx';

const oldScope = argv._[0];
const newScope = argv._[1];

if (!oldScope || !newScope) {
  console.log('Usage: node scripts/rename-scope.mjs <old-scope> <new-scope>');
  console.log('Example: node scripts/rename-scope.mjs rune-langium myorg');
  process.exit(1);
}

console.log(`🔄 Renaming package scope from @${oldScope} to @${newScope}...`);
console.log('');

// Count files that will be affected
const grepResult =
  await $`grep -r "@${oldScope}" --include="package.json" --include="*.ts" --include="*.md" . 2>/dev/null | grep -v node_modules || true`;
const count = grepResult.stdout
  .trim()
  .split('\n')
  .filter((line) => line).length;

if (count === 0) {
  console.log(`❌ No references to @${oldScope} found`);
  process.exit(1);
}

console.log(`Found ${count} references to update`);
console.log('');

// Update package.json files
await $`find . -name "package.json" -not -path "./node_modules/*" -type f -exec sed -i '' "s/@${oldScope}/@${newScope}/g" {} \\;`;
console.log('✅ Updated package.json files');

// Update TypeScript/JavaScript files
await $`find . -name "*.ts" -not -path "./node_modules/*" -not -path "./.next/*" -type f -exec sed -i '' "s/@${oldScope}/@${newScope}/g" {} \\;`;
console.log('✅ Updated TypeScript files');

// Update Markdown files
await $`find . -name "*.md" -not -path "./node_modules/*" -type f -exec sed -i '' "s/@${oldScope}/@${newScope}/g" {} \\;`;
console.log('✅ Updated documentation files');

// Rename directories if packages exist
if (await fs.pathExists('packages')) {
  const packages = await fs.readdir('packages');
  for (const pkg of packages) {
    const pkgPath = `packages/${pkg}`;
    if ((await fs.stat(pkgPath)).isDirectory()) {
      const updatedName = pkg.replace(new RegExp(`^${oldScope}-`), `${newScope}-`);
      if (pkg !== updatedName) {
        await fs.move(pkgPath, `packages/${updatedName}`);
        console.log(`✅ Renamed package: ${pkg} → ${updatedName}`);
      }
    }
  }
}

console.log('');
console.log('🎉 Package scope renamed successfully!');
console.log('');
console.log('Next steps:');
console.log('  1. Review changes: git diff');
console.log('  2. Reinstall dependencies: pnpm install');
console.log('  3. Run tests: pnpm run test');
