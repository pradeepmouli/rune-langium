#!/usr/bin/env bash
# scripts/update-fixtures.sh
# Refresh vendored CDM and rune-dsl fixture snapshots.
#
# Usage:
#   ./scripts/update-fixtures.sh [--cdm-tag TAG] [--rune-tag TAG] [--fpml-tag TAG]
#
# Defaults:
#   CDM tag:     7.0.0-dev.83
#   Rune tag:    9.76.2
#   Rune FpML:   main
#
# These fixtures are used for conformance and grammar parity tests.
# They are excluded from the published npm package via package.json "files".
set -euo pipefail

CDM_REPO="https://github.com/finos/common-domain-model.git"
RUNE_REPO="https://github.com/finos/rune-dsl.git"
FPML_REPO="https://github.com/rosetta-models/rune-fpml.git"

CDM_TAG="7.0.0-dev.83"
RUNE_TAG="9.76.2"
FPML_TAG="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdm-tag) CDM_TAG="$2"; shift 2 ;;
    --rune-tag) RUNE_TAG="$2"; shift 2 ;;
    --fpml-tag) FPML_TAG="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$ROOT_DIR/.resources"

resolve_clone_ref() {
  local repo="$1"
  local requested_ref="$2"
  local target_dir="$3"

  local candidates=("$requested_ref")
  if [[ "$requested_ref" != v* ]]; then
    candidates+=("v$requested_ref")
  fi

  for ref in "${candidates[@]}"; do
    rm -rf "$target_dir"
    if git clone --depth 1 --branch "$ref" --single-branch --filter=blob:none "$repo" "$target_dir" 2>/dev/null; then
      echo "$ref"
      return 0
    fi
  done

  return 1
}

echo "=== Updating vendored fixtures ==="
echo "CDM tag:  $CDM_TAG"
echo "Rune tag: $RUNE_TAG"
echo "FpML ref: $FPML_TAG"

# --- CDM corpus ---
CDM_DIR="$FIXTURES_DIR/cdm"
echo ""
echo "--- Fetching CDM corpus ($CDM_TAG) ---"

TMP_CDM="$(mktemp -d)"
trap 'rm -rf "$TMP_CDM"' EXIT

CDM_RESOLVED_REF="$(resolve_clone_ref "$CDM_REPO" "$CDM_TAG" "$TMP_CDM/cdm")" || {
  echo "Failed to clone CDM repo at ref $CDM_TAG"
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

RUNE_RESOLVED_REF="$(resolve_clone_ref "$RUNE_REPO" "$RUNE_TAG" "$TMP_RUNE/rune-dsl")" || {
  echo "Failed to clone rune-dsl repo at ref $RUNE_TAG"
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

# --- Rune FpML imported model ---
FPML_DIR="$FIXTURES_DIR/rune-fpml"
echo ""
echo "--- Fetching Rune FpML model ($FPML_TAG) ---"

TMP_FPML="$(mktemp -d)"
trap 'rm -rf "$TMP_CDM" "$TMP_RUNE" "$TMP_FPML"' EXIT

FPML_RESOLVED_REF="$(resolve_clone_ref "$FPML_REPO" "$FPML_TAG" "$TMP_FPML/rune-fpml")" || {
  echo "Failed to clone rune-fpml repo at ref $FPML_TAG"
  exit 1
}

rm -rf "$FPML_DIR"
mkdir -p "$FPML_DIR"

find "$TMP_FPML/rune-fpml" -name "*.rosetta" -exec cp {} "$FPML_DIR/" \;

FPML_COUNT=$(find "$FPML_DIR" -name "*.rosetta" | wc -l | tr -d ' ')
echo "  Copied $FPML_COUNT .rosetta files to $FPML_DIR"

# Write version marker
echo "$FPML_TAG" > "$FPML_DIR/.version"

echo ""
echo "=== Fixture update complete ==="
echo "  CDM:       $CDM_COUNT files (ref $CDM_RESOLVED_REF)"
echo "  Rune DSL:  $RUNE_COUNT files (ref $RUNE_RESOLVED_REF)"
echo "  Rune FpML: $FPML_COUNT files (ref $FPML_RESOLVED_REF)"
