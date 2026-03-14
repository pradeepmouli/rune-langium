# Playwright E2E Testing Skill

Run Playwright end-to-end tests for the Rune DSL Studio application. Handles browser setup, preview server management, and test execution.

## When to Use

Use this skill when:
- Running E2E tests after making changes to the Studio app
- Verifying no regressions in UI functionality
- Checking that the app builds and renders correctly

## Prerequisites

- Studio must be buildable: `pnpm --filter @rune-langium/studio run build`
- Playwright is installed as a dev dependency in apps/studio

## Steps

### 1. Ensure Browser Availability

Playwright versions sometimes don't match installed browser versions. Fix this with symlinks:

```bash
# Check what's installed
ls /root/.cache/ms-playwright/ 2>/dev/null

# Find the installed version
INSTALLED_VERSION=$(ls /root/.cache/ms-playwright/ | grep "chromium_headless_shell-" | head -1 | sed 's/chromium_headless_shell-//')

# Find the expected version from Playwright
EXPECTED_VERSION=$(pnpm --filter @rune-langium/studio exec playwright --version 2>/dev/null | head -1)

# If versions differ, create symlinks
# Check what version Playwright expects by trying to run and reading the error
pnpm --filter @rune-langium/studio exec playwright test --list 2>&1 | grep "chromium_headless_shell-" | grep -oP 'chromium_headless_shell-\K\d+' | head -1
```

If the expected browser version differs from installed:

```bash
EXPECTED_BROWSER_VERSION=<from error output>
INSTALLED_BROWSER_VERSION=<from ls output>

mkdir -p /root/.cache/ms-playwright/chromium_headless_shell-${EXPECTED_BROWSER_VERSION}/chrome-headless-shell-linux64/
ln -sf /root/.cache/ms-playwright/chromium_headless_shell-${INSTALLED_BROWSER_VERSION}/chrome-linux/headless_shell \
  /root/.cache/ms-playwright/chromium_headless_shell-${EXPECTED_BROWSER_VERSION}/chrome-headless-shell-linux64/chrome-headless-shell
```

### 2. Build the Studio

```bash
# Build all dependencies first
pnpm --filter @rune-langium/core run build
pnpm --filter @rune-langium/codegen run build
pnpm --filter @rune-langium/design-system run build
pnpm --filter @rune-langium/visual-editor run build
pnpm --filter @rune-langium/studio run build
```

### 3. Start Preview Server

```bash
cd /home/user/rune-langium/apps/studio && pnpm run preview &
sleep 3
# Verify server is running
curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/
```

### 4. Create Config (No webServer block)

Write a temp Playwright config that uses the already-running preview server:

```bash
cat > /tmp/pw-config.ts << 'EOF'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '/home/user/rune-langium/apps/studio/test/e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        }
      }
    }
  ]
});
EOF
```

### 5. Run Tests

```bash
# Run all E2E tests
pnpm --filter @rune-langium/studio exec playwright test --config /tmp/pw-config.ts --reporter=list

# Run specific test file
pnpm --filter @rune-langium/studio exec playwright test --config /tmp/pw-config.ts --reporter=list --grep "should show file loader"

# Run only load-edit-export tests
pnpm --filter @rune-langium/studio exec playwright test --config /tmp/pw-config.ts --reporter=list load-edit-export
```

### 6. Cleanup

```bash
kill $(lsof -ti:4173) 2>/dev/null
```

## Known Issues

### Visual Regression Tests
The visual regression tests (`visual-regression.spec.ts`) may fail due to:
- **Color format mismatch**: Tests expect `rgb()` values but Tailwind CSS 4 + newer Chromium returns `oklch()` format
- **Fix**: Update snapshot baselines with `--update-snapshots` flag

### Namespace Explorer Tests
Some namespace explorer tests may fail due to:
- **CSS class selectors**: Tests use `.ns-row__badge` etc. which may not match current component structure
- **Node counts**: Tests expect specific counts that may differ after refactors

### Browser Version Mismatch
If Playwright can't find the browser:
1. Check installed browsers: `ls /root/.cache/ms-playwright/`
2. Symlink old browser to expected path (see Step 1 above)
3. Alternative: `pnpm exec playwright install chromium` (requires network)

## MCP Server

The project has a Playwright MCP server configured in `.mcp.json` for use with Claude Code:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless", "--test-id-attribute", "data-testid"]
    }
  }
}
```

This provides browser automation tools directly in the Claude Code session for interactive testing.
