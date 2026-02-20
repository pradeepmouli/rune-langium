/**
 * DataTypeForm — structured editor form for a Data type node.
 *
 * Uses react-hook-form with zodResolver for validation, and
 * design-system UI primitives (Input, Badge, Field*) for rendering.
 *
 * Sections:
 * 1. Header: editable name + "Data" blue badge
 * 2. Inheritance: TypeSelector for parent type (clearable)
 * 3. Attributes: AttributeRow list + "Add Attribute" button
 * 4. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { AttributeRow } from './AttributeRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { dataTypeFormSchema, type DataTypeFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions } from '../../types.js';
import type { MemberDisplay } from '../../types.js';

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DataTypeForm({ nodeId, data, availableTypes, actions }: DataTypeFormProps) {
  // ---- react-hook-form setup -----------------------------------------------

  const form = useForm<DataTypeFormValues>({
    resolver: zodResolver(dataTypeFormSchema as any),
    defaultValues: { name: data.name, parentName: data.parentName ?? '' },
    mode: 'onChange'
  });

  // Sync form when node selection / undo-redo changes props
  useEffect(() => {
    form.reset({ name: data.name, parentName: data.parentName ?? '' });
  }, [data.name, data.parentName, form]);

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      if (newName && newName.trim() && newName !== data.name) {
        actions.renameType(nodeId, newName.trim());
      }
    },
    [nodeId, data.name, actions]
  );

  const debouncedName = useAutoSave(commitName, 500);

  // ---- Inheritance ---------------------------------------------------------

  function handleParentSelect(value: string | null) {
    actions.setInheritance(nodeId, value);
  }

  // ---- Attribute callbacks -------------------------------------------------

  function handleUpdateAttribute(
    nId: string,
    oldName: string,
    newName: string,
    typeName: string,
    cardinality: string
  ) {
    actions.updateAttribute(nId, oldName, newName, typeName, cardinality);
  }

  function handleRemoveAttribute(nId: string, attrName: string) {
    actions.removeAttribute(nId, attrName);
  }

  function handleReorderAttribute(nId: string, fromIndex: number, toIndex: number) {
    actions.reorderAttribute(nId, fromIndex, toIndex);
  }

  function handleAddAttribute() {
    actions.addAttribute(nodeId, '', 'string', '(1..1)');
  }

  // ---- Metadata callbacks --------------------------------------------------

  function handleDefinitionChange(definition: string) {
    actions.updateDefinition(nodeId, definition);
  }

  function handleCommentsChange(comments: string) {
    actions.updateComments(nodeId, comments);
  }

  function handleAddSynonym(synonym: string) {
    actions.addSynonym(nodeId, synonym);
  }

  function handleRemoveSynonym(index: number) {
    actions.removeSynonym(nodeId, index);
  }

  // ---- Resolve parent type option for display ------------------------------

  const parentOptions = availableTypes.filter(
    (opt) => (opt.kind === 'data' || opt.kind === 'builtin') && opt.label !== data.name
  );

  const parentValue = data.parentName
    ? (availableTypes.find((opt) => opt.label === data.parentName)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
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
          <span>Attributes ({data.members.length})</span>
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
          {data.members.map((member: MemberDisplay, i: number) => (
            <AttributeRow
              key={`${nodeId}-attr-${member.name}-${i}`}
              member={member}
              nodeId={nodeId}
              index={i}
              availableTypes={availableTypes}
              onUpdate={handleUpdateAttribute}
              onRemove={handleRemoveAttribute}
              onReorder={handleReorderAttribute}
            />
          ))}

          {data.members.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2 text-center">
              No attributes defined. Click &quot;+ Add Attribute&quot; to create one.
            </p>
          )}
        </FieldGroup>
      </FieldSet>

      {/* Metadata */}
      <MetadataSection
        definition={data.definition ?? ''}
        comments={data.comments ?? ''}
        synonyms={data.synonyms ?? []}
        onDefinitionChange={handleDefinitionChange}
        onCommentsChange={handleCommentsChange}
        onAddSynonym={handleAddSynonym}
        onRemoveSynonym={handleRemoveSynonym}
      />
    </div>
  );
}

export { DataTypeForm };
