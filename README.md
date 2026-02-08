# TypeScript Monorepo Template

> **🎯 This is a template repository.** To start using it for your project, run the initialization script to customize all files with your project information. See [Quick Start](#quick-start) below.

<!-- TEMPLATE: Update badges with your repository URL -->
[![CI](https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-8.15.0-yellow)](package.json)

<!-- TEMPLATE: Replace this description with your project's description -->
A modern, enterprise-ready **TypeScript monorepo template** with best practices, comprehensive tooling, and multi-package support.

Perfect for starting scalable projects with:
- **Multiple interconnected packages**
- **Shared utilities and components**
- **Monorepo best practices**
- **Enterprise-grade setup**

## Features

### 🛠 Technology Stack

- **TypeScript 5.9.3** - Strict type checking, ES2022 target
- **pnpm 8.15.0** - Fast, efficient package manager with workspaces
- **Vitest 4.0.16** - Lightning-fast unit/integration testing
- **oxlint 1.36.0** - Ultra-fast Rust-based linting (10-20x faster)
- **oxfmt 0.21.0** - Ultra-fast Rust-based formatting
- **Playwright** - E2E testing across browsers
- **GitHub Actions** - Automated CI/CD pipeline
- **Changesets** - Monorepo-friendly versioning and publishing
- **simple-git-hooks + lint-staged** - Git hooks for code quality
- **Renovate** - Intelligent dependency updates

### ✨ Included Packages

<!-- TEMPLATE: Update with your actual packages or remove example packages -->
- **@company/core** - Core utilities (validation, API helpers, async utilities)
- **@company/utils** - String and array manipulation utilities
- **@company/test-utils** - Shared testing utilities and fixtures

### 🤖 Multi-Agent Support

This template is designed for **multi-agent collaboration** with:
- **GitHub Copilot** - With specify and specify-extend integration
- **Claude** - AI-powered code assistance
- **Gemini** - Google's AI model
- **Codex** - OpenAI's code model

Each agent has access to specialized skills in `.copilot/`, `.claude/`, `.codex/`, and `.gemini/` directories, including:
- Frontend design patterns
- GitHub Actions templates
- TypeScript advanced types
- Dependency management
- And many more...

### 📚 Documentation

- [Quick Start](#quick-start)
- [Workspace Guide](docs/WORKSPACE.md) - Managing packages in the monorepo
- [Development Workflow](docs/DEVELOPMENT.md) - Development process and conventions
- [Testing Guide](docs/TESTING.md) - Unit, integration, and E2E testing
- [Examples](docs/EXAMPLES.md) - Real-world usage examples
- [Architecture Decisions](docs/adr/) - ADRs for key technology choices

### 🎯 Key Features

- ✅ **Monorepo setup** with pnpm workspaces
- ✅ **Workspace protocol** for seamless package references
- ✅ **Comprehensive testing** - unit, integration, and E2E
- ✅ **Performance benchmarking** built-in
- ✅ **Type-safe** across all packages
- ✅ **Pre-commit hooks** with simple-git-hooks for code quality
- ✅ **Automated CI/CD** with GitHub Actions
- ✅ **Intelligent dependency updates** with Renovate
- ✅ **Architecture Documentation** with ADRs
- ✅ **Multi-browser E2E testing** with Playwright
- ✅ **Bundle size tracking** with size-limit
- ✅ **Code coverage** reporting with Vitest

## Quick Start

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd template-ts

# Install dependencies
pnpm install

# Initialize git hooks
pnpm prepare
```

### Initialize as Template

When using this repository as a template for a new project:

```bash
# Run the interactive initialization script with intelligent defaults
node scripts/init-template.mjs
```

This will:
- Automatically detect defaults from git config and directory name
- Prompt you for project details with intelligent suggestions
- Discover and recommend relevant skills based on your project description
- Install specify and specify-extend for GitHub Copilot
- Set up the project structure and dependencies

See [scripts/TEMPLATE_INITIALIZATION.md](scripts/TEMPLATE_INITIALIZATION.md) for detailed instructions.

### First Commands

```bash
# Start development (watch mode for all packages)
pnpm run dev

# Run all tests
pnpm run test

# Type check all packages
pnpm run type-check

# Lint and format code
pnpm run lint
pnpm run format

# Build all packages
pnpm run build
```

### Creating a New Package

See [Workspace Guide](docs/WORKSPACE.md#adding-new-packages) for detailed instructions.

## Usage

### Using Packages from the Monorepo

```typescript
// Use workspace protocol for local development
import { isValidEmail, delay } from '@company/core';
import { capitalize, unique } from '@company/utils';
import { createMockUser } from '@company/test-utils';

const email = 'user@example.com';
if (isValidEmail(email)) {
  await delay(1000);
  console.log(capitalize('hello'));
}
```

### Cross-Package Testing

```typescript
// integration.test.ts - Test interactions between packages
import { isValidEmail } from '@company/core';
import { capitalize } from '@company/utils';

it('should validate and process email', () => {
  const email = 'john@example.com';
  if (isValidEmail(email)) {
    const name = capitalize('john');
    expect(name).toBe('John');
  }
});
```

## Project Structure

```
template-ts/
├── packages/
│   ├── core/              # Core utilities
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── src/index.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── utils/             # String/array utilities
│   │   ├── src/
│   │   │   ├── string.ts
│   │   │   ├── array.ts
│   │   │   └── index.ts
│   │   ├── src/index.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── test-utils/        # Shared testing utilities
│       ├── src/
│       │   ├── mocks.ts
│       │   ├── fixtures.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── e2e/                   # Playwright E2E tests
│   └── example.spec.ts
├── scripts/               # Helper scripts
│   └── init-template.sh
├── docs/                  # Documentation
│   ├── WORKSPACE.md
│   ├── TESTING.md
│   ├── DEVELOPMENT.md
│   ├── EXAMPLES.md
│   └── adr/              # Architecture Decision Records
│       ├── 001-pnpm-workspaces.md
│       ├── 002-oxlint-oxfmt.md
│       ├── 003-esm-modules.md
│       ├── 004-vitest-over-jest.md
│       └── 005-changesets.md
├── .github/workflows/     # CI/CD pipelines
│   ├── ci.yml
│   ├── changeset.yml
│   ├── codeql.yml
│   └── npm-publish.yml
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── vitest.config.ts
├── oxlintrc.json
├── renovate.json
└── README.md
```

## Scripts

### Development

| Script | Purpose |
|--------|---------|
| `pnpm run dev` | Start dev servers (watch mode) |
| `pnpm run build` | Build all packages |
| `pnpm run clean` | Clean build artifacts |
| `pnpm run fresh` | Clean and reinstall (nuclear option) |

### Code Quality

| Script | Purpose |
|--------|---------|
| `pnpm run lint` | Lint all packages |
| `pnpm run lint:fix` | Fix linting issues |
| `pnpm run format` | Format all code |
| `pnpm run format:check` | Check formatting |
| `pnpm run type-check` | Type check all packages |

### Testing

| Script | Purpose |
|--------|---------|
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Watch mode testing |
| `pnpm run test:coverage` | Generate coverage report |
| `pnpm run test:ui` | Interactive test UI |

### Dependencies

| Script | Purpose |
|--------|---------|
| `pnpm run audit` | Security audit |
| `pnpm run outdated` | Check outdated packages |
| `pnpm run update:deps` | Update dependencies |

### Publishing

| Script | Purpose |
|--------|---------|
| `pnpm run changeset` | Create a changeset |
| `pnpm run changeset:version` | Bump versions |
| `pnpm run changeset:publish` | Publish to npm |

## Helper Scripts

Template initialization and project management scripts in `scripts/`:

| Script | Purpose |
|--------|---------|
| `scripts/init-template.mjs` | Interactive template initialization |
| `scripts/create-package.mjs` | Create new package scaffold |
| `scripts/rename-scope.mjs` | Rename package scope (@company → @myorg) |
| `scripts/verify-setup.mjs` | Verify setup and dependencies |

**Usage**:
```bash
# Initialize template (run first when using as template)
node scripts/init-template.mjs

# Create a new package
node scripts/create-package.mjs my-feature

# Rename package scope
node scripts/rename-scope.mjs company myorg

# Verify everything is configured
node scripts/verify-setup.mjs
```

See [scripts/TEMPLATE_INITIALIZATION.md](scripts/TEMPLATE_INITIALIZATION.md) for detailed guide.

## Documentation

Comprehensive guides for development and deployment:

- **[Template Initialization Guide](scripts/TEMPLATE_INITIALIZATION.md)** - Using this template for new projects
- **[Workspace Guide](docs/WORKSPACE.md)** - Managing monorepo packages
- **[Development Workflow](docs/DEVELOPMENT.md)** - Day-to-day development process
- **[Testing Guide](docs/TESTING.md)** - Unit, integration, and E2E testing
- **[Examples](docs/EXAMPLES.md)** - Real-world usage examples
- **[Architecture Decisions](docs/adr/)** - Technology choices and rationale

## Configuration Files

### TypeScript (`tsconfig.json`)

- Strict type checking enabled
- ES2022 target with ESNext modules
- Decorator support enabled
- Source maps and declarations generated

### Package Manager

- Uses pnpm with workspaces support
- Minimum pnpm version: 9.0.0
- Minimum Node.js version: 20.0.0

## Coding Standards

This project follows strict coding standards:

### Naming Conventions

- **camelCase**: Variables and functions
- **PascalCase**: Classes, types, interfaces, components, files/folders
- **snake_case**: Script files (non-module)
- **#prefix**: Private class fields (ES2022)

### Code Style

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- No trailing commas

### Best Practices

- Async/await over Promises
- Strict equality (`===`)
- Explicit return types
- JSDoc for public APIs only
- Dependency injection with decorators

See [AGENTS.md](AGENTS.md) for complete guidelines.

## Version Management

This project uses [Changesets](https://github.com/changesets/changesets) for version management:

### Creating a Changeset

When you make changes that should be released:

```bash
pnpm changeset
```

Follow the prompts to:
1. Select the type of change (major, minor, patch)
2. Describe your changes

### Releasing

The release process is automated via GitHub Actions:

1. **Make changes** and create changesets
2. **Merge to main** - GitHub Actions will create a "Version Packages" PR
3. **Review and merge** the Version Packages PR
4. **Automatic release** - Package is published to npm and GitHub release is created

### Manual Release

If needed, you can release manually:

```bash
pnpm version  # Update versions
git add .
git commit -m "chore: version packages"
pnpm release  # Publish to npm
```

## CI/CD Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on push and pull requests:
- Code quality checks (formatting, linting, type checking)
- Tests on Node.js 20 and 22
- Build verification
- Coverage reporting

### Release Workflow (`.github/workflows/release.yml`)

Runs on main branch:
- Creates version PRs using Changesets
- Publishes to npm when version PR is merged
- Creates GitHub releases automatically
- Supports pre-release versions

### Dependency Updates

Dependabot is configured to:
- Check for npm package updates weekly
- Check for GitHub Actions updates weekly
- Group updates by category (TypeScript, testing, etc.)
- Auto-label and assign PRs

## Pre-commit Hooks

simple-git-hooks and lint-staged are configured to run on every commit:
- Format code with oxfmt
- Lint and fix with oxlint
- Ensure code quality before commits

## Contributing

1. Follow the coding standards in [AGENTS.md](AGENTS.md)
2. Write tests for new features
3. Use conventional commits
4. Ensure all tests pass before submitting PR

## License

MIT

---

_Generated from template-ts on December 19, 2025_
