// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ChoiceForm — structured editor form for a Choice node.
 *
 * Uses react-hook-form `FormProvider` so nested components
 * (MetadataSection) can access form state via `useFormContext`.
 * `useFieldArray` manages the members list.
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
import { ChoiceOptionRow } from './ChoiceOptionRow.js';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm, useExternalSync } from '@zod-to-form/react';
import { choiceFormSchema, type ChoiceFormValues } from '../../schemas/form-schemas.js';
import { formRegistry } from '../forms/rows/index.js';
import { getTypeRefText, classExprSynonymsToStrings } from '../../adapters/model-helpers.js';
import { TypeLink } from './TypeLink.js';
import type {
  AnyGraphNode,
  TypeOption,
  EditorFormActions,
  NavigateToNodeCallback
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert AnyGraphNode to form-managed values. */
function toFormValues(data: AnyGraphNode): ChoiceFormValues {
  const d = data as any;
  return {
    name: d.name ?? '',
    members: (d.attributes ?? []).map((o: any) => ({
      name: getTypeRefText(o.typeCall) ?? '',
      typeName: getTypeRefText(o.typeCall) ?? '',
      cardinality: '',
      isOverride: false,
      displayName: getTypeRefText(o.typeCall) ?? ''
    })),
    definition: d.definition ?? '',
    comments: d.comments ?? '',
    synonyms: classExprSynonymsToStrings(d.synonyms)
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChoiceFormProps {
  /** Node ID of the Choice being edited. */
  nodeId: string;
  /** Data payload for the selected choice node (AnyGraphNode with $type='Choice'). */
  data: AnyGraphNode;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Choice-specific editor form action callbacks. */
  actions: EditorFormActions<'choice'>;
  /** Callback to navigate to a type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving type name to node ID. */
  allNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChoiceForm({
  nodeId,
  data,
  availableTypes,
  actions,
  onNavigateToNode,
  allNodeIds
}: ChoiceFormProps) {
  const d = data as any;
  // ---- Form setup (useZodForm + upstream useExternalSync, R4) -------------

  const { form } = useZodForm(choiceFormSchema, {
    defaultValues: toFormValues(data),
    mode: 'onChange',
    formRegistry
  });

  // Re-bind pristine field state when the caller swaps to a different node.
  // `keepDirty: true` preserves the prior local-component semantics.
  useExternalSync(form, data, toFormValues, { keepDirty: true });

  const { fields: _fields } = useFieldArray({
    control: form.control,
    name: 'members'
  });

  // Track committed data for diffing
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

  // ---- Option callbacks ----------------------------------------------------

  const handleRemoveOption = useCallback(
    (nId: string, typeName: string) => {
      actions.removeChoiceOption(nId, typeName);
    },
    [actions]
  );

  const handleAddOption = useCallback(
    (value: string | null) => {
      if (value) {
        const label = availableTypes.find((opt) => opt.value === value)?.label;
        if (label) {
          actions.addChoiceOption(nodeId, label);
        }
      }
    },
    [nodeId, actions, availableTypes]
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

  // ---- Derived members from AST attributes ---------------------------------

  const members = (d.attributes ?? []).map((o: any) => ({
    name: getTypeRefText(o.typeCall) ?? '',
    typeName: getTypeRefText(o.typeCall) ?? ''
  }));

  // ---- Filter out types already used as options ----------------------------

  const usedTypeNames = new Set(members.map((m: any) => m.typeName));
  const addableTypes = availableTypes.filter(
    (opt) =>
      (opt.kind === 'data' || opt.kind === 'choice') &&
      opt.label !== d.name &&
      !usedTypeNames.has(opt.label)
  );

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
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
                    focus-visible:border-input focus-visible:ring-0 shadow-none
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
            Options ({members.length})
          </FieldLegend>

          <FieldGroup className="gap-0.5">
            {members.map((member: { name: string; typeName: string }, i: number) => (
              <ChoiceOptionRow
                key={`${member.typeName}-${i}`}
                typeName={member.typeName ?? member.name}
                nodeId={nodeId}
                availableTypes={availableTypes}
                onRemove={handleRemoveOption}
                onNavigateToNode={onNavigateToNode}
                allNodeIds={allNodeIds}
              />
            ))}

            {members.length === 0 && (
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
          onDefinitionCommit={commitDefinition}
          onCommentsCommit={commitComments}
          onSynonymAdd={handleAddSynonym}
          onSynonymRemove={handleRemoveSynonym}
        />
      </div>
    </FormProvider>
  );
}

export { ChoiceForm };
