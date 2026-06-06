// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The canonical Langium scope key for a top-level exported element:
 * `${namespace}.${name}`. Namespaces are dot-joined identifiers and element
 * names are dotless (grammar `ValidID`), so the result is injective and the
 * last dot separates namespace from name. An empty namespace yields the bare
 * name (no leading dot).
 *
 * This is the single source of truth for the dot qualified name. (The
 * visual-editor's `::` node id is a SEPARATE convention, retired in a later
 * phase — do not couple to it here.)
 */
export function qualifiedExportPath(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}
