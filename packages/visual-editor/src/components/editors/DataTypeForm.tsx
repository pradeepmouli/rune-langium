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

import { useCallback, useRef, useMemo } from 'react';
import { FormProvider, Controller } from 'react-hook-form';
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
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { InheritedMembersSection } from './InheritedMembersSection.js';
import { AnnotationSection } from './AnnotationSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useNodeForm } from '../../hooks/useNodeForm.js';
import { dataTypeFormSchema, type DataTypeFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../types.js';
import type { InheritedGroup } from '../../hooks/useInheritedMembers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert TypeNodeData to form-managed values. */
function toFormValues(data: TypeNodeData<'data'>): DataTypeFormValues {
  return {
    name: data.name,
    parentName: data.parentName ?? '',
    members: data.members.map((m) => ({
      name: m.name,
      typeName: m.typeName ?? 'string',
      cardinality: m.cardinality ?? '(1..1)',
      isOverride: m.isOverride,
      displayName: m.displayName
    })),
    definition: data.definition ?? '',
    comments: data.comments ?? '',
    synonyms: data.synonyms ?? []
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DataTypeFormProps {
  /** Node ID of the Data type being edited. */
  nodeId: string;
  /** Data payload for the selected node. */
  data: TypeNodeData<'data'>;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Data-specific editor form action callbacks. */
  actions: EditorFormActions<'data'>;
  /** Inherited member groups from ancestors. */
  inheritedGroups?: InheritedGroup[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DataTypeForm({
  nodeId,
  data,
  availableTypes,
  actions,
  inheritedGroups = []
}: DataTypeFormProps) {
  // ---- Form setup (full model via useNodeForm) -----------------------------

  const resetKey = useMemo(() => JSON.stringify(toFormValues(data)), [data]);

  const { form, members } = useNodeForm<DataTypeFormValues>({
    schema: dataTypeFormSchema,
    defaultValues: () => toFormValues(data),
    resetKey
  });

  const { fields, append, remove, move } = members;

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

  const handleAddAttribute = useCallback(() => {
    append({ name: '', typeName: 'string', cardinality: '(1..1)', isOverride: false });
    actions.addAttribute(nodeId, '', 'string', '(1..1)');
  }, [nodeId, actions, append]);

  const handleRemoveAttribute = useCallback(
    (index: number) => {
      const committed = committedRef.current.members[index];
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

  // ---- Resolve parent type option for display ------------------------------

  const parentOptions = availableTypes.filter(
    (opt) => (opt.kind === 'data' || opt.kind === 'builtin') && opt.label !== data.name
  );

  const parentValue = data.parentName
    ? (availableTypes.find((opt) => opt.label === data.parentName)?.value ?? null)
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
            <span>Attributes ({fields.length})</span>
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
            {fields.map((field, i) => (
              <AttributeRow
                key={field.id}
                index={i}
                committedName={committedRef.current.members[i]?.name ?? ''}
                availableTypes={availableTypes}
                onUpdate={handleUpdateAttribute}
                onRemove={handleRemoveAttribute}
                onReorder={handleReorderAttribute}
              />
            ))}

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                No attributes defined. Click &quot;+ Add Attribute&quot; to create one.
              </p>
            )}
          </FieldGroup>
        </FieldSet>

        {/* Inherited Members */}
        <InheritedMembersSection groups={inheritedGroups} />

        {/* Annotations */}
        <AnnotationSection
          annotations={data.annotations ?? []}
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
