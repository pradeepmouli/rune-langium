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

import { useCallback, useRef } from 'react';
import { FormProvider, Controller, useWatch } from 'react-hook-form';
import { Field, FieldError, FieldLegend, FieldSet } from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { TypeSelector } from './TypeSelector.js';
import { TypeLink } from './TypeLink.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { RosettaTypeAliasSchema } from '../../generated/zod-schemas.js';
import { EditorActionsProvider } from '../forms/sections/index.js';
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
  availableTypes = [],
  onNavigateToNode,
  allNodeIds
}: TypeAliasFormProps) {
  // ---- Form setup (useZodForm + upstream useExternalSync, R11 / R4) -------
  // Drive validation off the canonical AST schema; pass the graph node
  // straight into `defaultValues` (RosettaTypeAliasSchema is a
  // z.looseObject so any graph-only keys are accepted as extras).

  const { form } = useZodForm(RosettaTypeAliasSchema, {
    // RosettaTypeAliasSchema is z.looseObject — extra graph-only keys
    // are accepted as extras. `identityProjection` covers the typed gap
    // between the AnyGraphNode runtime shape and z2f's parameterised
    // `Partial<output<Schema>>` constraint.
    defaultValues: identityProjection<typeof RosettaTypeAliasSchema>(data),
    mode: 'onChange'
  });

  // Re-bind pristine field state when the caller swaps to a different node
  // (object identity is the contract). `keepDirty: true` preserves the
  // pre-migration `keepDirtyValues: true` semantics so in-flight user
  // edits are not stomped by a graph push.
  useExternalSync(form, data, identityProjection<typeof RosettaTypeAliasSchema>, {
    keepDirty: true
  });

  // Track committed (graph-confirmed) data for diffing
  const committedRef = useRef(data);
  committedRef.current = data;

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      if (newName && newName.trim() && newName !== committedRef.current.name) {
        actions.renameType(nodeId, newName.trim());
      }
    },
    [nodeId, actions]
  );

  const debouncedName = useAutoSave(commitName, 500);

  // ---- Wrapped-type selector (TypeAlias-specific primary affordance) ------
  //
  // Selecting a type updates the form's `typeCall.type` so subsequent
  // graph commits (and visual snapshot of the form) reflect the new
  // wrapped type. The graph-mutation surface for TypeAlias does not
  // expose a dedicated "set wrapped type" action today — the form-state
  // update is the visible behaviour. A future extension may funnel this
  // through a dedicated action without changing the JSX.

  const handleTypeSelect = useCallback(
    (value: string | null) => {
      const label = value ? (availableTypes.find((opt) => opt.value === value)?.label ?? '') : '';
      // Update the form's typeCall.type — RHF tolerates the looseObject
      // extras at the nested `type` key.
      form.setValue('typeCall.type' as never, { $refText: label } as never, { shouldDirty: true });
    },
    [availableTypes, form]
  );

  // ---- Resolve current wrapped-type for display ----------------------------
  //
  // Prefer the live form state so the selector reflects in-flight edits;
  // fall back to the AST node when the form has not yet observed the
  // typeCall path (initial render before any edit).

  const watchedTypeRef = useWatch({
    control: form.control,
    name: 'typeCall.type' as never
  }) as { $refText?: string } | undefined;
  const dataTypeRef = (data as { typeCall?: { type?: { $refText?: string } } }).typeCall?.type
    ?.$refText;
  const currentTypeLabel = watchedTypeRef?.$refText ?? dataTypeRef ?? '';
  const currentTypeValue = currentTypeLabel
    ? (availableTypes.find((opt) => opt.label === currentTypeLabel)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
    <EditorActionsProvider
      nodeId={nodeId}
      // EditorActionsContextValue holds the unparameterized
      // EditorFormActions (the full intersection) so any registered
      // section can call any method without per-kind narrowing. The
      // typeAlias surface only implements `CommonFormActions`; the
      // upcast is safe because section components only call methods
      // present on `CommonFormActions` (definition / comments /
      // synonyms / annotations / conditions).
      actions={actions as unknown as EditorFormActions}
    >
      <FormProvider {...form}>
        <div data-slot="type-alias-form" className="flex flex-col gap-4 p-4">
          {/* Header: Name + Badge */}
          <div data-slot="form-header" className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field className="flex-1">
                  <Input
                    {...field}
                    id={field.name}
                    data-slot="type-name-input"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      debouncedName(e.target.value);
                    }}
                    className="text-lg font-semibold bg-transparent border-b border-transparent
                      focus-visible:border-input focus-visible:ring-0 shadow-none
                      px-1 py-0.5 h-auto rounded-none"
                    placeholder="Type alias name"
                    aria-label="Type alias name"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Badge variant="typeAlias">TypeAlias</Badge>
          </div>

          {/* Wrapped type — the TypeAlias-specific primary affordance */}
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
            <TypeSelector
              value={currentTypeValue ?? ''}
              options={availableTypes}
              onSelect={handleTypeSelect}
              placeholder="Select wrapped type..."
            />
          </FieldSet>
        </div>
      </FormProvider>
    </EditorActionsProvider>
  );
}

export { TypeAliasForm };
