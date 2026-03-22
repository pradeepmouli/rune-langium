// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeAliasForm — structured editor form for a TypeAlias node.
 *
 * Uses react-hook-form `FormProvider` with `useZodForm` for validation.
 * `ExternalDataSync` keeps form in sync with external data changes.
 *
 * Sections:
 * 1. Header: editable name + "TypeAlias" badge
 * 2. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useCallback, useRef } from 'react';
import { FormProvider, Controller } from 'react-hook-form';
import { Field, FieldError } from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { MetadataSection } from './MetadataSection.js';
import { AnnotationSection } from './AnnotationSection.js';
import { ConditionSection } from './ConditionSection.js';
import {
  classExprSynonymsToStrings,
  type ConditionDisplayInfo
} from '../../adapters/model-helpers.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useZodForm } from '@zod-to-form/react';
import { ExternalDataSync } from '../forms/ExternalDataSync.js';
import { typeAliasFormSchema, type TypeAliasFormValues } from '../../schemas/form-schemas.js';
import type { AnyGraphNode, EditorFormActions, ExpressionEditorSlotProps } from '../../types.js';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert AnyGraphNode to form-managed values. */
function toFormValues(data: AnyGraphNode): TypeAliasFormValues {
  const d = data as any;
  return {
    name: d.name ?? '',
    definition: d.definition ?? '',
    comments: d.comments ?? '',
    synonyms: classExprSynonymsToStrings(d.synonyms)
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TypeAliasFormProps {
  /** Node ID of the TypeAlias being edited. */
  nodeId: string;
  /** Data payload for the selected type alias node (AnyGraphNode with $type='RosettaTypeAlias'). */
  data: AnyGraphNode;
  /** TypeAlias editor form action callbacks. */
  actions: EditorFormActions<'typeAlias'>;
  /** Optional render-prop for a rich expression editor. */
  renderExpressionEditor?: (props: ExpressionEditorSlotProps) => ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TypeAliasForm({ nodeId, data, actions, renderExpressionEditor }: TypeAliasFormProps) {
  const d = data as any;
  // ---- Form setup (useZodForm + ExternalDataSync) --------------------------

  const { form } = useZodForm(typeAliasFormSchema, {
    defaultValues: toFormValues(data),
    mode: 'onChange'
  });

  // Track the committed data for diffing
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

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <ExternalDataSync data={data} toValues={() => toFormValues(data)} />
      <div data-slot="type-alias-form" className="flex flex-col gap-4 p-4">
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
                  placeholder="Type alias name"
                  aria-label="Type alias name"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Badge variant="typeAlias">TypeAlias</Badge>
        </div>

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

export { TypeAliasForm };
