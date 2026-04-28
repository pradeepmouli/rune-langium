// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeAliasForm — structured editor form for a TypeAlias node.
 *
 * Phase 5d / US3 of `013-z2f-editor-migration`. Applies the Phase-3
 * z2f template:
 *
 * - `useZodForm(RosettaTypeAliasSchema, …)` drives validation off the
 *   canonical AST schema (per R1). The graph node is passed straight
 *   into `defaultValues` (per R11) — no projection layer.
 * - `useExternalSync(form, data, identityProjection)` re-binds pristine
 *   field state when the host swaps to a different node (per R4). The
 *   projection is identity since the form consumes the AST shape
 *   directly.
 * - `<EditorActionsProvider>` wraps the form body so any
 *   declaratively-rendered section components (Phase 7 / US5) can
 *   derive their commit callbacks from `EditorFormActions` + `nodeId`
 *   without prop-drilling.
 * - `useAutoSave(commitFn, 500)` is preserved verbatim per R8 — the
 *   debounced rename action keeps its existing timing semantics.
 *
 * TypeAlias-specific surface:
 *   1. **Header**: editable name + "TypeAlias" badge.
 *   2. **Wrapped type** (the primary affordance): a `<TypeSelector>`
 *      bound to `typeCall.type` of the AST node. The `typeCall.arguments`
 *      path stays hidden (configured in `z2f.config.ts`).
 *
 * @module
 */

import { useCallback, useEffect, useState } from 'react';
import { FieldLegend, FieldSet } from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { TypeLink } from './TypeLink.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { ZodForm } from '@zod-to-form/react';
import { RosettaTypeAliasSchema } from '../../generated/zod-schemas.js';
import { identityProjection } from './identity-projection.js';
import type {
  AnyGraphNode,
  EditorFormActions,
  ExpressionEditorSlotProps,
  NavigateToNodeCallback,
  TypeOption
} from '../../types.js';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TypeAliasFormProps {
  /** Node ID of the TypeAlias being edited. */
  nodeId: string;
  /** Data payload for the selected type alias node (AnyGraphNode with $type='RosettaTypeAlias'). */
  data: AnyGraphNode;
  /** TypeAlias editor form action callbacks. */
  actions: EditorFormActions<'typeAlias'>;
  /** Available type options for the wrapped-type selector. */
  availableTypes?: TypeOption[];
  /** Optional render-prop for a rich expression editor (parity slot — unused for TypeAlias). */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TypeAliasForm({
  nodeId,
  data,
  actions,
  onNavigateToNode,
  allNodeIds
}: TypeAliasFormProps) {
  const [nameValue, setNameValue] = useState(() => data.name ?? '');
  const [currentTypeLabel, setCurrentTypeLabel] = useState(
    () => (data as { typeCall?: { type?: { $refText?: string } } }).typeCall?.type?.$refText ?? ''
  );

  useEffect(() => {
    setNameValue(data.name ?? '');
    setCurrentTypeLabel(
      (data as { typeCall?: { type?: { $refText?: string } } }).typeCall?.type?.$refText ?? ''
    );
  }, [data]);

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      if (newName && newName.trim() && newName !== data.name) {
        actions.renameType(nodeId, newName.trim());
      }
    },
    [actions, data.name, nodeId]
  );

  const debouncedName = useAutoSave(commitName, 500);

  // ---- Render --------------------------------------------------------------

  return (
    <div data-slot="type-alias-form" className="flex flex-col gap-4 p-4">
      <div data-slot="form-header" className="flex items-center gap-2">
        <Input
          value={nameValue}
          data-slot="type-name-input"
          onChange={(e) => {
            setNameValue(e.target.value);
            debouncedName(e.target.value);
          }}
          className="text-lg font-semibold bg-transparent border-b border-transparent
            focus-visible:border-input focus-visible:ring-0 shadow-none
            px-1 py-0.5 h-auto rounded-none"
          placeholder="Type alias name"
          aria-label="Type alias name"
        />
        <Badge variant="typeAlias">TypeAlias</Badge>
      </div>

      <FieldSet className="gap-1.5">
        <FieldLegend variant="label" className="mb-0 text-muted-foreground">
          Wrapped type
        </FieldLegend>
        {currentTypeLabel && (
          <TypeLink
            typeName={currentTypeLabel}
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
            className="text-sm font-mono mb-1"
          />
        )}
        <ZodForm
          key={nodeId}
          schema={RosettaTypeAliasSchema}
          defaultValues={identityProjection<typeof RosettaTypeAliasSchema>(data)}
          onValueChange={(values) => {
            const nextTypeLabel =
              (values as { typeCall?: { type?: { $refText?: string } } }).typeCall?.type
                ?.$refText ?? '';
            setCurrentTypeLabel(nextTypeLabel);
          }}
        />
      </FieldSet>
    </div>
  );
}

export { TypeAliasForm };
