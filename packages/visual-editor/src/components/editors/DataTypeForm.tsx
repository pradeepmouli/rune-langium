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
import { FormProvider, useFieldArray, type Control } from 'react-hook-form';
import type { GhostRow, GhostRowContext } from '@zod-to-form/core';
import { FieldGroup, FieldLegend, FieldSet } from '@rune-langium/design-system/ui/field';
import { Button } from '@rune-langium/design-system/ui/button';
import { TypeHeader, INSPECTOR_FORM_HEADER_CLASS } from '../TypeHeader.js';
import { Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@rune-langium/design-system/ui/tabs';
import { AttributeRow } from './AttributeRow.js';
import { InheritedAttributeRow } from './AttributeRow.js';
import { TypeReferenceField } from './TypeReferenceField.js';
import { MetadataSection } from './MetadataSection.js';
import { useEffectiveMembers } from '../../hooks/useInheritedMembers.js';
import { AnnotationSection } from './AnnotationSection.js';
import { ConditionSection } from './ConditionSection.js';
import { getRefText, parseCardinality, type ConditionDisplayInfo } from '../../adapters/model-helpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { DataSchema } from '../../generated/zod-schemas.js';
import { formRegistry } from '../forms/rows/index.js';
import { identityProjection } from './identity-projection.js';
import { EditorActionsProvider } from '../forms/sections/EditorActionsContext.js';
import type {
  AnyGraphNode,
  GraphNodeMeta,
  TypeGraphNode,
  TypeOption,
  EditorFormActions,
  ExpressionEditorSlotProps,
  NavigateToNodeCallback
} from '../../types.js';
import { metaFromFlatData } from '../../store/node-projection.js';
import type { ReactNode } from 'react';

const EMPTY_NODES: TypeGraphNode[] = [];

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
  /**
   * Panel-level read-only override. When true the form renders in read-only
   * mode even if the node's own `isReadOnly` flag is false (e.g. panel prop
   * lock from a curated refOnly file). ORed with the node metadata's
   * `isReadOnly` flag.
   */
  readOnly?: boolean;
  /**
   * UI/editor metadata for the node (namespace, isReadOnly, errors, ...).
   * Optional during Phase 3 step 2: when absent it is derived from the flat
   * metadata copies still merged into `data` (dual-presence window).
   * Becomes required in step 3.
   */
  meta?: GraphNodeMeta;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DataTypeForm({
  nodeId,
  data,
  availableTypes,
  actions,
  allNodes = EMPTY_NODES,
  renderExpressionEditor,
  onNavigateToNode,
  allNodeIds,
  readOnly: readOnlyProp,
  meta: metaProp
}: DataTypeFormProps) {
  // ---- Form setup (useZodForm + useExternalSync per R11 / R4) -------------
  // Drive validation off the canonical AST schema. Per R11 the editor
  // consumes the AST node directly — `<AttributeRow>` now reads AST paths
  // (`attributes.${i}.{name,typeCall.type.$refText,card,override}`), so
  // there is no projection layer and no reshape bridge.

  const { form } = useZodForm(DataSchema, {
    defaultValues: identityProjection<typeof DataSchema>(data),
    mode: 'onChange',
    formRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different node
  // (object identity is the contract). `keepDirty: true` preserves the
  // pre-migration `keepDirtyValues: true` semantics so in-flight user edits
  // are not stomped by a graph push.
  useExternalSync(form, data, identityProjection<typeof DataSchema>, { keepDirty: true });

  // `DataSchema` is a `z.looseObject`; the inferred `output<>` does not
  // expose `attributes` as a structured array path RHF's overloaded
  // `useFieldArray` can latch onto. Widen the control type so the AST array
  // key (`attributes`) is accepted — runtime behaviour is unchanged.
  type AttributeFieldShape = {
    $type: 'Attribute';
    name: string;
    typeCall: { $type: 'TypeCall'; type: { $refText: string } };
    card: { inf: number; sup?: number; unbounded?: boolean };
    override?: boolean;
  };
  const { fields, append, remove, move } = useFieldArray({
    control: form.control as unknown as Control<{ attributes: AttributeFieldShape[] }>,
    name: 'attributes'
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
      // Mirror the selection into AST-canonical `superType.$refText` so the
      // form stays consistent until the external graph push round-trips back
      // through `useExternalSync`. The visible parent label below reads off
      // `data.superType` (the committed graph value) for the same reason.
      form.setValue('superType.$refText', label, { shouldDirty: true });
      actions.setInheritance(nodeId, value);
    },
    [nodeId, actions, availableTypes, form]
  );

  // ---- Attribute actions ---------------------------------------------------

  // Build an AST-shaped Attribute literal for `useFieldArray.append`. The
  // bespoke <AttributeRow> reads `attributes.${i}.{name,typeCall.type.$refText,card,override}`
  // (R11), so the appended item must be in that shape — no projection.
  const makeAttributeAstItem = useCallback(
    (name: string, typeName: string, cardinality: string, override = false) => ({
      $type: 'Attribute' as const,
      name,
      typeCall: { $type: 'TypeCall' as const, type: { $refText: typeName } },
      card: parseCardinality(cardinality),
      override
    }),
    []
  );

  const handleOverrideInherited = useCallback(
    (attr: { name: string; typeName: string; cardinality: string }) => {
      append(makeAttributeAstItem(attr.name, attr.typeName, attr.cardinality));
      actions.addAttribute(nodeId, attr.name, attr.typeName, attr.cardinality);
    },
    [nodeId, actions, append, makeAttributeAstItem]
  );

  const handleRevertOverride = useCallback(
    (attrName: string) => {
      // `useFieldArray` field items carry the AST `name` field directly
      // (the array `name: 'attributes'` binds to AST `Attribute` items).
      const fieldIdx = fields.findIndex((f) => (f as { name?: string }).name === attrName);
      if (fieldIdx >= 0) {
        remove(fieldIdx);
        actions.removeAttribute(nodeId, attrName);
      }
    },
    [nodeId, actions, fields, remove]
  );

  const handleAddAttribute = useCallback(() => {
    append(makeAttributeAstItem('', 'string', '(1..1)'));
    actions.addAttribute(nodeId, '', 'string', '(1..1)');
  }, [nodeId, actions, append, makeAttributeAstItem]);

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
    (condition: { name?: string; definition?: string; expressionText: string; isPostCondition?: boolean }) => {
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

  const d = data as any;
  const nodeMeta = metaProp ?? metaFromFlatData(d);
  const parentName = getRefText(d.superType);

  const parentOptions = availableTypes.filter(
    (opt) => (opt.kind === 'data' || opt.kind === 'builtin') && opt.label !== d.name
  );

  const parentValue = parentName ? (availableTypes.find((opt) => opt.label === parentName)?.value ?? null) : null;

  // ---- Compute isReadOnly before ghost rows so it is in scope for the memo --

  const isReadOnly = Boolean(readOnlyProp || nodeMeta.isReadOnly);

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
            disabled={isReadOnly}
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
  }, [effectiveAttributes, isReadOnly, handleOverrideInherited, onNavigateToNode, allNodeIds]);

  const inheritedCount = ghostRowsBefore.length;

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <EditorActionsProvider nodeId={nodeId} actions={actions as unknown as EditorFormActions} readOnly={isReadOnly}>
        <div data-slot="data-type-form" className="flex flex-col min-h-0 h-full gap-4 p-4">
          {/* Header: Namespace + Name + Badge — always visible above tabs */}
          <TypeHeader
            kind="data"
            namespace={nodeMeta.namespace}
            control={form.control}
            onNameChange={debouncedName}
            placeholder="Type name"
            nameAriaLabel="Data type name"
            className={INSPECTOR_FORM_HEADER_CLASS}
            onReveal={onNavigateToNode ? () => onNavigateToNode(nodeId) : undefined}
          />

          {/* Inheritance — always visible above tabs */}
          <div className="shrink-0">
            <FieldSet className="gap-1.5">
              <FieldLegend variant="label" className="mb-0 text-muted-foreground">
                Extends
              </FieldLegend>
              <TypeReferenceField
                value={parentValue ?? null}
                displayName={parentName}
                options={parentOptions}
                onSelect={handleParentSelect}
                placeholder="Select parent type..."
                allowClear
                emptyLabel="No parent type"
                filterKinds={['data', 'builtin']}
                onNavigateToNode={onNavigateToNode}
                allNodeIds={allNodeIds}
                disabled={isReadOnly}
              />
            </FieldSet>
          </div>

          {/* Tabbed sections */}
          <Tabs defaultValue="members" className="-mx-4 flex-1 flex flex-col min-h-0">
            <TabsList size="sm" className="px-2">
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="conditions">Conditions</TabsTrigger>
              <TabsTrigger value="doc">Doc</TabsTrigger>
              <TabsTrigger value="meta">Meta</TabsTrigger>
            </TabsList>

            {/* Members tab — attributes */}
            <TabsContent value="members" className="studio-scroll flex-1 overflow-y-auto p-4 mt-0">
              <FieldSet className="gap-1">
                <FieldLegend variant="label" className="mb-0 text-muted-foreground flex items-center justify-between">
                  <span>Attributes ({fields.length + inheritedCount})</span>
                  {/* Icon-only add button to match FormPreviewPanel's
                    +/- treatment for optional sections and array adds.
                    The legend already names the section ("Attributes"),
                    so the button only conveys the operation. aria-label
                    preserves the full phrasing for screen readers. */}
                  {!isReadOnly && (
                    <Button
                      data-slot="add-attribute-btn"
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleAddAttribute}
                      aria-label="Add attribute"
                      title="Add attribute"
                    >
                      <Plus className="size-3" />
                    </Button>
                  )}
                </FieldLegend>

                <FieldGroup className="gap-0.5">
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
                        committedName={((committedRef.current as any).attributes ?? [])[index]?.name ?? ''}
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
                      No attributes defined. Use the + button above to add one.
                    </p>
                  )}
                </FieldGroup>
              </FieldSet>
            </TabsContent>

            {/* Conditions tab */}
            <TabsContent value="conditions" className="studio-scroll flex-1 overflow-y-auto p-4 mt-0">
              <ConditionSection
                label="Conditions"
                conditions={d.conditions}
                readOnly={isReadOnly}
                onAdd={handleAddCondition}
                onRemove={handleRemoveCondition}
                onUpdate={handleUpdateCondition}
                onReorder={handleReorderCondition}
                renderExpressionEditor={renderExpressionEditor}
              />
            </TabsContent>

            {/* Doc tab — description, comments, synonyms */}
            <TabsContent value="doc" className="studio-scroll flex-1 overflow-y-auto p-4 mt-0">
              <MetadataSection
                onDefinitionCommit={commitDefinition}
                onCommentsCommit={commitComments}
                onSynonymAdd={handleAddSynonym}
                onSynonymRemove={handleRemoveSynonym}
              />
            </TabsContent>

            {/* Meta tab — annotations */}
            <TabsContent value="meta" className="studio-scroll flex-1 overflow-y-auto p-4 mt-0">
              <AnnotationSection
                annotations={d.annotations}
                onAdd={handleAddAnnotation}
                onRemove={handleRemoveAnnotation}
              />
            </TabsContent>
          </Tabs>
        </div>
      </EditorActionsProvider>
    </FormProvider>
  );
}

export { DataTypeForm };
