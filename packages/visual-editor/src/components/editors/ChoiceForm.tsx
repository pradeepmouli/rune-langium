/**
 * ChoiceForm — structured editor form for a Choice node.
 *
 * Uses react-hook-form with zodResolver for validation, and
 * design-system UI primitives (Input, Badge, Field*) for rendering.
 *
 * Sections:
 * 1. Header: editable name + "Choice" amber badge
 * 2. Options: ChoiceOptionRow list + inline TypeSelector for "Add Option"
 * 3. Metadata: description, comments, synonyms (MetadataSection)
 *
 * Note: Choices have NO parent/inheritance.
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
import { ChoiceOptionRow } from './ChoiceOptionRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { choiceFormSchema, type ChoiceFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions, MemberDisplay } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChoiceFormProps {
  /** Node ID of the Choice being edited. */
  nodeId: string;
  /** Data payload for the selected choice node. */
  data: TypeNodeData<'choice'>;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Choice-specific editor form action callbacks. */
  actions: EditorFormActions<'choice'>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChoiceForm({ nodeId, data, availableTypes, actions }: ChoiceFormProps) {
  // ---- react-hook-form setup -----------------------------------------------

  const form = useForm<ChoiceFormValues>({
    resolver: zodResolver(choiceFormSchema),
    defaultValues: { name: data.name },
    mode: 'onChange'
  });

  // Sync form when node selection / undo-redo changes props
  useEffect(() => {
    form.reset({ name: data.name });
  }, [data.name, form]);

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

  // ---- Option callbacks ----------------------------------------------------

  function handleRemoveOption(nId: string, typeName: string) {
    actions.removeChoiceOption(nId, typeName);
  }

  function handleAddOption(value: string | null) {
    if (value) {
      const label = availableTypes.find((opt) => opt.value === value)?.label;
      if (label) {
        actions.addChoiceOption(nodeId, label);
      }
    }
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

  // ---- Filter out types already used as options ----------------------------

  const usedTypeNames = new Set(data.members.map((m) => m.typeName));
  const addableTypes = availableTypes.filter(
    (opt) =>
      (opt.kind === 'data' || opt.kind === 'choice') &&
      opt.label !== data.name &&
      !usedTypeNames.has(opt.label)
  );

  // ---- Render --------------------------------------------------------------

  return (
    <div data-slot="choice-form" className="flex flex-col gap-4 p-4">
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
                  focus-visible:border-border-emphasis focus-visible:ring-0 shadow-none
                  px-1 py-0.5 h-auto rounded-none"
                placeholder="Choice name"
                aria-label="Choice type name"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Badge variant="choice">Choice</Badge>
      </div>

      {/* Options */}
      <FieldSet className="gap-1">
        <FieldLegend variant="label" className="mb-0 text-muted-foreground">
          Options ({data.members.length})
        </FieldLegend>

        <FieldGroup className="gap-0.5">
          {data.members.map((member: MemberDisplay, i: number) => (
            <ChoiceOptionRow
              key={`${member.typeName}-${i}`}
              typeName={member.typeName ?? member.name}
              nodeId={nodeId}
              availableTypes={availableTypes}
              onRemove={handleRemoveOption}
            />
          ))}

          {data.members.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2 text-center">
              No options defined. Use the selector below to add one.
            </p>
          )}
        </FieldGroup>

        {/* Add Option via TypeSelector */}
        <div data-slot="add-option" className="mt-1">
          <TypeSelector
            value=""
            options={addableTypes}
            onSelect={handleAddOption}
            placeholder="Add option..."
          />
        </div>
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

export { ChoiceForm };
