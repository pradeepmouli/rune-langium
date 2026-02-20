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
import { EnumValueRow } from './EnumValueRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useNodeForm } from '../../hooks/useNodeForm.js';
import { enumFormSchema, type EnumFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert TypeNodeData to form-managed values. */
function toFormValues(data: TypeNodeData<'enum'>): EnumFormValues {
  return {
    name: data.name,
    parentName: data.parentName ?? '',
    members: data.members.map((m) => ({
      name: m.name,
      typeName: m.typeName ?? '',
      cardinality: m.cardinality ?? '',
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

export interface EnumFormProps {
  /** Node ID of the Enum being edited. */
  nodeId: string;
  /** Data payload for the selected enum node. */
  data: TypeNodeData<'enum'>;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Enum-specific editor form action callbacks. */
  actions: EditorFormActions<'enum'>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumForm({ nodeId, data, availableTypes, actions }: EnumFormProps) {
  // ---- Form setup (full model via useNodeForm) -----------------------------

  const resetKey = useMemo(() => JSON.stringify(toFormValues(data)), [data]);

  const { form, members } = useNodeForm<EnumFormValues>({
    schema: enumFormSchema,
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

  const handleAddValue = useCallback(() => {
    append({ name: '', typeName: '', cardinality: '', isOverride: false, displayName: '' });
    actions.addEnumValue(nodeId, '', undefined);
  }, [nodeId, actions, append]);

  const handleRemoveValue = useCallback(
    (i: number) => {
      const committed = committedRef.current.members[i];
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

  // ---- Resolve parent enum option ------------------------------------------

  const parentOptions = availableTypes.filter(
    (opt) => opt.kind === 'enum' && opt.label !== data.name
  );

  const parentValue = data.parentName
    ? (availableTypes.find((opt) => opt.label === data.parentName)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
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
            <span>Values ({fields.length})</span>
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
            {fields.map((field, i) => (
              <EnumValueRow
                key={field.id}
                index={i}
                name={committedRef.current.members[i]?.name ?? ''}
                displayName={committedRef.current.members[i]?.displayName ?? ''}
                nodeId={nodeId}
                onUpdate={handleUpdateValue}
                onRemove={() => handleRemoveValue(i)}
                onReorder={handleReorderValue}
              />
            ))}

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                No values defined. Click &quot;+ Add Value&quot; to create one.
              </p>
            )}
          </FieldGroup>
        </FieldSet>

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
