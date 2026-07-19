# Testing Guide

This repo uses Vitest for unit/integration coverage, Playwright for browser
coverage, and a dedicated production verification flow for deployed endpoints
and post-deploy UI smoke tests.

## Production Verification

### Endpoint smoke checks

```bash
# Default production endpoint checks.
pnpm run verify:prod

# Include telemetry once that worker is expected to be live.
ENABLE_TELEMETRY=1 pnpm run verify:prod

# Target a staging or preview deployment.
BASE=https://staging.example/rune-studio pnpm run verify:prod
```

What `verify:prod` covers:

- Studio HTML reachability
- Curated mirror manifests for `cdm`, `fpml`, and `rune-dsl`
- Curated `latest.tar.gz` archive reachability for those same models
- GitHub auth `device-init`
- Codegen worker `/api/generate/health`
- Same-origin Pages Function probes for `/api/lsp/health`, `/api/lsp/session`, and `/api/parse`

Telemetry probes are currently **optional** and are only included when
`ENABLE_TELEMETRY=1`.

### Browser smoke checks

```bash
# Run the dedicated production Playwright smoke against the default deploy.
pnpm run verify:prod:ui

# Override the deployed Studio origin explicitly.
PLAYWRIGHT_BASE_URL=https://www.daikonic.dev/rune-studio/studio/ pnpm run verify:prod:ui

# Run both endpoint and browser production checks.
pnpm run verify:prod:all
```

The prod Playwright smoke is isolated from the normal E2E suite. It uses
`apps/studio/playwright.prod.config.ts` and only runs specs under
`apps/studio/test/prod-smoke/`, so setting `PLAYWRIGHT_BASE_URL` for a prod
check does **not** accidentally point the full local E2E suite at production.

The current smoke flow:

1. Opens the deployed Studio in a fresh browser context
2. Loads the CDM curated bundle
3. Navigates one enum and one data type from the namespace explorer
4. Verifies Structure and Inspector update
5. Verifies Source stays on the workspace file for reference-only curated types

### Full checkout harness (`test:prod-ux`)

```bash
# Run the full 18-journey checkout harness against the default deploy.
pnpm --filter @rune-langium/studio run test:prod-ux

# Against a preview/staging deployment.
PLAYWRIGHT_BASE_URL=https://preview.example/rune-studio/studio/ pnpm --filter @rune-langium/studio run test:prod-ux
```

This is the superset harness (spec: `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md`)
that exercises every perspective, dialog, and mutation loop the smoke check
above does not. It writes an evidence bundle — `run-manifest.json`
(per-journey verdicts, opLog streams, budget-aware timings), screenshots,
traces, and axe results — to `apps/studio/test/prod-ux/report/`, meant to be
read by the `prod-ux-review` agent skill (`.agents/skills/prod-ux-review/`),
not by eye.

**Nightly automation:** `.github/workflows/prod-ux-nightly.yml` runs this on
a schedule (04:41 UTC) and uploads `report/` as the `prod-ux-report` build
artifact — this job never fails the build; a red journey is evidence, not a
gate. A separate scheduled Claude Code routine picks up the latest artifact
and runs the `prod-ux-review` skill against it (see that skill's `SKILL.md`
for the review procedure); it files a GitHub issue when it finds a genuine
regression, as distinct from a corpus-drift or known-issue finding.

### Operational note

If we want a published status page later, the clean next step is to have
`verify:prod` / `verify:prod:ui` emit machine-readable summaries (JSON or
Markdown) and publish those from CI. For now, `docs/TESTING.md` is the primary
operator entrypoint and the spec markdown remains historical/spec context.

## Unit & Integration Testing

### Running Tests

```bash
# Run all tests once
pnpm run test

# Watch mode (re-run on file changes)
pnpm run test:watch

# Run with coverage
pnpm run test:coverage

# Run specific test file
pnpm run test src/core.test.ts

# Run tests matching pattern
pnpm run test -- --grep "string utility"

# Interactive UI
pnpm run test:ui
```

### Writing Tests

Create a test file next to your source:

```typescript
// src/string-utils.ts
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// src/string-utils.test.ts
import { describe, it, expect } from 'vitest';
import { capitalize } from './string-utils';

describe('String Utils', () => {
  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should handle empty strings', () => {
      expect(capitalize('')).toBe('');
    });
  });
});
```

### Coverage Thresholds

Current configuration requires:
- **80%** line coverage
- **80%** function coverage
- **75%** branch coverage
- **80%** statement coverage

Configure in [vitest.config.ts](../vitest.config.ts).

### Using Test Utilities

If you create a shared test utilities package, import helpers from it:

```typescript
import { describe, it, expect } from 'vitest';
import { createMockUser, createMockApiResponse, createMockFn, spyOn } from '@rune-langium/test-utils';

describe('User API', () => {
  it('should fetch user', async () => {
    const mockUser = createMockUser({ name: 'John' });
    const mockFn = createMockFn();

    mockFn.mockResolvedValue(mockUser);

    const result = await mockFn();
    expect(result.name).toBe('John');
  });

  it('should spy on console', () => {
    const consoleSpy = spyOn(console, 'log');

    console.log('test');

    expect(consoleSpy).toHaveBeenCalledWith('test');
  });
});
```

### Cross-Package Testing

Test integration between packages in `integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isValidEmail, createSuccessResponse } from '@rune-langium/core';
import { capitalize } from '@rune-langium/utils';

describe('Cross-Package Integration', () => {
  it('should combine utilities', () => {
    const response = createSuccessResponse({
      email: 'john@example.com',
      isValid: isValidEmail('john@example.com'),
      displayName: capitalize('john'),
    });

    expect(response.success).toBe(true);
    expect(response.data?.isValid).toBe(true);
  });
});
```

## Performance Benchmarking

### Running Benchmarks

```bash
# Run all benchmarks
pnpm run test vitest.benchmark.config.ts

# Run specific benchmark
pnpm run test -- bench "Array Operations"
```

### Writing Benchmarks

Create benchmark files (usually separate from unit tests):

```typescript
// vitest.benchmark.config.ts
import { bench, describe } from 'vitest';
import { unique, flatten } from '@rune-langium/utils';

describe('Benchmarks', () => {
  const largeArray = Array.from({ length: 10000 }, (_, i) => i % 100);

  bench('unique - large array', () => {
    unique(largeArray);
  });

  bench('flatten - deep array', () => {
    flatten(Array(100).fill([1, [2, [3]]]), 2);
  });
});
```

## End-to-End Testing

### Running E2E Tests

```bash
# Run all E2E tests
pnpm exec playwright test

# Run in headed mode (see browser)
pnpm exec playwright test --headed

# Run specific file
pnpm exec playwright test e2e/example.spec.ts

# Run in debug mode
pnpm exec playwright test --debug

# View test report
pnpm exec playwright show-report
```

### Writing E2E Tests

Create test files in `e2e/` directory:

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should login successfully', async ({ page }) => {
    // Fill login form
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password123');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect and verify
    await page.waitForURL('/dashboard');
    expect(page.url()).toContain('/dashboard');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'wrong');
    await page.click('button[type="submit"]');

    const errorMessage = page.locator('[role="alert"]');
    await expect(errorMessage).toContainText('Invalid credentials');
  });
});
```

### Multi-Browser Testing

Tests run against Chromium, Firefox, and WebKit by default. Configure in [playwright.config.ts](../playwright.config.ts).

### Visual Regression Testing

```typescript
test('should render correctly', async ({ page }) => {
  await page.goto('/');

  // Take screenshot
  await expect(page).toHaveScreenshot();
});
```

Run with `--update-snapshots` to create baseline screenshots.

## Testing Best Practices

### 1. Test Naming

```typescript
✅ Good: Describes what should happen
it('should return capitalized string when input is lowercase', () => {})

❌ Bad: Vague or implementation-focused
it('test capitalize function', () => {})
```

### 2. Arrange-Act-Assert Pattern

```typescript
it('should process user data', () => {
  // Arrange: Set up test data
  const user = createMockUser({ name: 'John' });

  // Act: Call the function
  const result = processUser(user);

  // Assert: Verify the result
  expect(result.displayName).toBe('John');
});
```

### 3. Avoid Test Interdependence

```typescript
❌ Bad: Tests depend on execution order
let user;
test('create user', () => {
  user = createUser({ name: 'John' });
});
test('update user', () => {
  updateUser(user);
});

✅ Good: Each test is independent
test('can create user', () => {
  const user = createUser({ name: 'John' });
  expect(user.name).toBe('John');
});
test('can update user', () => {
  const user = createMockUser();
  const updated = updateUser(user);
  expect(updated.name).toBe('John');
});
```

### 4. Use Fixtures for Common Setup

```typescript
// test-utils/fixtures.ts
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    ...overrides,
  };
}

// In tests
const user = createMockUser({ name: 'John' });
```

### 5. Test Behavior, Not Implementation

```typescript
✅ Good: Testing what the function does
it('should return unique items', () => {
  expect(unique([1, 1, 2, 3])).toEqual([1, 2, 3]);
});

❌ Bad: Testing how it's implemented
it('should create a Set internally', () => {
  // Don't test internal implementation
});
```

## Coverage Reports

Generate and view coverage reports:

```bash
# Generate coverage
pnpm run test:coverage

# View HTML report
open coverage/index.html
```

Coverage is automatically tracked and must meet thresholds before passing CI.

## CI/CD Integration

Tests run automatically on:
- **Pre-commit**: Type checking and linting
- **Push**: All tests, coverage, and build validation
- **Pull Request**: Same checks plus coverage reports

See [.github/workflows/ci.yml](../.github/workflows/ci.yml) for details.

## Troubleshooting

### "Module not found" in tests

```bash
# Rebuild packages
pnpm run build

# Clear Vitest cache
rm -rf node_modules/.vitest
```

### Tests timeout

```typescript
// Increase timeout for slow tests
it('slow test', async () => {
  // ...
}, { timeout: 10000 });
```

### Coverage not showing accurate results

```bash
# Clear coverage cache and regenerate
rm -rf coverage
pnpm run test:coverage
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Best Practices](https://testing-library.com/)
