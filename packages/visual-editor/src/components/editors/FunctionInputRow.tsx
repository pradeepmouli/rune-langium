// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * FunctionInputRow — read-only display row for a single Function input
 * parameter. Extracted from `FunctionForm.tsx` so it can be registered as
 * a `FormMeta.render` override against `AttributeSchema` (Phase 8 / US6 —
 * function inputs share `AttributeSchema` per `generated/zod-schemas.ts:640`).
 *
 * Renders: bullet handle | param name | type link | remove button.
 *
 * @module
 */

import { TypeLink } from './TypeLink.js';
import type { TypeOption, NavigateToNodeCallback } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FunctionInputRowProps {
  /** Display projection of the input — name + resolved type label. */
  member: { name: string; typeName?: string };
  /** Node ID of the parent function — forwarded to `onRemove`. */
  nodeId: string;
  /** Available type options (for symmetry with sibling rows; unused today). */
  availableTypes: TypeOption[];
  /** Remove this input parameter by name. */
  onRemove: (nodeId: string, paramName: string) => void;
  /** Whether the row is disabled. */
  disabled?: boolean;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function FunctionInputRow({
  member,
  nodeId,
  availableTypes: _availableTypes,
  onRemove,
  disabled = false,
  onNavigateToNode,
  allNodeIds
}: FunctionInputRowProps) {
  return (
    <div
      data-slot="input-param-row"
      className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50"
      role="listitem"
    >
      <span className="text-xs text-muted-foreground w-3" aria-hidden="true">
        ⠇
      </span>

      <span data-slot="param-name" className="text-sm font-medium min-w-20">
        {member.name || '(unnamed)'}
      </span>

      <TypeLink
        typeName={member.typeName ?? 'string'}
        onNavigateToNode={onNavigateToNode}
        allNodeIds={allNodeIds}
        className="text-xs text-muted-foreground"
      />

      <button
        data-slot="remove-param-btn"
        type="button"
        onClick={() => onRemove(nodeId, member.name)}
        disabled={disabled}
        className="ml-auto text-xs text-destructive hover:text-destructive/80
          disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`Remove input ${member.name}`}
      >
        ✕
      </button>
    </div>
  );
}

export { FunctionInputRow };
