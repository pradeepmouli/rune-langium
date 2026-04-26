// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * DataTypeForm — structured editor form for a Data type node.
 *
 * Uses react-hook-form `FormProvider` so nested components (AttributeRow,
 * MetadataSection) can access form state via `useFormContext`.
 * `useFieldArray` manages the members list with stable keys for
 * add/remove/reorder without stale-closure bugs.
 *
 * Sections:
 * 1. Header: editable name + "Data" blue badge
 * 2. Inheritance: TypeSelector for parent type (clearable)
 * 3. Attributes: AttributeRow list via useFieldArray + "Add Attribute" button
 * 4. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useCallback, useMemo, useRef } from 'react';
import { FormProvider, Controller, useFieldArray, type Control } from 'react-hook-form';
import type { GhostRow, GhostRowContext } from '@zod-to-form/core';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet
} from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { AttributeRow } from './AttributeRow.js';
import { InheritedAttributeRow } from './AttributeRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useEffectiveMembers } from '../../hooks/useInheritedMembers.js';
import { AnnotationSection } from './AnnotationSection.js';
import { ConditionSection } from './ConditionSection.js';
import {
  formatCardinality,
  getTypeRefText,
  getRefText,
  classExprSynonymsToStrings,
  type ConditionDisplayInfo
} from '../../adapters/model-helpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { z } from 'zod';
import { DataSchema } from '../../generated/zod-schemas.js';
import { formRegistry } from '../forms/rows/index.js';
import { TypeLink } from './TypeLink.js';
import type {
  AnyGraphNode,
  TypeGraphNode,
  TypeOption,
  EditorFormActions,
  ExpressionEditorSlotProps,
  NavigateToNodeCallback
} from '../../types.js';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Default-values projection
// ---------------------------------------------------------------------------

/**
 * Build the form's default values from an AST-shaped graph node.
 *
 * Per R11 of `specs/013-z2f-editor-migration/research.md`, the form is now
 * driven directly by `DataSchema` from the langium-generated AST. Because
 * `DataSchema` is a `z.looseObject`, extra keys (`members`, `parentName`,
 * `definition`, `comments`, `synonyms`) are accepted without runtime cost.
 *
 * The `members[]` projection still exists because the bespoke
 * `<AttributeRow>` reads `members.${index}.{name,typeName,cardinality,
 * isOverride}` paths from form context. Phase 8 (US6) registered the row
 * components against the AST item schemas via
 * `packages/visual-editor/src/components/forms/rows/index.tsx` — so the
 * `FormMeta.render` slot is wired — but the row components themselves
 * still bind to projection paths to keep their existing test surface
 * stable. A follow-up will migrate the rows onto AST paths
 * (`attributes.${i}.typeCall.type` etc.), at which point this projection
 * collapses to a pass-through and the `members`/`parentName` keys
 * disappear.
 */
function toDefaults(data: AnyGraphNode) {
  const d = data as any;
  return {
    ...d,
    parentName: getRefText(d.superType) ?? '',
    members: (d.attributes ?? []).map((a: any) => ({
      name: a.name ?? '',
      typeName: getTypeRefText(a.typeCall) ?? 'string',
      cardinality: formatCardinality(a.card) || '(1..1)',
      isOverride: a.override ?? false,
      displayName: a.name ?? ''
    })),
    definition: d.definition ?? '',
    comments: d.comments ?? '',
    synonyms: classExprSynonymsToStrings(d.synonyms)
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DataTypeFormProps {
  /** Node ID of the Data type being edited. */
  nodeId: string;
  /** Data payload for the selected node (AnyGraphNode with $type='Data'). */
  data: AnyGraphNode;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Data-specific editor form action callbacks. */
  actions: EditorFormActions<'data'>;
  /** All graph nodes (for inherited member resolution via useEffectiveMembers). */
  allNodes?: TypeGraphNode[];
  /** Optional render-prop for a rich expression editor. */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DataTypeForm({
  nodeId,
  data,
  availableTypes,
  actions,
  allNodes = [],
  renderExpressionEditor,
  onNavigateToNode,
  allNodeIds
}: DataTypeFormProps) {
  // ---- Form setup (useZodForm + useExternalSync per R11 / R4) -------------
  // Drive validation off the canonical AST schema; pass the graph node
  // straight into `defaultValues` (DataSchema is a z.looseObject so the
  // form-only projection keys are accepted as extras).

  const { form } = useZodForm(DataSchema, {
    // DataSchema is z.looseObject — extra projection keys (members,
    // parentName, definition, comments, synonyms) are allowed.
    // The `as` cast covers the typed gap until the row renderers move
    // off the projection paths (`members.${i}.*`) onto AST paths
    // (`attributes.${i}.typeCall.type` etc.). The Phase-8 (US6) registry
    // registration in `forms/rows/index.tsx` is the FormMeta-render
    // input the form host walks; the manual `.map(<AttributeRow/>)`
    // below stays in place until that path migration ships.
    defaultValues: toDefaults(data) as Partial<z.output<typeof DataSchema>>,
    mode: 'onChange',
    formRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different node
  // (object identity is the contract). `keepDirty: true` preserves the
  // pre-migration `keepDirtyValues: true` semantics so in-flight user edits
  // are not stomped by a graph push.
  useExternalSync(form, data, toDefaults as (n: typeof data) => z.output<typeof DataSchema>, {
    keepDirty: true
  });

  // The bespoke <AttributeRow> reads `members.${index}.*` paths today.
  // Until Phase 8 (R11) refactors it to AST paths (`attributes.${index}.*`),
  // we widen the control type so useFieldArray accepts the projection key.
  const { fields, append, remove, move } = useFieldArray({
    control: form.control as unknown as Control<{
      members: { name: string; typeName: string; cardinality: string; isOverride?: boolean }[];
    }>,
    name: 'members'
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

  // ---- Inheritance ---------------------------------------------------------

  const handleParentSelect = useCallback(
    (value: string | null) => {
      const label = value ? (availableTypes.find((o) => o.value === value)?.label ?? '') : '';
      form.setValue('parentName', label, { shouldDirty: true });
      actions.setInheritance(nodeId, value);
    },
    [nodeId, actions, availableTypes, form]
  );

  // ---- Attribute actions ---------------------------------------------------

  const handleOverrideInherited = useCallback(
    (attr: { name: string; typeName: string; cardinality: string }) => {
      append({
        name: attr.name,
        typeName: attr.typeName,
        cardinality: attr.cardinality,
        isOverride: false
      });
      actions.addAttribute(nodeId, attr.name, attr.typeName, attr.cardinality);
    },
    [nodeId, actions, append]
  );

  const handleRevertOverride = useCallback(
    (attrName: string) => {
      const fieldIdx = fields.findIndex((f) => f.name === attrName);
      if (fieldIdx >= 0) {
        remove(fieldIdx);
        actions.removeAttribute(nodeId, attrName);
      }
    },
    [nodeId, actions, fields, remove]
  );

  const handleAddAttribute = useCallback(() => {
    append({ name: '', typeName: 'string', cardinality: '(1..1)', isOverride: false });
    actions.addAttribute(nodeId, '', 'string', '(1..1)');
  }, [nodeId, actions, append]);

  const handleRemoveAttribute = useCallback(
    (index: number) => {
      const attrs = (committedRef.current as any).attributes ?? [];
      const committed = attrs[index];
      if (committed) {
        remove(index);
        actions.removeAttribute(nodeId, committed.name);
      }
    },
    [nodeId, actions, remove]
  );

  const handleReorderAttribute = useCallback(
    (fromIndex: number, toIndex: number) => {
      move(fromIndex, toIndex);
      actions.reorderAttribute(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions, move]
  );

  const handleUpdateAttribute = useCallback(
    (_index: number, oldName: string, newName: string, typeName: string, cardinality: string) => {
      actions.updateAttribute(nodeId, oldName, newName, typeName, cardinality);
    },
    [nodeId, actions]
  );

  // ---- Metadata callbacks --------------------------------------------------

  const commitDefinition = useCallback(
    (def: string) => {
      actions.updateDefinition(nodeId, def);
    },
    [nodeId, actions]
  );

  const commitComments = useCallback(
    (comments: string) => {
      actions.updateComments(nodeId, comments);
    },
    [nodeId, actions]
  );

  const handleAddSynonym = useCallback(
    (synonym: string) => {
      actions.addSynonym(nodeId, synonym);
    },
    [nodeId, actions]
  );

  const handleRemoveSynonym = useCallback(
    (index: number) => {
      actions.removeSynonym(nodeId, index);
    },
    [nodeId, actions]
  );

  // ---- Annotation callbacks ------------------------------------------------

  const handleAddAnnotation = useCallback(
    (annotationName: string) => {
      actions.addAnnotation(nodeId, annotationName);
    },
    [nodeId, actions]
  );

  const handleRemoveAnnotation = useCallback(
    (index: number) => {
      actions.removeAnnotation(nodeId, index);
    },
    [nodeId, actions]
  );

  // ---- Condition callbacks -------------------------------------------------

  const handleAddCondition = useCallback(
    (condition: {
      name?: string;
      definition?: string;
      expressionText: string;
      isPostCondition?: boolean;
    }) => {
      actions.addCondition(nodeId, condition);
    },
    [nodeId, actions]
  );

  const handleRemoveCondition = useCallback(
    (index: number) => {
      actions.removeCondition(nodeId, index);
    },
    [nodeId, actions]
  );

  const handleUpdateCondition = useCallback(
    (index: number, updates: Partial<ConditionDisplayInfo>) => {
      actions.updateCondition(nodeId, index, updates);
    },
    [nodeId, actions]
  );

  const handleReorderCondition = useCallback(
    (fromIndex: number, toIndex: number) => {
      actions.reorderCondition(nodeId, fromIndex, toIndex);
    },
    [nodeId, actions]
  );

  // ---- Resolve parent type option for display ------------------------------

  // ---- Effective members (local + inherited) via hook ----------------------

  const { effective: effectiveAttributes } = useEffectiveMembers(data, allNodes, fields);

  // Local-side metadata derived from the effective list — `isOverride` tells
  // <AttributeRow> when to render the "revert" affordance (shadowing an
  // inherited row with the same name).
  const localMeta = useMemo(() => {
    const meta: Record<number, { isOverride: boolean; name: string }> = {};
    for (const entry of effectiveAttributes) {
      if (entry.source === 'local' && entry.fieldIndex !== undefined) {
        meta[entry.fieldIndex] = { isOverride: entry.isOverride, name: entry.name };
      }
    }
    return meta;
  }, [effectiveAttributes]);

  // ---- Inherited rows as ghost-row primitives (US4 / R6) -------------------
  // Per upstream `arrayConfig.before` (zod-to-form/core: `GhostRow[]`), build
  // one self-contained renderable per inherited entry. Ghost rows do not
  // participate in form state, validation, or submission. The render function
  // receives `{ isFirst, isLast }` positional context and returns the existing
  // <InheritedAttributeRow> JSX with the override affordance preserved.
  const ghostRowsBefore = useMemo<GhostRow[]>(() => {
    return effectiveAttributes
      .filter((entry) => entry.source === 'inherited')
      .map<GhostRow>((entry) => ({
        id: entry.id,
        render: (_ctx: GhostRowContext) => (
          <InheritedAttributeRow
            name={entry.name}
            typeName={entry.typeName ?? 'string'}
            cardinality={entry.cardinality ?? '(1..1)'}
            ancestorName={entry.ancestorName ?? ''}
            onOverride={() =>
              handleOverrideInherited({
                name: entry.name,
                typeName: entry.typeName ?? 'string',
                cardinality: entry.cardinality ?? '(1..1)'
              })
            }
            onNavigateToNode={onNavigateToNode}
            allNodeIds={allNodeIds}
          />
        )
      }));
  }, [effectiveAttributes, handleOverrideInherited, onNavigateToNode, allNodeIds]);

  const inheritedCount = ghostRowsBefore.length;

  const d = data as any;
  const parentName = getRefText(d.superType);

  const parentOptions = availableTypes.filter(
    (opt) => (opt.kind === 'data' || opt.kind === 'builtin') && opt.label !== d.name
  );

  const parentValue = parentName
    ? (availableTypes.find((opt) => opt.label === parentName)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <div data-slot="data-type-form" className="flex flex-col gap-4 p-4">
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
                  placeholder="Type name"
                  aria-label="Data type name"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Badge variant="data">Data</Badge>
        </div>

        {/* Inheritance */}
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
            placeholder="Select parent type..."
            allowClear
          />
        </FieldSet>

        {/* Attributes */}
        <FieldSet className="gap-1">
          <FieldLegend
            variant="label"
            className="mb-0 text-muted-foreground flex items-center justify-between"
          >
            <span>Attributes ({fields.length + inheritedCount})</span>
            <button
              data-slot="add-attribute-btn"
              type="button"
              onClick={handleAddAttribute}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary
                border border-border rounded px-2 py-0.5
                hover:bg-card hover:border-input transition-colors"
            >
              + Add Attribute
            </button>
          </FieldLegend>

          <FieldGroup className="gap-1">
            {/* Inherited rows via z2f's `arrayConfig.before` ghost-row primitive
                (R6 / US4). Rendered above local rows; do not participate in
                form state, validation, or submission. */}
            {ghostRowsBefore.map((row, i) => (
              <div key={`ghost-before-${row.id}`}>
                {
                  row.render({
                    isFirst: i === 0,
                    isLast: i === ghostRowsBefore.length - 1
                  }) as ReactNode
                }
              </div>
            ))}

            {/* Local rows from RHF's useFieldArray — the form-state surface. */}
            {fields.map((field, index) => {
              const meta = localMeta[index];
              const isOverride = meta?.isOverride ?? false;
              const localName = meta?.name ?? '';
              return (
                <AttributeRow
                  key={field.id}
                  index={index}
                  committedName={
                    ((committedRef.current as any).attributes ?? [])[index]?.name ?? ''
                  }
                  availableTypes={availableTypes}
                  onUpdate={handleUpdateAttribute}
                  onRemove={handleRemoveAttribute}
                  onReorder={handleReorderAttribute}
                  onNavigateToNode={onNavigateToNode}
                  allNodeIds={allNodeIds}
                  isOverride={isOverride}
                  onRevert={isOverride ? () => handleRevertOverride(localName) : undefined}
                />
              );
            })}

            {fields.length === 0 && ghostRowsBefore.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                No attributes defined. Click &quot;+ Add Attribute&quot; to create one.
              </p>
            )}
          </FieldGroup>
        </FieldSet>

        {/* Conditions */}
        <ConditionSection
          label="Conditions"
          conditions={d.conditions}
          readOnly={d.isReadOnly}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
          onUpdate={handleUpdateCondition}
          onReorder={handleReorderCondition}
          renderExpressionEditor={renderExpressionEditor}
        />

        {/* Annotations */}
        <AnnotationSection
          annotations={d.annotations}
          onAdd={handleAddAnnotation}
          onRemove={handleRemoveAnnotation}
        />

        {/* Metadata */}
        <MetadataSection
          onDefinitionCommit={commitDefinition}
          onCommentsCommit={commitComments}
          onSynonymAdd={handleAddSynonym}
          onSynonymRemove={handleRemoveSynonym}
        />
      </div>
    </FormProvider>
  );
}

export { DataTypeForm };
