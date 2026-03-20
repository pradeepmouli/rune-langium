/**
 * EnumForm — structured editor form for an Enumeration node.
 *
 * Uses react-hook-form `FormProvider` so nested components (EnumValueRow,
 * MetadataSection) can access form state via `useFormContext`.
 * `useFieldArray` manages the members list with stable keys for
 * add/remove/reorder without stale-closure bugs.
 *
 * Sections:
 * 1. Header: editable name + "Enum" green badge
 * 2. Parent enum: TypeSelector (filtered to kind='enum', clearable)
 * 3. Enum values: EnumValueRow list + "Add Value" button
 * 4. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useCallback, useMemo, useRef } from 'react';
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
import { EnumValueRow } from './EnumValueRow.js';
import { InheritedEnumValueRow } from './EnumValueRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { buildMergedEnumValueList } from '../../hooks/useInheritedMembers.js';
import { AnnotationSection } from './AnnotationSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm } from '@zod-to-form/react';
import { ExternalDataSync } from '../forms/ExternalDataSync.js';
import { enumFormSchema, type EnumFormValues } from '../../schemas/form-schemas.js';
import { getRefText, enumSynonymsToStrings } from '../../adapters/model-helpers.js';
import { TypeLink } from './TypeLink.js';
import type {
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  NavigateToNodeCallback
} from '../../types.js';
import type { InheritedGroup } from '../../hooks/useInheritedMembers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert AnyGraphNode to form-managed values. */
function toFormValues(data: AnyGraphNode): EnumFormValues {
  const d = data as any;
  return {
    name: d.name ?? '',
    parentName: getRefText(d.parent) ?? '',
    members: (d.enumValues ?? []).map((v: any) => ({
      name: v.name ?? '',
      typeName: '',
      cardinality: '',
      isOverride: false,
      displayName: v.display ?? v.name ?? ''
    })),
    definition: d.definition ?? '',
    comments: d.comments ?? '',
    synonyms: enumSynonymsToStrings(d.synonyms)
  };
}

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
  /** Inherited member groups from ancestors. */
  inheritedGroups?: InheritedGroup[];
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
  inheritedGroups = [],
  onNavigateToNode,
  allNodeIds
}: EnumFormProps) {
  const d = data as any;
  // ---- Form setup (useZodForm + ExternalDataSync for external data sync) ---

  const { form } = useZodForm(enumFormSchema, {
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

  // ---- Parent enum ---------------------------------------------------------

  const handleParentSelect = useCallback(
    (value: string | null) => {
      const label = value ? (availableTypes.find((o) => o.value === value)?.label ?? '') : '';
      form.setValue('parentName', label, { shouldDirty: true });
      actions.setEnumParent(nodeId, value);
    },
    [nodeId, actions, availableTypes, form]
  );

  // ---- Enum value actions --------------------------------------------------

  const handleOverrideInheritedValue = useCallback(
    (name: string, displayName: string) => {
      append({ name, typeName: '', cardinality: '', isOverride: false, displayName });
      actions.addEnumValue(nodeId, name, displayName || undefined);
    },
    [nodeId, actions, append]
  );

  const handleAddValue = useCallback(() => {
    append({ name: '', typeName: '', cardinality: '', isOverride: false, displayName: '' });
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

  const parentName = getRefText(d.parent);

  const mergedValueList = useMemo(
    () => buildMergedEnumValueList(fields, inheritedGroups),
    [fields, inheritedGroups]
  );
  const inheritedCount = mergedValueList.filter((e) => !e.isLocal).length;

  // ---- Resolve parent enum option ------------------------------------------

  const parentOptions = availableTypes.filter((opt) => opt.kind === 'enum' && opt.label !== d.name);

  const parentValue = parentName
    ? (availableTypes.find((opt) => opt.label === parentName)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <ExternalDataSync data={data} toValues={() => toFormValues(data)} />
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
            {mergedValueList.map((entry) =>
              entry.isLocal ? (
                <EnumValueRow
                  key={entry.id}
                  index={entry.fieldIndex}
                  name={
                    ((committedRef.current as any).enumValues ?? [])[entry.fieldIndex]?.name ?? ''
                  }
                  displayName={
                    ((committedRef.current as any).enumValues ?? [])[entry.fieldIndex]?.display ??
                    ''
                  }
                  nodeId={nodeId}
                  onUpdate={handleUpdateValue}
                  onRemove={() => handleRemoveValue(entry.fieldIndex)}
                  onReorder={handleReorderValue}
                />
              ) : (
                <InheritedEnumValueRow
                  key={entry.id}
                  name={entry.name}
                  displayName={entry.displayName}
                  ancestorName={entry.inheritedFrom.ancestorName}
                  onOverride={() => handleOverrideInheritedValue(entry.name, entry.displayName)}
                />
              )
            )}

            {mergedValueList.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                No values defined. Click &quot;+ Add Value&quot; to create one.
              </p>
            )}
          </FieldGroup>
        </FieldSet>

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

export { EnumForm };
