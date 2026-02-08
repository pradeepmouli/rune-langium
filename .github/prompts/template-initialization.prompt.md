---
name: Template Initialization
description: Automate project initialization from template-ts by driving the interactive script non-interactively. The script features intelligent defaults auto-detection from git config and environment, skills discovery based on project context, and automatic installation of specify tools for GitHub Copilot.
argument-hint: Project description and optional parameters for initializing a new project from template-ts.
---

# Template Initialization

Automate project initialization from template-ts by driving the interactive script non-interactively. The script features intelligent defaults auto-detection from git config and environment, skills discovery based on project context, and automatic installation of specify tools for GitHub Copilot.

## When to Use

Use this prompt when the user wants to:
- Initialize a new project from the template-ts repository
- Set up a fresh repository with customized project metadata
- Configure package scope and remove example packages/tests
- Automate the entire `scripts/init-template.mjs` workflow without manual prompts

## Workflow

The initialization script uses **zx** (Google's bash replacement) for cross-platform compatibility and runs interactively with the following steps:

1. **Detect intelligent defaults**
   - Auto-detect project name from `basename $(pwd)`
   - Auto-detect author name from `git config user.name`
   - Auto-detect author email from `git config user.email`
   - Auto-detect repository URL from `git config remote.origin.url`
   - Extract package scope from project name (e.g., "acme-app" → "acme")

2. **Gather inputs** - Prompt user for required fields with intelligent defaults pre-filled; only description typically needs manual input

3. **Discover skills**
   - Run `scripts/discover-skills.mjs` to analyze project context
   - Recommend relevant skills based on project name and description
   - Match skills against patterns from https://skills.sh/
   - Skills become available in agent-specific directories (.copilot/, .claude/, .codex/, .gemini/)

4. **Validate environment** - Check Node.js >= 20, pnpm >= 10

5. **Execute initialization** - Run the interactive init script

6. **Install Copilot tools**
   - Automatically install `uvx specify --ai copilot`
   - Automatically install `uvx specify-extend --agent copilot`
   - Provide manual installation instructions if uvx unavailable

7. **Verify setup** - Run lint and tests, report results

8. **Update template placeholders** - Replace all template markers throughout the repository
   - Update `<!-- TEMPLATE: -->` HTML comments with actual values
   - Replace placeholders: `YOUR_GITHUB_USERNAME`, `YOUR_REPO_NAME`, `YOUR_NAME`, `YOUR_EMAIL`, `@company`
   - Update documentation, configuration files, and examples

9. **Clean up template files** - Remove template-specific files
   - Delete `TEMPLATE_PLACEHOLDERS.md` (template documentation)
   - Optionally delete `scripts/TEMPLATE_INITIALIZATION.md` (template guide)
   - Optionally delete `.github/prompts/template-initialization.prompt.md` (this prompt file)
   - Remove any other template-only documentation

## Required Inputs

Collect these from the user before proceeding (or use intelligent defaults):

**Required:**
- `project_name` - Project name (default: auto-detected from `basename $(pwd)`)
- `author_name` - Author name (default: auto-detected from `git config user.name`)
- `description` - Project description (no default, user must provide)

**Optional (intelligent defaults provided):**
- `author_email` - Author email (default: auto-detected from `git config user.email`)
- `repository_url` - Repository URL (default: auto-detected from `git remote.origin.url`)
- `package_scope` - Package scope (default: if monorepo, use the project name, else extracted from project name, e.g., "acme-app" → "acme", fallback: "company")
- `remove_example_packages` - Remove example packages? (default: "y")
- `remove_example_tests` - Remove example tests? (default: "y")
- `remove_example_e2e` - Remove E2E tests? (default: "y")
- `replace_template_initialization` - Delete TEMPLATE_INITIALIZATION.md? (default: "y")
- `delete_template_files` - Delete all template-specific files? (default: "y")
  - Includes: `TEMPLATE_PLACEHOLDERS.md`, `.github/prompts/template-initialization.prompt.md`

## Execution

Run the interactive zx script:

```bash
# Run the initialization script
node scripts/init-template.mjs
```

The script will interactively prompt for:
- Project name (defaults to current directory name)
- Author name (defaults from git config)
- Author email (defaults from git config)
- Project description (required input)
- Repository URL (defaults from git remote)
- Package scope (auto-extracted from project name)
- Confirmation to proceed
- Whether to remove example packages, tests, and E2E tests

**Note**: The script uses intelligent defaults auto-detected from git config and environment, so most fields can be accepted as-is by pressing Enter.

## Post-Initialization

Run validation commands:

```bash
pnpm run lint
pnpm test
```

## What Gets Updated

The initialization script updates template placeholders throughout the repository:

### Core Files
- `package.json` - Project metadata, author, description, repository URLs
  - Replaces: `YOUR_NAME`, `YOUR_EMAIL`, `YOUR_GITHUB_USERNAME`, `YOUR_REPO_NAME`
- `README.md` - Project title, description, badges
  - Updates all `<!-- TEMPLATE: -->` markers with actual values
- `AGENTS.md` - Project name and agent guidance
  - Replaces `@company/ts-template` with actual project name
- `CONTRIBUTING.md` - Repository URLs and project name
  - Updates clone instructions and repository references
- `SECURITY.md` - Security contact information
  - Replaces `YOUR_DOMAIN.com` and repository URLs

### Documentation Files
- `docs/DEVELOPMENT.md` - Repository URLs and workflow instructions
- `docs/WORKSPACE.md` - Package scope examples
- `docs/TESTING.md` - Testing guidelines
- `docs/EXAMPLES.md` - Code examples with package scope

### Template Artifacts
- All files with `<!-- TEMPLATE: -->` HTML comments are updated
- `TEMPLATE_PLACEHOLDERS.md` - Template documentation (deleted after init)
- `scripts/TEMPLATE_INITIALIZATION.md` - Template guide (optionally deleted)
- `.github/prompts/template-initialization.prompt.md` - This prompt file (optionally deleted)
- Example packages/tests - Optionally removed based on user choices

### Git & CI/CD
- `.github/workflows/` - GitHub Actions workflows with updated repository context
- Git repository - Initialized with initial commit if not already present

### Agent Tools
- **Specify tools** - Installed automatically for GitHub Copilot integration
- Skills directories - Created with symlinks to recommended skills (.copilot/, .claude/, .codex/, .gemini/)

## Deliverables

Report to user:

- Configuration summary (inputs used, including auto-detected defaults)
- Discovered skills recommendations
- Commands executed
- **Template placeholders replaced:**
  - List of files updated with actual values
  - Confirmation that `<!-- TEMPLATE: -->` markers were processed
- **Template files cleaned up:**
  - `TEMPLATE_PLACEHOLDERS.md` - Deleted
  - `scripts/TEMPLATE_INITIALIZATION.md` - Deleted (if user chose to)
  - `.github/prompts/template-initialization.prompt.md` - Deleted (if user chose to)
- Specify tools installation status
- Lint results
- Test results
- Location of updated files
- Skills available in .copilot/, .claude/, .codex/, .gemini/ directories

## Template Markers

The repository uses standardized template markers:

**HTML comments in Markdown:**
```markdown
<!-- TEMPLATE: Description of what to update -->
```

**Standard placeholders:**
- `YOUR_GITHUB_USERNAME` - GitHub username/org
- `YOUR_REPO_NAME` - Repository name
- `YOUR_NAME` - Author name
- `YOUR_EMAIL` - Author email
- `YOUR_DOMAIN.com` - Domain for contacts
- `@company` - npm package scope

**Verification:** After initialization, search for any remaining placeholders:
```bash
grep -r "YOUR_" . --exclude-dir=node_modules
grep -r "@company" . --exclude-dir=node_modules
grep -r "<!-- TEMPLATE:" . --exclude-dir=node_modules
```
