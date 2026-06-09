// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * View overlay — the domain/view split point (Editable Domain Model, Phase 1).
 *
 * The generated domain object (langium-zod `XDomain`) is PURE SEMANTIC: it carries
 * no `position`/`errors`/`isReadOnly`/`namespace`. The view-only metadata the editor
 * needs lives here instead, keyed by node id (`qualifiedExportPath(namespace, name)`,
 * the dot-form qualified path), so a later phase can split `TypeGraphNode.data` into
 * `{ domain object } + { overlay }` without mixing view state into the round-trippable
 * domain model.
 *
 * `namespace` is intentionally NOT part of the overlay — it is identity-derived (part
 * of the node-id key), not a stored field.
 */

import type { ValidationError } from './types.js';

/** Pure view metadata for a single node (no domain/semantic fields). */
export interface ViewMetadata {
  /** Canvas position for the node. */
  position: { x: number; y: number };
  /** Validation errors attributed to the node (view concern, not domain). */
  errors: ValidationError[];
  /** Whether the node is read-only in the editor (e.g. a system/base-type node). */
  isReadOnly: boolean;
}

/** View overlay: view metadata keyed by node id (`namespace.name`, the dot-form qualified path). */
export type ViewOverlay = Record<string, ViewMetadata>;
