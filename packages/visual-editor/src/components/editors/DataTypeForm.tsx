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

import { useCallback, useRef } from 'react';
import { FormProvider, Controller, useFieldArray } from 'react-hook-form';
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
import { useZodForm } from '@zod-to-form/react';
import { ExternalDataSync } from '../forms/ExternalDataSync.js';
import { dataTypeFormSchema, type DataTypeFormValues } from '../../schemas/form-schemas.js';
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
// Helpers
// ---------------------------------------------------------------------------

/** Convert AnyGraphNode to form-managed values. */
function toFormValues(data: AnyGraphNode): DataTypeFormValues {
  const d = data as any;
  return {
    name: d.name ?? '',
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
  // ---- Form setup (useZodForm + ExternalDataSync for external data sync) ---

  const { form } = useZodForm(dataTypeFormSchema, {
    defaultValues: toFormValues(data),
    mode: 'onChange'
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
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
  const inheritedCount = effectiveAttributes.filter((e) => e.source === 'inherited').length;

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
      <ExternalDataSync data={data} toValues={() => toFormValues(data)} />
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
            {effectiveAttributes.map((entry) =>
              entry.source === 'local' ? (
                <AttributeRow
                  key={entry.id}
                  index={entry.fieldIndex!}
                  committedName={
                    ((committedRef.current as any).attributes ?? [])[entry.fieldIndex!]?.name ?? ''
                  }
                  availableTypes={availableTypes}
                  onUpdate={handleUpdateAttribute}
                  onRemove={handleRemoveAttribute}
                  onReorder={handleReorderAttribute}
                  onNavigateToNode={onNavigateToNode}
                  allNodeIds={allNodeIds}
                  isOverride={entry.isOverride}
                  onRevert={entry.isOverride ? () => handleRevertOverride(entry.name) : undefined}
                />
              ) : (
                <InheritedAttributeRow
                  key={entry.id}
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
            )}

            {effectiveAttributes.length === 0 && (
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
