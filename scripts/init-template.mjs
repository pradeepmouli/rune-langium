#!/usr/bin/env zx

/**
 * Template initialization script
 * This script helps initialize a new project from this template-ts
 */

const stdinIsTty = Boolean(process.stdin.isTTY);
const stdinLines = stdinIsTty ? [] : fs.readFileSync(0, 'utf8').split(/\r?\n/);

function readQueuedInput(defaultValue = '') {
  if (stdinIsTty) {
    return null;
  }

  const next = stdinLines.shift();
  if (next === undefined || next === '') {
    return defaultValue;
  }

  return next;
}

async function askWithDefault(prompt, defaultValue = '') {
  const queued = readQueuedInput(defaultValue);
  if (queued !== null) {
    return queued;
  }

  const answer = await question(prompt);
  return answer || defaultValue;
}

async function askRequired(prompt) {
  const queued = readQueuedInput('');
  if (queued !== null) {
    return queued;
  }

  return question(prompt);
}

// Helper function to validate input
function validateInput(input) {
  return input && input.trim().length > 0;
}

// Main initialization
console.log(chalk.blue('🚀 Initializing project from template-ts...'));
console.log('');

// Try to detect defaults from environment
const defaultProjectName = path.basename(process.cwd());
let defaultAuthorName = '';
let defaultAuthorEmail = '';
let defaultRepoUrl = '';

try {
  defaultAuthorName = (await $`git config user.name`).stdout.trim();
} catch {}
try {
  defaultAuthorEmail = (await $`git config user.email`).stdout.trim();
} catch {}
try {
  defaultRepoUrl = (await $`git config --get remote.origin.url`).stdout.trim();
} catch {}

// Default package scope to project name, fallback to rune-langium
const defaultPackageScope = defaultProjectName || 'rune-langium';

// Get project details with intelligent defaults
const projectName = await askWithDefault(
  `📝 Enter project name [default: ${defaultProjectName}]: `,
  defaultProjectName
);

if (!validateInput(projectName)) {
  console.log(chalk.red('❌ Project name is required'));
  process.exit(1);
}

const authorName = await askWithDefault(
  `👤 Enter author name [default: ${defaultAuthorName}]: `,
  defaultAuthorName
);

if (!validateInput(authorName)) {
  console.log(chalk.red('❌ Author name is required'));
  process.exit(1);
}

const authorEmail = await askWithDefault(
  `📧 Enter author email [default: ${defaultAuthorEmail}]: `,
  defaultAuthorEmail
);

const projectDescription = await askRequired('📚 Enter project description: ');

const repoUrl = await askWithDefault(
  `🌐 Enter repository URL [default: ${defaultRepoUrl}]: `,
  defaultRepoUrl
);

console.log('');
console.log(chalk.blue('Configuration Summary:'));
console.log(`  Name: ${projectName}`);
console.log(`  Author: ${authorName} ${authorEmail ? `<${authorEmail}>` : ''}`);
console.log(`  Description: ${projectDescription}`);
console.log(`  Repository: ${repoUrl || 'Not set'}`);
console.log('');

const continueAnswer = await askWithDefault('Continue with these settings? (y/n) ', 'y');
if (continueAnswer.toLowerCase() !== 'y') {
  console.log(chalk.red('❌ Initialization cancelled'));
  process.exit(1);
}

// Get package scope
console.log('');
const packageScope = await askWithDefault(
  `📦 Enter package scope (e.g., company, org) [default: ${defaultPackageScope}]: `,
  defaultPackageScope
);
console.log(chalk.blue(`Using package scope: ${packageScope}`));

// Discover recommended skills
console.log('');
console.log(chalk.blue('Discovering recommended skills for your project...'));
if (await fs.pathExists('scripts/discover-skills.mjs')) {
  try {
    await $`npm zx scripts/discover-skills.mjs ${projectName} ${projectDescription}`;
    console.log('');
  } catch {}
}

// Update package.json
console.log('');
console.log(chalk.blue('Updating configuration files...'));

const authorStr = authorEmail ? `${authorName} <${authorEmail}>` : authorName;

const packageJson = {
  name: projectName,
  version: '0.1.0',
  private: true,
  description: projectDescription,
  type: 'module',
  author: authorStr,
  license: 'MIT',
  ...(repoUrl && {
    repository: {
      type: 'git',
      url: repoUrl
    }
  }),
  workspaces: ['packages/*'],
  scripts: {
    build: 'pnpm -r run build',
    clean: 'pnpm -r run clean && rm -rf node_modules/.cache',
    'clean:all': 'pnpm -r exec rm -rf dist node_modules && rm -rf node_modules',
    dev: 'pnpm -r --parallel run dev',
    format: 'oxfmt .',
    'format:check': 'oxfmt --check .',
    fresh: 'pnpm clean:all && pnpm install',
    lint: 'oxlint .',
    'lint:fix': 'oxlint --fix .',
    test: 'vitest run',
    'test:coverage': 'vitest run --coverage',
    'test:watch': 'vitest',
    'type-check': 'pnpm -r run type-check'
  },
  devDependencies: {
    '@changesets/cli': '^2.29.8',
    '@types/node': '^25.0.3',
    '@vitest/coverage-v8': '^4.0.16',
    '@vitest/ui': '^4.0.16',
    'lint-staged': '^16.2.7',
    oxfmt: '^0.21.0',
    oxlint: '^1.36.0',
    'simple-git-hooks': '^2.13.1',
    typescript: '^5.9.3',
    vitest: '^4.0.16'
  },
  engines: {
    node: '>=20.0.0',
    pnpm: '>=10.0.0'
  },
  packageManager: 'pnpm@10.27.0'
};

await fs.writeJSON('package.json', packageJson, { spaces: 2 });
console.log(chalk.green('✅ Updated package.json'));

// Update README.md
const readme = `# ${projectName}

${projectDescription}

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0

### Installation

\`\`\`bash
git clone ${repoUrl}
cd ${projectName}
pnpm install
\`\`\`

### Development

\`\`\`bash
# Start development
pnpm run dev

# Run tests
pnpm run test

# Lint and format
pnpm run lint
pnpm run format
\`\`\`

## Project Structure

This project uses pnpm workspaces for managing multiple packages:

\`\`\`
${projectName}/
├── packages/
│   └── [your packages here]
├── docs/
├── .github/workflows/
├── package.json
└── README.md
\`\`\`

## Creating Your First Package

See [docs/WORKSPACE.md](docs/WORKSPACE.md) for detailed instructions on adding packages.

## Documentation

- [Workspace Guide](docs/WORKSPACE.md) - Managing packages
- [Development Workflow](docs/DEVELOPMENT.md) - Development process
- [Testing Guide](docs/TESTING.md) - Testing setup
- [Examples](docs/EXAMPLES.md) - Usage examples

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE) for details

---

**Author**: ${authorName}
**Created**: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
`;

await fs.writeFile('README.md', readme);
console.log(chalk.green('✅ Updated README.md'));

// Create AGENTS.md
const agentsContent = `# Agent Guide

This repository is designed for multi-agent collaboration (Copilot, Claude, Gemini, Codex). Use this guide to stay consistent when automating tasks.

## Project Metadata
- Name: ${projectName}
- Language: TypeScript (pnpm workspaces)
- Tooling: pnpm, oxlint, oxfmt, Vitest, simple-git-hooks, lint-staged

## Ground Rules
- Prefer non-destructive changes; never reset user work.
- Follow conventional commits.
- Keep formatting consistent with .editorconfig and .oxfmtrc.json.
- Run pnpm run lint and pnpm test after code changes when practical.
- Keep docs current when changing scripts or workflows.

## Workflow Checklist
1) Install deps: pnpm install
2) Lint: pnpm run lint
3) Test: pnpm test
4) Format: pnpm run format (or pnpm run format:check)
5) Type-check (if added): pnpm run type-check

## Coding Standards
- 2-space indentation; spaces (no tabs).
- Semicolons required; single quotes; no trailing commas.
- Keep public API docs concise; avoid documenting internals.
- Use vitest for tests; add coverage for public APIs.

## Agent-Specific Notes
- Coordinate with other agents by updating docs (README, TEMPLATE_INITIALIZATION.md) when workflows change.
- When modifying scripts, explain any new prompts or defaults in TEMPLATE_INITIALIZATION.md.
- If adding hooks, prefer simple-git-hooks and lint-staged already in package.json.

## Deliverables Expectation
- Summaries should include what changed, where, and how to verify.
- For automation runs, report commands executed and their results.
`;

await fs.writeFile('AGENTS.md', agentsContent);
console.log(chalk.green('✅ Created AGENTS.md'));

// Clean up template files
console.log('');
console.log(chalk.blue('Cleaning up template files...'));

const cleanupFiles = [
  'REVIEW_PROPOSALS.md',
  'COVERAGE_ANALYSIS.md',
  'IMPLEMENTATION.md',
  'COMPLETION_CHECKLIST.md'
];

for (const file of cleanupFiles) {
  if (await fs.pathExists(file)) {
    await fs.remove(file);
  }
}

// Remove example packages
const removeExamplePackages = await askWithDefault(
  'Remove example packages (core, utils, test-utils)? (y/n) ',
  'y'
);
if (removeExamplePackages.toLowerCase() === 'y') {
  await fs.remove('packages/core').catch(() => {});
  await fs.remove('packages/utils').catch(() => {});
  await fs.remove('packages/test-utils').catch(() => {});
  await fs.ensureDir('packages');
  console.log(chalk.green('✅ Removed example packages'));
}

// Remove example tests
const removeExampleTests = await askWithDefault('Remove example test files? (y/n) ', 'y');
if (removeExampleTests.toLowerCase() === 'y') {
  await fs.remove('src/index.test.ts').catch(() => {});
  await fs.remove('src/index.ts').catch(() => {});
  await fs.remove('integration.test.ts').catch(() => {});
  await fs.ensureDir('src');

  const srcIndex = `/**
 * Main entry point for your application
 */

export function hello(): string {
  return 'Hello, World!';
}
`;
  await fs.writeFile('src/index.ts', srcIndex);
  console.log(chalk.green('✅ Removed example test files'));
}

// Remove example E2E tests
const removeE2E = await askWithDefault('Remove example E2E tests? (y/n) ', 'y');
if (removeE2E.toLowerCase() === 'y') {
  await fs.remove('e2e').catch(() => {});
  console.log(chalk.green('✅ Removed example E2E tests'));
}

// Replace TEMPLATE_INITIALIZATION guide
const replaceTemplateDoc = await askWithDefault(
  'Replace scripts/TEMPLATE_INITIALIZATION.md with project-specific details? (y/n) ',
  'y'
);
if (replaceTemplateDoc.toLowerCase() === 'y') {
  const templateInitDoc = `# Project Initialization Guide

This guide describes how to initialize and maintain this repository.

## Quick Start

1) Clone the repo
2) Install dependencies: pnpm install
3) Initialize git (if not already): git init && git add . && git commit -m "chore: initial project setup"

## Local Development

- Run dev: pnpm run dev
- Test: pnpm test
- Lint: pnpm run lint
- Format: pnpm run format

## Notes

- Update this guide with project-specific workflows, environments, and deployment steps.
`;
  await fs.writeFile('scripts/TEMPLATE_INITIALIZATION.md', templateInitDoc);
  console.log(chalk.green('✅ Replaced scripts/TEMPLATE_INITIALIZATION.md'));
} else {
  console.log(chalk.yellow('⚠️  Left scripts/TEMPLATE_INITIALIZATION.md unchanged'));
}

console.log(chalk.green('✅ Cleaned up template files'));

// Initialize git
console.log('');
console.log(chalk.blue('Setting up git...'));

if (await fs.pathExists('.git')) {
  console.log(chalk.yellow('⚠️  Git repository already initialized'));
} else {
  await $`git init`;
  await $`git add .`;
  await $`git commit -m "chore: initialize project from template-ts"`;
  console.log(chalk.green('✅ Git repository initialized'));
}

// Install dependencies
console.log('');
console.log(chalk.blue('Installing dependencies...'));

try {
  await $`which pnpm`;
} catch {
  console.log(chalk.yellow('⚠️  pnpm not found, installing...'));
  await $`npm install -g pnpm`;
}

await $`pnpm install`;

// Install specify and specify-extend for Copilot
console.log('');
console.log(chalk.blue('Installing specify tools for GitHub Copilot...'));

try {
  await $`which uvx`;

  console.log(chalk.blue('Installing specify...'));
  const specifyInitArgs = stdinIsTty ? [] : ['--force', '--ignore-agent-tools'];
  try {
    await $`specify init . --ai copilot ${specifyInitArgs}`;
    console.log(chalk.green('✅ Specify installed with Copilot agent'));
  } catch {
    console.log(
      chalk.yellow(
        '⚠️  Failed to install specify. Try: specify init . --ai copilot --force --ignore-agent-tools'
      )
    );
  }

  console.log(chalk.blue('Installing specify-extend...'));
  try {
    await $`uvx specify-extend --all --agent copilot`;
    console.log(chalk.green('✅ Specify-extend installed with Copilot agent'));
  } catch {
    console.log(
      chalk.yellow(
        '⚠️  Failed to install specify-extend, you can install it manually with: uvx specify-extend --all --agent copilot'
      )
    );
  }
} catch {
  console.log(chalk.yellow('⚠️  uvx not found. To install specify tools manually, run:'));
  console.log('  specify init . --ai copilot');
  console.log('  uvx specify-extend --all --agent copilot');
  console.log('');
  console.log('You can install uv from: https://github.com/astral-sh/uv');
}

console.log('');
console.log(chalk.green('✅ Project initialization complete!'));
console.log('');

console.log(chalk.blue('Next steps:'));
console.log('  1. Customize your project in README.md');
console.log('  2. Create your first package: mkdir packages/my-package');
console.log('  3. See docs/WORKSPACE.md for package structure');
console.log('  4. Start developing: pnpm run dev');
console.log('  5. Run tests: pnpm run test');
console.log('');
console.log(chalk.blue('Useful commands:'));
console.log('  pnpm run lint     - Check code quality');
console.log('  pnpm run format   - Format all code');
console.log('  pnpm run test     - Run tests');
console.log('  pnpm run dev      - Start development');
console.log('');
console.log(chalk.blue('Specify Tools (for Copilot):'));
console.log('  specify init . --ai copilot        - Initialize specify');
console.log('  specify init . --ai copilot --force --ignore-agent-tools - Non-interactive');
console.log('  uvx specify-extend --all --agent copilot - Install extensions');
console.log('');
console.log(chalk.blue('Documentation:'));
console.log('  📖 docs/WORKSPACE.md - Workspace management');
console.log('  📖 docs/DEVELOPMENT.md - Development workflow');
console.log('  📖 docs/TESTING.md - Testing guide');
console.log('  📖 CONTRIBUTING.md - Contributing guidelines');
console.log('');
console.log(chalk.green('Happy coding! 🚀'));
