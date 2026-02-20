/**
 * EnumForm — structured editor form for an Enumeration node.
 *
 * Uses react-hook-form with zodResolver for validation, and
 * design-system UI primitives (Input, Badge, Field*) for rendering.
 *
 * Sections:
 * 1. Header: editable name + "Enum" green badge
 * 2. Parent enum: TypeSelector (filtered to kind='enum', clearable)
 * 3. Enum values: EnumValueRow list + "Add Value" button
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
import { EnumValueRow } from './EnumValueRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { enumFormSchema, type EnumFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions, MemberDisplay } from '../../types.js';

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
  // ---- react-hook-form setup -----------------------------------------------

  const form = useForm<EnumFormValues>({
    resolver: zodResolver(enumFormSchema as any),
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

  // ---- Parent enum ---------------------------------------------------------

  function handleParentSelect(value: string | null) {
    actions.setEnumParent(nodeId, value);
  }

  // ---- Enum value callbacks ------------------------------------------------

  function handleUpdateValue(nId: string, oldName: string, newName: string, displayName?: string) {
    actions.updateEnumValue(nId, oldName, newName, displayName);
  }

  function handleRemoveValue(nId: string, valueName: string) {
    actions.removeEnumValue(nId, valueName);
  }

  function handleReorderValue(nId: string, fromIndex: number, toIndex: number) {
    actions.reorderEnumValue(nId, fromIndex, toIndex);
  }

  function handleAddValue() {
    actions.addEnumValue(nodeId, '', undefined);
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

  // ---- Resolve parent enum option ------------------------------------------

  const parentOptions = availableTypes.filter(
    (opt) => opt.kind === 'enum' && opt.label !== data.name
  );

  const parentValue = data.parentName
    ? (availableTypes.find((opt) => opt.label === data.parentName)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
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
          <span>Values ({data.members.length})</span>
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
          {data.members.map((member: MemberDisplay, i: number) => (
            <EnumValueRow
              key={`${nodeId}-val-${member.name}-${i}`}
              name={member.name}
              displayName={member.displayName}
              nodeId={nodeId}
              index={i}
              onUpdate={handleUpdateValue}
              onRemove={handleRemoveValue}
              onReorder={handleReorderValue}
            />
          ))}

          {data.members.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2 text-center">
              No values defined. Click &quot;+ Add Value&quot; to create one.
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

export { EnumForm };
