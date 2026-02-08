#!/usr/bin/env zx

/**
 * Skills discovery script
 * Analyzes project context to suggest relevant skills to include
 * Skills are based on the skill repository at https://skills.sh/
 */

import { argv } from 'zx';

const projectName = argv._[0];
const projectDescription = argv._[1];
const projectType = argv._[2] || '';

if (!projectName || !projectDescription) {
  console.log(
    'Usage: node scripts/discover-skills.mjs <project_name> <project_description> [project_type]'
  );
  console.log('');
  console.log('Example:');
  console.log(
    '  node scripts/discover-skills.mjs "my-api" "REST API for user management" "backend"'
  );
  process.exit(1);
}

// Available skills in .agent/skills/
const AVAILABLE_SKILLS = [
  'changelog-automation',
  'crafting-effective-readmes',
  'dependency-updater',
  'dependency-upgrade',
  'design-system-patterns',
  'frontend-design',
  'game-changing-features',
  'github-actions-templates',
  'modern-javascript-patterns',
  'monorepo-management',
  'protocol-reverse-engineering',
  'responsive-design',
  'skill-creator',
  'turborepo-caching',
  'typescript-advanced-types',
  'visual-design-foundations'
];

// Map keywords to skills
const SKILL_KEYWORDS = {
  'changelog-automation': /release|changelog|version|publish|npm/i,
  'crafting-effective-readmes': /documentation|readme|docs|library|package/i,
  'dependency-updater': /dependencies|deps|packages|update|upgrade/i,
  'dependency-upgrade': /upgrade|migration|breaking|major/i,
  'design-system-patterns': /design system|component library|tokens|theme|ui kit/i,
  'frontend-design': /frontend|ui|web|interface|website|landing|dashboard/i,
  'game-changing-features': /product|feature|strategy|roadmap|innovation/i,
  'github-actions-templates': /ci|cd|pipeline|workflow|actions|automation|deployment/i,
  'modern-javascript-patterns': /javascript|js|es6|async|promise|functional/i,
  'monorepo-management': /monorepo|workspace|multi-package|lerna|nx/i,
  'protocol-reverse-engineering': /protocol|network|packet|reverse|dissect/i,
  'responsive-design': /responsive|mobile|tablet|adaptive|breakpoint/i,
  'skill-creator': /skill|extension|plugin|custom/i,
  'turborepo-caching': /turborepo|build cache|distributed|performance/i,
  'typescript-advanced-types': /typescript|types|generic|utility|conditional/i,
  'visual-design-foundations': /typography|color|spacing|visual|design|aesthetic/i
};

// Convert description and type to lowercase for matching
const searchText = `${projectName} ${projectDescription} ${projectType}`.toLowerCase();

// Analyze and recommend skills
const recommendedSkills = [];

console.log(chalk.blue('ℹ️  Analyzing project context...'));
console.log('');

for (const skill of AVAILABLE_SKILLS) {
  const keywords = SKILL_KEYWORDS[skill];
  if (keywords && keywords.test(searchText)) {
    recommendedSkills.push(skill);
  }
}

// Always recommend these core skills for TypeScript projects
const coreSkills = ['typescript-advanced-types', 'github-actions-templates', 'dependency-updater'];

for (const skill of coreSkills) {
  if (!recommendedSkills.includes(skill)) {
    recommendedSkills.push(skill);
  }
}

// Output recommended skills
if (recommendedSkills.length > 0) {
  console.log(chalk.green('✅ Recommended skills for this project:'));
  console.log('');

  for (const skill of recommendedSkills) {
    console.log(`  • ${skill}`);
  }

  console.log('');
  console.log('These skills will be available in:');
  console.log('  - .github/skills/ (for GitHub Copilot)');
  console.log('  - .claude/skills/ (for Claude)');
  console.log('  - .codex/skills/ (for Codex)');
  console.log('  - .gemini/skills/ (for Gemini)');
} else {
  console.log(chalk.blue('ℹ️  No specific skills recommended. Using default skill set.'));
}

// Export as comma-separated list for use in other scripts
console.log('');
console.log(`RECOMMENDED_SKILLS=${recommendedSkills.join(' ')}`);
