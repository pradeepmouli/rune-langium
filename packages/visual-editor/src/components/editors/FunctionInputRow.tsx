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

import { X } from 'lucide-react';
import { Button } from '@rune-langium/design-system/ui/button';
import { TypeLink } from './TypeLink.js';
import { useEditorActionsContext } from '../forms/sections/EditorActionsContext.js';
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
  const editorCtx = useEditorActionsContext();
  const effectiveReadOnly = Boolean(disabled || editorCtx?.readOnly);
  return (
    <div
      data-slot="input-param-row"
      className="flex items-center gap-1.5 p-1 rounded hover:bg-muted/50"
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

      {/* Icon-button replaces literal "✕" Unicode glyph. Mirrors the pattern
       * applied to AttributeRow / ChoiceOptionRow in the same commit batch —
       * lucide <X /> in a ghost icon-button, hover:text-destructive override
       * preserves the prior visual affordance. */}
      <Button
        data-slot="remove-param-btn"
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => onRemove(nodeId, member.name)}
        disabled={effectiveReadOnly}
        className="ml-auto shrink-0 text-destructive hover:text-destructive/80"
        aria-label={`Remove input ${member.name}`}
        title={`Remove input ${member.name}`}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

export { FunctionInputRow };
