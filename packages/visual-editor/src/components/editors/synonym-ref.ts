// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared helper for resolving the `$refText` value to persist when a synonym
 * source is picked from `SourceRefField`.
 *
 * Rule (plan L15):
 * - A cross-namespace source (source.namespace ≠ host namespace) qualifies as
 *   `${ns}.${name}` (= `opt.value`, the canonical id) so render-core can
 *   resolve it without re-qualification.
 * - A local (same-namespace) or root source stays as the bare `opt.label`.
 *
 * @module
 */

import { splitNodeId } from '../../store/node-projection.js';
import type { SourceRefOption } from '../../types.js';

/**
 * Resolve the `$refText` to persist for a picked synonym source.
 *
 * @param opt - The matching `SourceRefOption` (undefined if canonical id
 *   not found in the options list — falls back to `fallback`).
 * @param hostNodeId - The graph node id of the host being edited, used to
 *   derive the host namespace. Pass `ctx?.nodeId`; `undefined` when no
 *   `EditorActionsContext` is in scope (falls back to root namespace '').
 * @param fallback - Value to use when `opt` is undefined (usually the raw
 *   `pendingSource` canonical id).
 */
export function resolveSynonymRefText(
  opt: SourceRefOption | undefined,
  hostNodeId: string | undefined,
  fallback: string
): string {
  const hostNs = hostNodeId ? splitNodeId(hostNodeId).namespace : '';
  return opt?.namespace && opt.namespace !== hostNs ? opt.value : (opt?.label ?? fallback);
}
