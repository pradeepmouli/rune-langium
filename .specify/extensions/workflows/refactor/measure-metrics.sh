#!/usr/bin/env bash

set -e

MODE=""
REFACTOR_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --before)
            MODE="before"
            shift
            ;;
        --after)
            MODE="after"
            shift
            ;;
        --dir)
            REFACTOR_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --before|--after [--dir <refactor-dir>]"
            echo ""
            echo "Captures code metrics for refactoring validation"
            echo ""
            echo "Options:"
            echo "  --before    Capture baseline metrics before refactoring"
            echo "  --after     Capture metrics after refactoring"
            echo "  --dir       Refactor directory (auto-detected if not provided)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [ -z "$MODE" ]; then
    echo "Error: Must specify --before or --after" >&2
    exit 1
fi

# Find repository root
find_repo_root() {
    local dir="$1"
    while [ "$dir" != "/" ]; do
        if [ -d "$dir/.git" ] || [ -d "$dir/.specify" ]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(find_repo_root "$SCRIPT_DIR")"

if [ -z "$REPO_ROOT" ]; then
    echo "Error: Could not find repository root" >&2
    exit 1
fi

cd "$REPO_ROOT"

# Auto-detect refactor directory if not provided
if [ -z "$REFACTOR_DIR" ]; then
    REFACTOR_DIR=$(find "$REPO_ROOT/specs/refactor" -maxdepth 1 -type d | sort -r | head -1)
    if [ -z "$REFACTOR_DIR" ] || [ "$REFACTOR_DIR" = "$REPO_ROOT/specs/refactor" ]; then
        echo "Error: No refactor directory found. Use --dir to specify." >&2
        exit 1
    fi
fi

OUTPUT_FILE="$REFACTOR_DIR/metrics-${MODE}.md"

echo "Capturing ${MODE} metrics to: $OUTPUT_FILE"
echo ""

# --- Source directories for this monorepo ---
SRC_DIRS=(
    "packages/core/src"
    "packages/visual-editor/src"
    "packages/lsp-server/src"
    "packages/cli/src"
    "packages/design-system/src"
    "apps/studio/src"
)

TEST_DIRS=(
    "packages/core/test"
    "packages/visual-editor/test"
    "packages/lsp-server/test"
    "packages/cli/test"
    "apps/studio/test"
)

# Start output file
cat > "$OUTPUT_FILE" << EOF
# Metrics Captured ${MODE^} Refactoring

**Timestamp**: $(date)
**Git Commit**: $(git rev-parse --short HEAD 2>/dev/null || echo "N/A")
**Branch**: $(git branch --show-current 2>/dev/null || echo "N/A")

---

EOF

# ── Code Complexity ──────────────────────────────────────────────────────

echo "## Code Complexity" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### Lines of Code (Source)" >> "$OUTPUT_FILE"
if command -v cloc &> /dev/null; then
    echo "Running cloc analysis..." >&2
    echo '```' >> "$OUTPUT_FILE"
    cloc "${SRC_DIRS[@]}" --quiet 2>/dev/null >> "$OUTPUT_FILE" || echo "cloc failed" >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"
else
    echo '```' >> "$OUTPUT_FILE"
    for dir in "${SRC_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            COUNT=$(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/generated/*" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
            echo "$dir: $COUNT lines" >> "$OUTPUT_FILE"
        fi
    done
    echo '```' >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

echo "### Affected Files (Largest)" >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"
AFFECTED_FILES=(
    "packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx"
    "packages/visual-editor/src/utils/namespace-tree.ts"
    "apps/studio/src/services/lsp-client.ts"
    "apps/studio/src/services/workspace.ts"
    "apps/studio/src/components/FileLoader.tsx"
    "packages/lsp-server/src/rune-dsl-server.ts"
    "packages/lsp-server/src/connection-adapter.ts"
)
for f in "${AFFECTED_FILES[@]}"; do
    if [ -f "$f" ]; then
        wc -l "$f" >> "$OUTPUT_FILE"
    fi
done
echo '```' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# ── Test Suite ───────────────────────────────────────────────────────────

echo "## Test Suite" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### Test Counts Per Package" >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"

# Run tests per package and capture counts
run_tests_for() {
    local pkg_name="$1"
    local pkg_dir="$2"
    if [ -d "$pkg_dir" ]; then
        echo "Running $pkg_name tests..." >&2
        local result
        result=$(cd "$pkg_dir" && npx vitest run --reporter=verbose 2>&1 | grep -E "Test Files|Tests " || true)
        echo "$pkg_name:" >> "$OUTPUT_FILE"
        echo "$result" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/^/  /' >> "$OUTPUT_FILE"
    fi
}

run_tests_for "core" "packages/core"
run_tests_for "visual-editor" "packages/visual-editor"
run_tests_for "studio" "apps/studio"
run_tests_for "lsp-server" "packages/lsp-server"

echo '```' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Count test files
echo "### Test File Counts" >> "$OUTPUT_FILE"
TOTAL_TEST_FILES=0
for dir in "${TEST_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        COUNT=$(find "$dir" -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) | wc -l | tr -d ' ')
        echo "- **$dir**: $COUNT test files" >> "$OUTPUT_FILE"
        TOTAL_TEST_FILES=$((TOTAL_TEST_FILES + COUNT))
    fi
done
echo "- **Total**: $TOTAL_TEST_FILES test files" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# ── Performance ──────────────────────────────────────────────────────────

echo "## Performance" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### Build Time" >> "$OUTPUT_FILE"
echo "Measuring build time..." >&2
BUILD_START=$(date +%s)
pnpm -r run build > /dev/null 2>&1 || true
BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))
echo "- **Full Build (pnpm -r run build)**: ${BUILD_TIME}s" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "### Bundle Size (studio)" >> "$OUTPUT_FILE"
STUDIO_DIST="apps/studio/dist"
if [ -d "$STUDIO_DIST" ]; then
    BUNDLE_SIZE=$(du -sh "$STUDIO_DIST" | cut -f1)
    echo "- **Studio dist**: $BUNDLE_SIZE" >> "$OUTPUT_FILE"
else
    echo "- **Studio dist**: not built (run \`pnpm --filter studio build\` first)" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# ── Dependencies ─────────────────────────────────────────────────────────

echo "## Dependencies" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

for pkg in packages/core packages/visual-editor packages/lsp-server apps/studio; do
    if [ -f "$pkg/package.json" ]; then
        PKG_NAME=$(jq -r '.name // "unknown"' "$pkg/package.json" 2>/dev/null)
        DIRECT=$(jq '.dependencies // {} | length' "$pkg/package.json" 2>/dev/null || echo "?")
        DEV=$(jq '.devDependencies // {} | length' "$pkg/package.json" 2>/dev/null || echo "?")
        echo "- **$PKG_NAME**: $DIRECT deps, $DEV devDeps" >> "$OUTPUT_FILE"
    fi
done
echo "" >> "$OUTPUT_FILE"

# ── Git Statistics ───────────────────────────────────────────────────────

echo "## Git Statistics" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if git rev-parse --git-dir > /dev/null 2>&1; then
    MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@.*/@@' || echo "master")
    COMMITS_AHEAD=$(git rev-list --count "${MAIN_BRANCH}..HEAD" 2>/dev/null || echo "0")
    echo "- **Commits ahead of $MAIN_BRANCH**: $COMMITS_AHEAD" >> "$OUTPUT_FILE"
    echo "- **Current commit**: $(git rev-parse --short HEAD)" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# ── Summary ──────────────────────────────────────────────────────────────

echo "## Summary" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Metrics captured ${MODE} refactoring at $(date)." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if [ "$MODE" = "after" ]; then
    echo "**Next Steps**:" >> "$OUTPUT_FILE"
    echo "1. Compare with metrics-before.md" >> "$OUTPUT_FILE"
    echo "2. Verify improvements achieved" >> "$OUTPUT_FILE"
    echo "3. Check no unexpected regressions" >> "$OUTPUT_FILE"
    echo "4. Document improvements in refactor-spec.md" >> "$OUTPUT_FILE"
fi

echo "---" >> "$OUTPUT_FILE"
echo "*Metrics captured using measure-metrics.sh*" >> "$OUTPUT_FILE"

echo ""
echo "Metrics saved to: $OUTPUT_FILE"
echo "Done!"
