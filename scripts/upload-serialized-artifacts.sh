#!/usr/bin/env bash
# SPDX-License-Identifier: FSL-1.1-ALv2
# Copyright (c) 2026 Pradeep Mouli
#
# Upload pre-built serialized artifacts to the curated-mirror R2 bucket
# and patch each model's manifest.json to include the artifact reference.
#
# Prerequisites:
#   - dist/curated-artifacts/<modelId>/latest.serialized.json.gz
#   - dist/curated-artifacts/<modelId>/artifact-meta.json
#   - CLOUDFLARE_API_TOKEN env var (or wrangler login)
#
# Usage:
#   bash scripts/upload-serialized-artifacts.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUCKET="rune-curated-mirror"
MIRROR_BASE="https://www.daikonic.dev/curated"
ARTIFACT_DIR="$REPO_ROOT/dist/curated-artifacts"
WRANGLER="pnpm --filter @rune-langium/curated-mirror-worker exec wrangler"

for model_dir in "$ARTIFACT_DIR"/*/; do
  model_id=$(basename "$model_dir")
  artifact_file="$model_dir/latest.serialized.json.gz"
  meta_file="$model_dir/artifact-meta.json"

  if [[ ! -f "$artifact_file" || ! -f "$meta_file" ]]; then
    echo "⚠ Skipping $model_id: missing artifact or meta file"
    continue
  fi

  echo "=== $model_id ==="

  # Read metadata
  version=$(jq -r '.version' "$meta_file")
  sha256=$(jq -r '.sha256' "$meta_file")
  size_bytes=$(jq -r '.sizeBytes' "$meta_file")
  doc_count=$(jq -r '.documentCount' "$meta_file")

  # Upload versioned + latest artifact
  echo "  Uploading artifact ($size_bytes bytes, $doc_count documents)..."
  $WRANGLER r2 object put "$BUCKET/curated/$model_id/artifacts/$version.serialized.json.gz" \
    --file "$artifact_file" --content-type "application/gzip" --remote 2>&1 | tail -1
  $WRANGLER r2 object put "$BUCKET/curated/$model_id/latest.serialized.json.gz" \
    --file "$artifact_file" --content-type "application/gzip" --remote 2>&1 | tail -1

  # Upload per-namespace artifacts (if the ns/ dir was built)
  ns_dir="$model_dir/ns"
  if [[ -d "$ns_dir" ]]; then
    ns_count=0
    for ns_file in "$ns_dir"/*.json.gz; do
      [[ -e "$ns_file" ]] || continue  # guard: skip if glob matched nothing
      ns_name=$(basename "$ns_file")
      $WRANGLER r2 object put "$BUCKET/curated/$model_id/artifacts/$version/ns/$ns_name" \
        --file "$ns_file" --content-type "application/gzip" --remote 2>&1 | tail -1
      ns_count=$((ns_count + 1))
    done
    echo "  Uploaded $ns_count per-namespace artifact(s)"
  fi

  # Fetch current manifest, patch in the artifact reference + namespaces, re-upload
  echo "  Patching manifest.json..."
  manifest_url="$MIRROR_BASE/$model_id/manifest.json"
  current_manifest=$(curl -sf "$manifest_url" || echo '{}')

  if [[ "$current_manifest" == '{}' ]]; then
    echo "  ⚠ Could not fetch manifest for $model_id — skipping manifest patch"
    continue
  fi

  ns_count=$(jq -r '(.namespaces // {}) | length' "$meta_file")

  if [[ "$ns_count" -gt 0 ]]; then
    namespaces=$(jq -c '.namespaces' "$meta_file")
    patched_manifest=$(echo "$current_manifest" | jq \
      --arg sha "$sha256" \
      --arg url "$MIRROR_BASE/$model_id/latest.serialized.json.gz" \
      --argjson size "$size_bytes" \
      --argjson docs "$doc_count" \
      --argjson ns "$namespaces" \
      '.schemaVersion = 2 |
      .artifacts.serializedWorkspace = {
        schemaVersion: 1,
        kind: "langium-json-serializer",
        url: $url,
        sha256: $sha,
        sizeBytes: $size,
        documentCount: $docs,
        langiumVersion: "4.2.2"
      } |
      .namespaces = $ns')
  else
    patched_manifest=$(echo "$current_manifest" | jq \
      --arg sha "$sha256" \
      --arg url "$MIRROR_BASE/$model_id/latest.serialized.json.gz" \
      --argjson size "$size_bytes" \
      --argjson docs "$doc_count" \
      '.artifacts.serializedWorkspace = {
        schemaVersion: 1,
        kind: "langium-json-serializer",
        url: $url,
        sha256: $sha,
        sizeBytes: $size,
        documentCount: $docs,
        langiumVersion: "4.2.2"
      }')
  fi

  echo "$patched_manifest" > /tmp/patched-manifest-$model_id.json
  $WRANGLER r2 object put "$BUCKET/curated/$model_id/manifest.json" \
    --file "/tmp/patched-manifest-$model_id.json" \
    --content-type "application/json; charset=utf-8" --remote 2>&1 | tail -1
  rm -f "/tmp/patched-manifest-$model_id.json"

  echo "  ✓ Done"
done

echo ""
echo "All artifacts uploaded."
