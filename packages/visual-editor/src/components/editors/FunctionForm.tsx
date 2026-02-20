/**
 * FunctionForm — structured editor form for a Function node.
 *
 * Uses react-hook-form `FormProvider` so nested components
 * (MetadataSection) can access form state via `useFormContext`.
 * `useFieldArray` manages the input-parameters list.
 *
 * Sections:
 * 1. Header: editable name + "Function" purple badge
 * 2. Input parameters: rows with name + TypeSelector, "Add Input" button
 * 3. Output type: TypeSelector for the return type
 * 4. Expression editor: validated textarea (blur commit)
 * 5. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { FormProvider, Controller } from 'react-hook-form';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@rune-langium/design-system/ui/field';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useNodeForm } from '../../hooks/useNodeForm.js';
import { useExpressionAutocomplete } from '../../hooks/useExpressionAutocomplete.js';
import { validateExpression } from '../../validation/edit-validator.js';
import { functionFormSchema, type FunctionFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions, MemberDisplay } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert TypeNodeData to form-managed values. */
function toFormValues(data: TypeNodeData<'func'>): FunctionFormValues {
  return {
    name: data.name,
    outputType: data.outputType ?? '',
    expressionText: data.expressionText ?? '',
    members: data.members.map((m) => ({
      name: m.name,
      typeName: m.typeName ?? 'string',
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

export interface FunctionFormProps {
  /** Node ID of the Function being edited. */
  nodeId: string;
  /** Data payload for the selected function node. */
  data: TypeNodeData<'func'>;
  /** Available type options for selectors. */
  availableTypes: TypeOption[];
  /** Function-specific editor form action callbacks. */
  actions: EditorFormActions<'func'>;
}

// ---------------------------------------------------------------------------
// InputParamRow (internal)
// ---------------------------------------------------------------------------

interface InputParamRowProps {
  member: MemberDisplay;
  nodeId: string;
  availableTypes: TypeOption[];
  onRemove: (nodeId: string, paramName: string) => void;
  disabled?: boolean;
}

function InputParamRow({
  member,
  nodeId,
  availableTypes,
  onRemove,
  disabled = false
}: InputParamRowProps) {
  return (
    <div
      data-slot="input-param-row"
      className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50"
      role="listitem"
    >
      <span className="text-xs text-muted-foreground w-3">⠇</span>

      <span data-slot="param-name" className="text-sm font-medium min-w-20">
        {member.name || '(unnamed)'}
      </span>

      <span data-slot="param-type" className="text-xs text-muted-foreground">
        {member.typeName ?? 'string'}
      </span>

      <button
        data-slot="remove-param-btn"
        type="button"
        onClick={() => onRemove(nodeId, member.name)}
        disabled={disabled}
        className="ml-auto text-xs text-destructive hover:text-destructive/80
          disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`Remove input ${member.name}`}
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FunctionForm
// ---------------------------------------------------------------------------

function FunctionForm({ nodeId, data, availableTypes, actions }: FunctionFormProps) {
  // ---- Form setup (full model via useNodeForm) -----------------------------

  const resetKey = useMemo(() => JSON.stringify(toFormValues(data)), [data]);

  const { form, members } = useNodeForm<FunctionFormValues>({
    schema: functionFormSchema,
    defaultValues: () => toFormValues(data),
    resetKey
  });

  const { fields } = members;

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

  // ---- Expression validation (on blur) -------------------------------------

  const [expressionError, setExpressionError] = useState<string | null>(null);

  const handleExpressionBlur = useCallback(() => {
    const currentExpression = form.getValues('expressionText');
    const result = validateExpression(currentExpression);
    if (!result.valid) {
      setExpressionError(result.error ?? 'Invalid expression');
    } else {
      setExpressionError(null);
      if (currentExpression !== (committedRef.current.expressionText ?? '')) {
        actions.updateExpression(nodeId, currentExpression);
      }
    }
  }, [nodeId, actions, form]);

  // ---- Output type ---------------------------------------------------------

  const handleOutputTypeSelect = useCallback(
    (value: string | null) => {
      if (value) {
        const opt = availableTypes.find((o) => o.value === value);
        actions.updateOutputType(nodeId, opt?.label ?? value);
      }
    },
    [nodeId, actions, availableTypes]
  );

  const outputType = data.outputType;
  const outputValue = outputType
    ? (availableTypes.find((o) => o.label === outputType)?.value ?? '')
    : '';

  // ---- Input param callbacks -----------------------------------------------

  const inputParams = data.members.map((m) => ({
    name: m.name,
    typeName: m.typeName
  }));

  // Autocomplete hook (available for future autocompletion popup integration)
  const { getCompletions } = useExpressionAutocomplete(availableTypes, inputParams);

  // Inline add-input state
  const [addParamName, setAddParamName] = useState('');
  const [addParamType, setAddParamType] = useState('');

  const handleAddInput = useCallback(() => {
    const name = addParamName.trim();
    if (!name) return;
    const typeName = addParamType
      ? (availableTypes.find((o) => o.value === addParamType)?.label ?? addParamType)
      : 'string';
    actions.addInputParam(nodeId, name, typeName);
    setAddParamName('');
    setAddParamType('');
  }, [nodeId, actions, availableTypes, addParamName, addParamType]);

  const handleRemoveInput = useCallback(
    (nId: string, paramName: string) => {
      actions.removeInputParam(nId, paramName);
    },
    [actions]
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

  // ---- Render --------------------------------------------------------------

  return (
    <FormProvider {...form}>
      <div data-slot="function-form" className="flex flex-col gap-4 p-4">
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
                  placeholder="Function name"
                  aria-label="Function type name"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Badge variant="func">Function</Badge>
        </div>

        {/* Input Parameters */}
        <FieldSet className="gap-1">
          <FieldLegend variant="label" className="mb-0 text-muted-foreground">
            Inputs ({data.members.length})
          </FieldLegend>

          <FieldGroup className="gap-0.5">
            {data.members.map((member: MemberDisplay, i: number) => (
              <InputParamRow
                key={`${nodeId}-param-${member.name}-${i}`}
                member={member}
                nodeId={nodeId}
                availableTypes={availableTypes}
                onRemove={handleRemoveInput}
              />
            ))}

            {data.members.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                No input parameters defined.
              </p>
            )}
          </FieldGroup>

          {/* Inline add input */}
          <div className="flex items-center gap-1 mt-1">
            <Input
              data-slot="add-param-name"
              type="text"
              value={addParamName}
              onChange={(e) => setAddParamName(e.target.value)}
              placeholder="Name"
              className="text-xs w-24 h-6 px-1.5"
              aria-label="New input parameter name"
            />
            <div className="flex-1">
              <TypeSelector
                value={addParamType}
                options={availableTypes}
                onSelect={(v) => setAddParamType(v ?? '')}
                placeholder="Type..."
              />
            </div>
            <button
              data-slot="add-input-btn"
              type="button"
              onClick={handleAddInput}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary
                border border-border rounded px-2 py-0.5
                hover:bg-card hover:border-input transition-colors whitespace-nowrap"
            >
              + Add Input
            </button>
          </div>
        </FieldSet>

        {/* Output Type */}
        <FieldSet className="gap-1.5">
          <FieldLegend variant="label" className="mb-0 text-muted-foreground">
            Output Type
          </FieldLegend>
          <TypeSelector
            value={outputValue}
            options={availableTypes}
            onSelect={handleOutputTypeSelect}
            placeholder="Select output type..."
          />
        </FieldSet>

        {/* Expression Editor */}
        <Controller
          control={form.control}
          name="expressionText"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel
                htmlFor="expressionText"
                className="text-xs font-medium text-muted-foreground"
              >
                Expression
              </FieldLabel>
              <Textarea
                {...field}
                id="expressionText"
                data-slot="expression-editor"
                aria-invalid={fieldState.invalid}
                onBlur={() => {
                  field.onBlur();
                  handleExpressionBlur();
                }}
                onChange={(e) => {
                  field.onChange(e);
                  if (expressionError) setExpressionError(null);
                }}
                rows={4}
                className={`text-sm font-mono resize-y ${expressionError ? 'border-red-500' : ''}`}
                placeholder="Enter function expression..."
                aria-label="Function expression"
              />
              {expressionError && (
                <p data-slot="expression-error" className="text-xs text-red-500 mt-0.5">
                  {expressionError}
                </p>
              )}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
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

export { FunctionForm };
