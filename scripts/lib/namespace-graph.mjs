// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createHash } from 'node:crypto';
export { computeNamespaceGraph } from '../../packages/curated-schema/dist/index.js';

/**
 * Map a namespace to an R2-safe artifact-key slug. R2/wrangler reject keys
 * containing `..` (path-traversal guard), and leading/trailing dots are unsafe
 * as path segments. Rosetta namespaces are dot-separated identifiers, but the
 * upstream corpus isn't always clean — e.g. rune-fpml declares
 * `namespace fpml.consolidated.` (trailing dot), which would otherwise produce
 * `fpml.consolidated..json.gz`. Collapse repeated dots and strip edge dots.
 *
 * To stay INJECTIVE (rune-fpml declares BOTH `fpml.consolidated` AND
 * `fpml.consolidated.` as distinct namespaces, which would otherwise collide
 * onto one blob), when cleaning actually changes the string we append a short
 * stable hash of the ORIGINAL namespace. Clean namespaces — the overwhelming
 * majority — keep a readable, unchanged slug; only malformed ones get a suffix.
 *
 * This affects the artifact FILENAME/KEY only — the namespace identity (the
 * manifest's `namespaces` map key, used for closure + display) is preserved
 * verbatim by callers. Callers should still assert no two namespaces produce
 * the same slug and fail rather than silently overwrite.
 */
export function nsArtifactSlug(ns) {
  const cleaned = ns.replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '');
  if (cleaned === ns) return cleaned;
  const hash = createHash('sha256').update(ns).digest('hex').slice(0, 8);
  // If the namespace cleaned down to nothing (e.g. ns is "." / ".."), prefixing
  // with `${cleaned}.` would yield a leading dot — use the bare hash instead.
  return cleaned ? `${cleaned}.${hash}` : hash;
}
