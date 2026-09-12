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
WRANGLER=(pnpm --filter @rune-langium/curated-mirror-worker exec wrangler)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

upload_object() {
  local key="$1" file="$2" content_type="$3"
  # Keep the complete error: tailing Wrangler output hid the cause of failed publications.
  "${WRANGLER[@]}" r2 object put "$BUCKET/$key" --file "$file" --content-type "$content_type" --remote
}

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
  langium_version=$(jq -er '.langiumVersion // error("Missing compiler version; rebuild artifacts")' "$meta_file")
  version=$(jq -r '.version' "$meta_file")
  sha256=$(jq -r '.sha256' "$meta_file")
  size_bytes=$(jq -r '.sizeBytes' "$meta_file")
  doc_count=$(jq -r '.documentCount' "$meta_file")

  # Upload versioned + latest artifact
  echo "  Uploading artifact ($size_bytes bytes, $doc_count documents)..."
  upload_object "curated/$model_id/artifacts/$version.serialized.json.gz" "$artifact_file" application/gzip
  upload_object "curated/$model_id/latest.serialized.json.gz" "$artifact_file" application/gzip

  # Upload per-namespace artifacts (if the ns/ dir was built)
  ns_dir="$model_dir/ns"
  if [[ -d "$ns_dir" ]]; then
    ns_count=0
    for ns_file in "$ns_dir"/*.json.gz; do
      [[ -e "$ns_file" ]] || continue  # guard: skip if glob matched nothing
      ns_name=$(basename "$ns_file")
      upload_object "curated/$model_id/artifacts/$version/ns/$ns_name" "$ns_file" application/gzip
      ns_count=$((ns_count + 1))
    done
    echo "  Uploaded $ns_count per-namespace artifact(s)"
  fi

  # Fetch current manifest, patch in the artifact reference + namespaces, re-upload
  echo "  Patching manifest.json..."
  manifest_url="$MIRROR_BASE/$model_id/manifest.json"
  current_manifest=$(curl -fsS "$manifest_url")

  manifest_file="$TMP_DIR/$model_id.json"
  echo "$current_manifest" | jq \
    --arg sha "$sha256" \
    --arg url "$MIRROR_BASE/$model_id/artifacts/$version.serialized.json.gz" \
    --arg langiumVersion "$langium_version" \
    --argjson size "$size_bytes" \
    --argjson docs "$doc_count" \
    --slurpfile meta "$meta_file" \
    '.artifacts.serializedWorkspace = {
      schemaVersion: 1,
      kind: "langium-json-serializer",
      url: $url,
      sha256: $sha,
      sizeBytes: $size,
      documentCount: $docs,
      langiumVersion: $langiumVersion
    } |
    if (($meta[0].namespaces // {}) | length) > 0 then
      .schemaVersion = 2 | .namespaces = $meta[0].namespaces
    else . end' > "$manifest_file"

  upload_object "curated/$model_id/manifest.json" "$manifest_file" 'application/json; charset=utf-8'

  echo "  ✓ Done"
done

echo ""
echo "All artifacts uploaded."
