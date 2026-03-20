#!/usr/bin/env bash
# Add SPDX license headers to all .ts and .tsx source files.
# - packages/ → MIT
# - apps/studio/ → FSL-1.1-ALv2
#
# Usage: bash scripts/add-license-headers.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

MIT_HEADER="// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli"

FSL_HEADER="// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli"

add_header() {
  local file="$1"
  local header="$2"
  local label="$3"

  # Skip if already has SPDX header
  if head -3 "$file" | grep -q "SPDX-License-Identifier"; then
    return
  fi

  # Skip generated/declaration files
  if [[ "$file" == *.d.ts ]]; then
    return
  fi

  # Skip node_modules and dist
  if [[ "$file" == *node_modules* ]] || [[ "$file" == *dist/* ]] || [[ "$file" == *build/* ]]; then
    return
  fi

  if $DRY_RUN; then
    echo "[DRY RUN] Would add $label header to: $file"
  else
    # Create temp file with header + original content
    local tmp
    tmp=$(mktemp)
    printf '%s\n\n' "$header" > "$tmp"
    cat "$file" >> "$tmp"
    mv "$tmp" "$file"
    echo "Added $label header to: $file"
  fi
}

ADDED=0

# MIT headers for packages/
while IFS= read -r -d '' file; do
  add_header "$file" "$MIT_HEADER" "MIT"
  ADDED=$((ADDED + 1))
done < <(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/generated/*' \
  -not -path '*/.d.ts' \
  -not -name '*.d.ts' \
  -print0)

# FSL headers for apps/studio/
while IFS= read -r -d '' file; do
  add_header "$file" "$FSL_HEADER" "FSL-1.1-ALv2"
  ADDED=$((ADDED + 1))
done < <(find apps/studio -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -name '*.d.ts' \
  -print0)

echo ""
echo "Processed $ADDED files."
