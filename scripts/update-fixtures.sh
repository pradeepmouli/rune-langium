#!/usr/bin/env bash
# scripts/update-fixtures.sh
# Refresh vendored CDM and rune-dsl fixture snapshots.
#
# Usage:
#   ./scripts/update-fixtures.sh [--cdm-tag TAG] [--rune-tag TAG]
#
# Defaults:
#   CDM tag:     v6.0.0-dev.83
#   Rune tag:    v11.31.0
#
# These fixtures are used for conformance and grammar parity tests.
# They are excluded from the published npm package via package.json "files".
set -euo pipefail

CDM_REPO="https://github.com/finos/common-domain-model.git"
RUNE_REPO="https://github.com/finos/rune-dsl.git"

CDM_TAG="7.0.0-dev.83"
RUNE_TAG="9.76.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdm-tag) CDM_TAG="$2"; shift 2 ;;
    --rune-tag) RUNE_TAG="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$ROOT_DIR/.resources"

echo "=== Updating vendored fixtures ==="
echo "CDM tag:  $CDM_TAG"
echo "Rune tag: $RUNE_TAG"

# --- CDM corpus ---
CDM_DIR="$FIXTURES_DIR/cdm"
echo ""
echo "--- Fetching CDM corpus ($CDM_TAG) ---"

TMP_CDM="$(mktemp -d)"
trap 'rm -rf "$TMP_CDM"' EXIT

git clone --depth 1 --branch "$CDM_TAG" --single-branch --filter=blob:none "$CDM_REPO" "$TMP_CDM/cdm" 2>/dev/null || {
  echo "Failed to clone CDM repo at tag $CDM_TAG"
  exit 1
}

rm -rf "$CDM_DIR"
mkdir -p "$CDM_DIR"

if [[ -d "$TMP_CDM/cdm/rosetta-source/src/main/rosetta" ]]; then
  find "$TMP_CDM/cdm/rosetta-source/src/main/rosetta" -name "*.rosetta" -exec cp {} "$CDM_DIR/" \;
fi

CDM_COUNT=$(find "$CDM_DIR" -name "*.rosetta" | wc -l | tr -d ' ')
echo "  Copied $CDM_COUNT .rosetta files to $CDM_DIR"

# Write version marker
echo "$CDM_TAG" > "$CDM_DIR/.version"

# --- Rune DSL built-in types ---
RUNE_DIR="$FIXTURES_DIR/rune-dsl"
echo ""
echo "--- Fetching Rune DSL built-in types ($RUNE_TAG) ---"

TMP_RUNE="$(mktemp -d)"
trap 'rm -rf "$TMP_CDM" "$TMP_RUNE"' EXIT

git clone --depth 1 --branch "$RUNE_TAG" --single-branch --filter=blob:none "$RUNE_REPO" "$TMP_RUNE/rune-dsl" 2>/dev/null || {
  echo "Failed to clone rune-dsl repo at tag $RUNE_TAG"
  exit 1
}

rm -rf "$RUNE_DIR"
mkdir -p "$RUNE_DIR"

if [[ -d "$TMP_RUNE/rune-dsl/rune-runtime/src/main/resources/model" ]]; then
  find "$TMP_RUNE/rune-dsl/rune-runtime/src/main/resources/model" -name "*.rosetta" -exec cp {} "$RUNE_DIR/" \;
fi

RUNE_COUNT=$(find "$RUNE_DIR" -name "*.rosetta" | wc -l | tr -d ' ')
echo "  Copied $RUNE_COUNT .rosetta files to $RUNE_DIR"

# Write version marker
echo "$RUNE_TAG" > "$RUNE_DIR/.version"

echo ""
echo "=== Fixture update complete ==="
echo "  CDM:       $CDM_COUNT files (tag $CDM_TAG)"
echo "  Rune DSL:  $RUNE_COUNT files (tag $RUNE_TAG)"
