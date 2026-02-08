# Template Initialization Guide

This guide explains how to use the template-ts template for new projects.

## Quick Start

### 1. Use as GitHub Template

Click "Use this template" on the GitHub repository to create a new repository.

```bash
# Clone your new repository
git clone https://github.com/your-org/your-new-project.git
cd your-new-project
```

### 2. Run Initialization Script

The easiest way to customize the template for your project:

```bash
# Make scripts executable (first time only)
chmod +x scripts/*.mjs

# Run the interactive initialization script
node scripts/init-template.mjs
```

This script will prompt you for:
- Project name (with intelligent default from directory name)
- Author name and email (with defaults from git config)
- Project description
- Repository URL (with default from git remote)
- Package scope (with intelligent default based on project name)
- Whether to replace scripts/TEMPLATE_INITIALIZATION.md with project details

The script will then:
- Analyze your project description and discover recommended skills
- Update package.json with your project details
- Generate a new README.md
- Generate AGENTS.md with agent guidance for Copilot, Claude, Gemini, and Codex
- Clean up template-specific files
- Remove example packages and tests (optional)
- Replace scripts/TEMPLATE_INITIALIZATION.md with a project-specific guide (optional)
- Initialize git repository
- Install dependencies with pnpm
- Install specify and specify-extend for GitHub Copilot

Agent-run option: you can ask the agent to run the entire flow non-interactively using the prompt `template-initialization` (see .agents/skills/template-initialization/SKILL.md). The agent will feed answers to the script in order and report results back.

## New Features

### Intelligent Defaults

The initialization script now detects defaults from your environment:
- **Project name**: Uses current directory name
- **Author name & email**: Reads from git config
- **Repository URL**: Reads from git remote origin
- **Package scope**: Extracts from project name (e.g., "acme-app" → scope "acme")

### Skills Discovery

The script automatically analyzes your project description to recommend relevant skills:
- Matches keywords in your description against available skills
- Suggests skills like frontend-design, github-actions-templates, typescript-advanced-types, etc.
- Skills are available in agent-specific directories (.copilot/, .claude/, .codex/, .gemini/)

### Copilot Integration

Automatically installs specify tools for GitHub Copilot:
- `uvx specify --ai copilot` - Initializes spec-kit with Copilot agent
- `uvx specify-extend --agent copilot` - Installs spec-kit extensions with Copilot agent

## Helper Scripts

All scripts are located in the `scripts/` directory and use zx for cross-platform compatibility:

### scripts/init-template.mjs

**Purpose**: Interactive project initialization with intelligent defaults

**Usage**:
```bash
node scripts/init-template.mjs
```

**What it does**:
- Detects intelligent defaults from environment
- Discovers recommended skills based on project description
- Prompts for project details (name, author, description)
- Updates package.json
- Generates new README.md and AGENTS.md
- Installs specify tools for GitHub Copilot
- Cleans up template files
- Optionally rewrites scripts/TEMPLATE_INITIALIZATION.md with your project guide
- Initializes git repository
- Installs dependencies

**Interactive prompts with defaults**:
- ✅ Project name (default: current directory)
- ✅ Author name (default: from git config)
- ✅ Author email (default: from git config)
- ✅ Project description
- ✅ Repository URL (default: from git remote)
- ✅ Package scope (default: extracted from project name)
- ✅ Remove example packages
- ✅ Remove example tests
- ✅ Remove example E2E tests

### scripts/discover-skills.mjs

Analyzes project context and suggests relevant skills.

**Usage**:
```bash
node scripts/discover-skills.mjs "project-name" "project description" [project-type]
```

**Example**:
```bash
node scripts/discover-skills.mjs "my-api" "REST API for user management" "backend"
```

**What it does**:
- Analyzes project name, description, and type for keywords
- Matches against available skills in .agents/skills/ (inspired by https://skills.sh/)
- Recommends relevant skills (e.g., frontend-design, github-actions, etc.)
- Always includes core TypeScript skills
- Outputs list of recommended skills

**Keyword Matching**:
The script uses keyword patterns to suggest skills:
- "frontend|ui|web" → frontend-design, responsive-design
- "ci|cd|pipeline|workflow" → github-actions-templates
- "monorepo|workspace" → monorepo-management, turborepo-caching
- "design system|tokens|theme" → design-system-patterns
- And many more...

### scripts/create-package.mjs

**Purpose**: Create a new package scaffold in the monorepo

**Usage**:
```bash
# Create a new package with default scope (company)
node scripts/create-package.mjs my-feature

# Or specify a custom scope  
node scripts/create-package.mjs my-feature --scope=myorg
```

**Creates**:
```
packages/my-feature/
├── src/
│   ├── index.ts        # Main entry point
│   └── index.test.ts   # Test file
├── package.json        # Package configuration
├── tsconfig.json       # TypeScript config
└── README.md          # Package documentation
```

**Next steps after creation**:
```bash
# Implement your code
nano packages/my-feature/src/index.ts

# Run tests
pnpm --filter @company/my-feature test

# Build the package
pnpm --filter @company/my-feature build
```

### scripts/rename-scope.mjs

**Purpose**: Rename package scope across the entire project

**Usage**:
```bash
# Rename from @company to @myorg
node scripts/rename-scope.mjs company myorg

# Rename from @acme to @mycompany
node scripts/rename-scope.mjs acme mycompany
```

**What it updates**:
- All package.json files
- All TypeScript/JavaScript imports
- All documentation files
- Package directory names

**After renaming**:
```bash
# Reinstall with new package names
pnpm install

# Run tests to verify
pnpm test
```

### scripts/verify-setup.mjs

**Purpose**: Verify template setup and dependencies

**Usage**:
```bash
node scripts/verify-setup.mjs
```

**Checks**:
- ✅ Node.js version (>= 20.0.0)
- ✅ pnpm installation and version (>= 10.0.0)
- ✅ Required tools (TypeScript, Vitest, oxlint, oxfmt)
- ✅ Project structure and key files
- ✅ Documentation files
- ✅ Helper scripts

**Output example**:
```
🔍 Verifying template setup...

Checking Node.js version... ✅ 20.10.0
Checking pnpm version... ✅ 9.0.0
Checking TypeScript... ✅ 5.9.3
Checking Vitest... ✅ 4.0.16
Checking oxlint... ✅ oxlint 1.36.0
Checking oxfmt... ✅ Installed

📁 Checking project structure...
✅ package.json
✅ tsconfig.json
✅ pnpm-workspace.yaml
✅ vitest.config.ts
...

🎉 All required setup checks passed!
```

## Typical Workflow

### 1. Initialize Template

```bash
# Clone from GitHub template
git clone https://github.com/your-org/new-project.git
cd new-project

# Run initialization
node scripts/init-template.mjs
```

Follow the prompts to customize your project.

### 2. Verify Setup

```bash
# Check that everything is configured correctly
node scripts/verify-setup.mjs
```

### 3. Create First Package

```bash
# Create your first package
node scripts/create-package.mjs core

# Or with custom scope
node scripts/create-package.mjs core --scope=myorg
```

### 4. Implement Features

```bash
# Start development
pnpm run dev

# Run tests
pnpm run test

# Check code quality
pnpm run lint
```

### 5. Version and Release

```bash
# Create a changeset when ready to release
pnpm run changeset

# Update versions
pnpm run changeset:version

# Publish to npm
pnpm run changeset:publish
```

## Customization Examples

### Example 1: Simple Project

Using the template for a single package project:

```bash
# Initialize
node scripts/init-template.mjs
# → Project name: my-utils
# → Author: Jane Doe
# → Remove example packages? y

# Create your package
node scripts/create-package.mjs utils

# Start working
pnpm run dev
```

### Example 2: Large Monorepo

Using the template for multiple packages:

```bash
# Initialize
node scripts/init-template.mjs
# → Project name: my-platform
# → Author: John Doe
# → Package scope: mycompany
# → Remove example packages? n

# Rename packages to your scope
node scripts/rename-scope.mjs company mycompany

# Create additional packages
node scripts/create-package.mjs api
node scripts/create-package.mjs web
node scripts/create-package.mjs cli

# Start working
pnpm run dev
```

### Example 3: Organization Migration

Migrating an existing project to use this template:

```bash
# Clone the template first
git clone template-ts.git my-existing-project

# Initialize with your details
node scripts/init-template.mjs
# → Customize with your project info

# Merge your existing code
# → Copy packages from your old project
# → Copy docs/
# → Update CONTRIBUTING.md and SECURITY.md

# Verify everything works
node scripts/verify-setup.mjs
pnpm test
```

## Troubleshooting

### Dependencies Won't Install

```bash
# Install pnpm globally
npm install -g pnpm@8.15.0

# Or use with npm
npm init -y
npm install pnpm
npx pnpm install
```

### Dependencies Won't Install

```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Script Errors on macOS

If you get "command not found" errors on macOS:

```bash
# Use bash explicitly
bash scripts/init-template.sh
bash scripts/create-package.sh my-package
```

## Environment Variables

No special environment variables are required, but you can pass options:

```bash
# Custom package scope (used by create-package.mjs)
node scripts/create-package.mjs my-feature --scope=mycompany
```

## Next Steps

After initialization:

1. **Review Documentation**
   - Read [docs/WORKSPACE.md](../docs/WORKSPACE.md) for monorepo management
   - Read [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) for development workflow
   - Read [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines

2. **Configure CI/CD**
   - Update `.github/workflows/` for your repository
   - Set up GitHub Actions secrets if needed for npm publishing

3. **Add Your Code**
   - Create packages using `node scripts/create-package.mjs`
   - Implement your features
   - Write tests

4. **Prepare for Release**
   - Use `pnpm changeset` for version management
   - Update CHANGELOG.md
   - Follow the release workflow in docs/DEVELOPMENT.md

## Support

For questions or issues:

1. Check [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)
2. Review [docs/TESTING.md](../docs/TESTING.md)
3. See [CONTRIBUTING.md](../CONTRIBUTING.md)
4. Refer to [docs/WORKSPACE.md](../docs/WORKSPACE.md)

---

**Happy templating! 🚀**
