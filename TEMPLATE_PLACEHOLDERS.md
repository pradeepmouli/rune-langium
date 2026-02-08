# Template Placeholders Guide

This document lists all template placeholders that should be updated when initializing a new project from this template.

## Automatic Updates

Running `node scripts/init-template.mjs` will automatically update most of these placeholders.

## Placeholders to Update

### Global Placeholders

- `YOUR_GITHUB_USERNAME` - Your GitHub username or organization name
- `YOUR_REPO_NAME` - Your repository name
- `YOUR_NAME` - Your full name or organization name
- `YOUR_EMAIL` - Your email address
- `YOUR_DOMAIN.com` - Your domain for security contacts
- `@company` - Your npm scope/organization (e.g., `@myorg`)

### Files Containing Template Markers

#### Root Files
- [x] `README.md` - Project title, description, badges, package examples
- [x] `package.json` - Name, author, repository URLs, description
- [x] `AGENTS.md` - Project metadata
- [x] `CONTRIBUTING.md` - Repository URLs, project name
- [x] `SECURITY.md` - Security contact email, repository URLs

#### Documentation Files
- [x] `docs/DEVELOPMENT.md` - Repository URLs, workflow instructions
- [x] `docs/WORKSPACE.md` - Package scope examples
- [x] `docs/TESTING.md` - Testing guidelines
- [x] `docs/EXAMPLES.md` - Code examples with package scope

#### GitHub Workflows
- [x] `.github/workflows/ci.yml` - Branch names and triggers
- [ ] `.github/workflows/release.yml` - Release configuration
- [ ] `.github/workflows/changeset.yml` - Publishing configuration

#### Example Packages (Should be removed or customized)
- [ ] `packages/core/` - Example core utilities package
- [ ] `packages/utils/` - Example utils package
- [ ] `packages/test-utils/` - Example test utilities package

## Template Comments

All template-specific content is marked with HTML comments:

```markdown
<!-- TEMPLATE: Description of what should be updated -->
```

These comments can be searched for using:

```bash
grep -r "<!-- TEMPLATE:" .
```

## After Initialization

1. **Search for remaining placeholders:**
   ```bash
   grep -r "YOUR_" .
   grep -r "@company" .
   grep -r "TEMPLATE:" .
   ```

2. **Update package scope everywhere:**
   ```bash
   node scripts/rename-scope.mjs company your-org
   ```

3. **Remove or customize example packages:**
   - Delete `packages/core`, `packages/utils`, `packages/test-utils`
   - Or customize them for your needs

4. **Customize GitHub workflows:**
   - Update branch protection rules
   - Configure secrets for publishing
   - Adjust CI/CD steps

5. **Update badges in README:**
   - CI/CD status badge
   - Coverage badge (if using)
   - Version badge (after first publish)

## Verification

After initialization, verify all templates are updated:

```bash
# Should return no results
grep -r "YOUR_GITHUB_USERNAME" . --exclude-dir=node_modules
grep -r "YOUR_REPO_NAME" . --exclude-dir=node_modules
grep -r "YOUR_NAME" . --exclude-dir=node_modules
grep -r "your.email@example.com" . --exclude-dir=node_modules
```

## Manual Updates Required

Some customizations should be done manually after initialization:

1. **Project-specific documentation**
   - Update architecture decisions in `docs/adr/`
   - Customize development workflow in `docs/DEVELOPMENT.md`
   - Add project-specific examples in `docs/EXAMPLES.md`

2. **Testing strategy**
   - Adjust test coverage thresholds
   - Configure E2E tests for your specific use case
   - Set up integration test environments

3. **CI/CD customization**
   - Configure deployment targets
   - Set up environment-specific secrets
   - Customize build and release processes

4. **Code of Conduct and Contributing**
   - Review and customize community guidelines
   - Add project-specific contribution rules
   - Set up issue and PR templates
