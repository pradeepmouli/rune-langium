// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * EnumForm — structured editor form for an Enumeration node.
 *
 * Uses react-hook-form `FormProvider` so nested components (EnumValueRow,
 * declarative section components) can access form state via
 * `useFormContext`. `useFieldArray` manages the `enumValues` list with
 * stable keys for add/remove/reorder without stale-closure bugs.
 *
 * Per R11 of `specs/013-z2f-editor-migration/research.md`, the form is
 * driven directly by the langium-generated `RosettaEnumerationSchema`
 * (`z.looseObject`). The graph node IS already AST-shaped, so it is
 * passed straight into `defaultValues` and `useExternalSync` uses an
 * identity projection.
 *
 * Sections (Annotations, Metadata) render declaratively via the typed
 * config + `componentModule` lookup (Phase 7 / US5). The
 * `<EditorActionsProvider>` wrapper bridges those section components
 * back to `EditorFormActions` + `nodeId`.
 *
 * Sections:
 * 1. Header: editable name + "Enum" green badge
 * 2. Parent enum: TypeSelector (filtered to kind='enum', clearable)
 * 3. Enum values: EnumValueRow list + "Add Value" button
 * 4. Annotations + Metadata: rendered declaratively via `<ZodForm>` shell
 *
 * @module
 */

import { useCallback, useMemo, useRef } from 'react';
import { FormProvider, Controller, useFieldArray, type Control } from 'react-hook-form';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet
} from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { EnumValueRow, InheritedEnumValueRow } from './EnumValueRow.js';
import { TypeSelector } from './TypeSelector.js';
import { useEffectiveMembers } from '../../hooks/useInheritedMembers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { RosettaEnumerationSchema } from '../../generated/zod-schemas.js';
import { formRegistry } from '../forms/rows/index.js';
import { identityProjection } from './identity-projection.js';
import { getRefText } from '../../adapters/model-helpers.js';
import { TypeLink } from './TypeLink.js';
import { AnnotationSection } from './AnnotationSection.js';
import { MetadataSection } from './MetadataSection.js';
import { EditorActionsProvider } from '../forms/sections/EditorActionsContext.js';
import type {
  AnyGraphNode,
  TypeOption,
  TypeGraphNode,
  EditorFormActions,
  NavigateToNodeCallback
} from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnumFormProps {
  /** Node ID of the Enum being edited. */
  nodeId: string;
  /** Data payload for the selected enum node (AnyGraphNode with $type='RosettaEnumeration'). */
  data: AnyGraphNode;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Enum-specific editor form action callbacks. */
  actions: EditorFormActions<'enum'>;
  /** All graph nodes for inherited member resolution. */
  allNodes?: TypeGraphNode[];
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumForm({
  nodeId,
  data,
  availableTypes,
  actions,
  allNodes = [],
  onNavigateToNode,
  allNodeIds
}: EnumFormProps) {
  const d = data as any;
  // ---- Form setup (R11: AST schema + identity projection) -----------------
  // RosettaEnumerationSchema is `z.looseObject`, so the graph node passes
  // through `defaultValues` without a projection layer. The bespoke
  // <EnumValueRow> reads `enumValues.${index}.{name,display}` paths.
  // Phase 8 (US6) wires the row as a custom renderer via formRegistry.

  const { form } = useZodForm(RosettaEnumerationSchema, {
    // The graph node is a union (`AnyGraphNode`); the host narrows by
    // `$type` upstream. `identityProjection` covers the typed gap between
    // the discriminated union and z2f's `Partial<output<Schema>>` constraint.
    defaultValues: identityProjection<typeof RosettaEnumerationSchema>(data),
    mode: 'onChange',
    formRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different node
  // (object identity is the contract). `keepDirty: true` preserves the
  // pre-migration `keepDirtyValues: true` semantics. Identity projection
  // per R11 — the graph node IS already AST-shaped.
  useExternalSync(form, data, identityProjection<typeof RosettaEnumerationSchema>, {
    keepDirty: true
  });

  // The bespoke <EnumValueRow> reads `enumValues.${index}.{name,display}`
  // paths against the AST schema. Widen the control type so useFieldArray
  // accepts the lazily-typed array key (RosettaEnumerationSchema's enumValues
  // is `optional` in the inferred output, which collapses to `never` here).
  const { fields, append, remove, move } = useFieldArray({
    control: form.control as unknown as Control<{
      enumValues: { $type?: string; name: string; display?: string }[];
    }>,
    name: 'enumValues'
  });

  // Track the committed (graph-confirmed) data for diffing
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

  // ---- Parent enum ---------------------------------------------------------

  const handleParentSelect = useCallback(
    (value: string | null) => {
      actions.setEnumParent(nodeId, value);
    },
    [nodeId, actions]
  );

  // ---- Enum value actions --------------------------------------------------

  const handleOverrideInheritedValue = useCallback(
    (name: string, displayName: string) => {
      append({ $type: 'RosettaEnumValue', name, display: displayName } as any);
      actions.addEnumValue(nodeId, name, displayName || undefined);
    },
    [nodeId, actions, append]
  );

  const handleAddValue = useCallback(() => {
    append({ $type: 'RosettaEnumValue', name: '', display: '' } as any);
    actions.addEnumValue(nodeId, '', undefined);
  }, [nodeId, actions, append]);

  const handleRemoveValue = useCallback(
    (i: number) => {
      const enumValues = (committedRef.current as any).enumValues ?? [];
      const committed = enumValues[i];
      if (committed) {
        remove(i);
        actions.removeEnumValue(nodeId, committed.name);
      }
    },
    [nodeId, actions, remove]
  );

  const handleReorderValue = useCallback(
    (fromIndex: number, toIndex: number) => {
      move(fromIndex, toIndex);
      actions.reorderEnumValue(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions, move]
  );

  const handleUpdateValue = useCallback(
    (_nodeId: string, oldName: string, newName: string, displayName?: string) => {
      actions.updateEnumValue(nodeId, oldName, newName, displayName);
    },
    [nodeId, actions]
  );

  const handleRevertEnumOverride = useCallback(
    (valueName: string) => {
      const fieldIdx = fields.findIndex((f: any) => f.name === valueName);
      if (fieldIdx >= 0) {
        remove(fieldIdx);
        actions.removeEnumValue(nodeId, valueName);
      }
    },
    [nodeId, actions, fields, remove]
  );

  // ---- Effective members (local + inherited) -------------------------------

  const parentName = getRefText(d.parent);
  const { effective: effectiveValues } = useEffectiveMembers(data, allNodes);
  const inheritedCount = effectiveValues.filter((e) => e.source === 'inherited').length;

  // ---- Resolve parent enum option ------------------------------------------

  const parentOptions = availableTypes.filter((opt) => opt.kind === 'enum' && opt.label !== d.name);

  const parentValue = parentName
    ? (availableTypes.find((opt) => opt.label === parentName)?.value ?? null)
    : null;

  // ---- Editor actions context (Phase 7 / US5) ------------------------------
  // Bridges declarative section components (Annotations, Metadata) to the
  // host's `EditorFormActions` + `nodeId`. The intersection-typed context
  // accepts the enum-kind action set without narrowing.

  const editorActionsValue = useMemo(
    () => ({ nodeId, actions: actions as unknown as EditorFormActions }),
    [nodeId, actions]
  );

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <EditorActionsProvider {...editorActionsValue}>
        <div data-slot="enum-form" className="flex flex-col gap-4 p-4">
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
                    placeholder="Enum name"
                    aria-label="Enum type name"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Badge variant="enum">Enum</Badge>
          </div>

          {/* Parent Enum */}
          <FieldSet className="gap-1.5">
            <FieldLegend variant="label" className="mb-0 text-muted-foreground">
              Extends
            </FieldLegend>
            {parentName && (
              <TypeLink
                typeName={parentName}
                onNavigateToNode={onNavigateToNode}
                allNodeIds={allNodeIds}
                className="text-sm font-mono mb-1"
              />
            )}
            <TypeSelector
              value={parentValue ?? ''}
              options={parentOptions}
              onSelect={handleParentSelect}
              placeholder="Select parent enum..."
              allowClear
            />
          </FieldSet>

          {/* Enum Values */}
          <FieldSet className="gap-1">
            <FieldLegend
              variant="label"
              className="mb-0 text-muted-foreground flex items-center justify-between"
            >
              <span>Values ({fields.length + inheritedCount})</span>
              <button
                data-slot="add-value-btn"
                type="button"
                onClick={handleAddValue}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary
                  border border-border rounded px-2 py-0.5
                  hover:bg-card hover:border-input transition-colors"
              >
                + Add Value
              </button>
            </FieldLegend>

            <FieldGroup className="gap-0.5">
              {effectiveValues.map((entry) =>
                entry.source === 'local' ? (
                  <EnumValueRow
                    key={entry.id}
                    index={entry.fieldIndex!}
                    name={
                      ((committedRef.current as any).enumValues ?? [])[entry.fieldIndex!]?.name ??
                      ''
                    }
                    displayName={
                      ((committedRef.current as any).enumValues ?? [])[entry.fieldIndex!]
                        ?.display ?? ''
                    }
                    nodeId={nodeId}
                    onUpdate={handleUpdateValue}
                    onRemove={() => handleRemoveValue(entry.fieldIndex!)}
                    onReorder={handleReorderValue}
                    isOverride={entry.isOverride}
                    onRevert={
                      entry.isOverride ? () => handleRevertEnumOverride(entry.name) : undefined
                    }
                  />
                ) : (
                  <InheritedEnumValueRow
                    key={entry.id}
                    name={entry.name}
                    displayName={entry.displayName}
                    ancestorName={entry.ancestorName!}
                    onOverride={() =>
                      handleOverrideInheritedValue(entry.name, entry.displayName ?? '')
                    }
                  />
                )
              )}

              {effectiveValues.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No values defined. Click &quot;+ Add Value&quot; to create one.
                </p>
              )}
            </FieldGroup>
          </FieldSet>

          {/* Annotations + Metadata sections — declarative path (Phase 7).
              Section components read field paths via useFormContext and pull
              callbacks from the EditorActionsProvider above. No imperative
              wiring needed at this site. */}
          <AnnotationSection />
          <MetadataSection />
        </div>
      </EditorActionsProvider>
    </FormProvider>
  );
}

export { EnumForm };
