/**
 * FunctionForm — structured editor form for a Function node.
 *
 * Uses react-hook-form with zodResolver for validation, and
 * design-system UI primitives (Input, Badge, Form*, Textarea) for rendering.
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

import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@rune-langium/design-system/ui/form';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { TypeSelector } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useExpressionAutocomplete } from '../../hooks/useExpressionAutocomplete.js';
import { validateExpression } from '../../validation/edit-validator.js';
import { functionFormSchema, type FunctionFormValues } from '../../schemas/form-schemas.js';
import type { TypeNodeData, TypeOption, EditorFormActions, MemberDisplay } from '../../types.js';

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
      <span className="text-xs text-muted-foreground w-3">⠿</span>

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
  // ---- react-hook-form setup -----------------------------------------------

  const form = useForm<FunctionFormValues>({
    resolver: zodResolver(functionFormSchema),
    defaultValues: {
      name: data.name,
      outputType: data.outputType ?? '',
      expressionText: data.expressionText ?? ''
    },
    mode: 'onChange'
  });

  // Sync form when node selection / undo-redo changes props
  useEffect(() => {
    form.reset({
      name: data.name,
      outputType: data.outputType ?? '',
      expressionText: data.expressionText ?? ''
    });
  }, [data.name, data.outputType, data.expressionText, form]);

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

  // ---- Expression validation (on blur) -------------------------------------

  const [expressionError, setExpressionError] = useState<string | null>(null);

  function handleExpressionBlur() {
    const currentExpression = form.getValues('expressionText');
    const result = validateExpression(currentExpression);
    if (!result.valid) {
      setExpressionError(result.error ?? 'Invalid expression');
    } else {
      setExpressionError(null);
      if (currentExpression !== (data.expressionText ?? '')) {
        actions.updateExpression(nodeId, currentExpression);
      }
    }
  }

  // ---- Output type ---------------------------------------------------------

  const outputType = data.outputType;

  function handleOutputTypeSelect(value: string | null) {
    if (value) {
      const opt = availableTypes.find((o) => o.value === value);
      actions.updateOutputType(nodeId, opt?.label ?? value);
    }
  }

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

  function handleAddInput() {
    const name = addParamName.trim();
    if (!name) return;
    const typeName = addParamType
      ? (availableTypes.find((o) => o.value === addParamType)?.label ?? addParamType)
      : 'string';
    actions.addInputParam(nodeId, name, typeName);
    setAddParamName('');
    setAddParamType('');
  }

  function handleRemoveInput(nId: string, paramName: string) {
    actions.removeInputParam(nId, paramName);
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

  // ---- Render --------------------------------------------------------------

  return (
    <Form {...form}>
      <div data-slot="function-form" className="flex flex-col gap-4 p-4">
        {/* Header: Name + Badge */}
        <div data-slot="form-header" className="flex items-center gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    data-slot="type-name-input"
                    onChange={(e) => {
                      field.onChange(e);
                      debouncedName(e.target.value);
                    }}
                    className="text-lg font-semibold bg-transparent border-b border-transparent
                      focus-visible:border-border-emphasis focus-visible:ring-0 shadow-none
                      px-1 py-0.5 h-auto rounded-none"
                    placeholder="Function name"
                    aria-label="Function type name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Badge variant="func">Function</Badge>
        </div>

        {/* Input Parameters */}
        <section data-slot="inputs-section" className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <FormLabel className="text-xs font-medium text-muted-foreground">
              Inputs ({data.members.length})
            </FormLabel>
          </div>

          <div data-slot="input-list" className="flex flex-col gap-0.5" role="list">
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
          </div>

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
              className="text-xs text-primary hover:underline whitespace-nowrap"
            >
              + Add Input
            </button>
          </div>
        </section>

        {/* Output Type */}
        <section data-slot="output-section" className="flex flex-col gap-1.5">
          <FormLabel className="text-xs font-medium text-muted-foreground">Output Type</FormLabel>
          <TypeSelector
            value={outputValue}
            options={availableTypes}
            onSelect={handleOutputTypeSelect}
            placeholder="Select output type..."
          />
        </section>

        {/* Expression Editor */}
        <FormField
          control={form.control}
          name="expressionText"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-muted-foreground">
                Expression
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  data-slot="expression-editor"
                  onBlur={(e) => {
                    field.onBlur();
                    handleExpressionBlur();
                  }}
                  onChange={(e) => {
                    field.onChange(e);
                    if (expressionError) setExpressionError(null);
                  }}
                  rows={4}
                  className={`text-sm font-mono resize-y ${
                    expressionError ? 'border-red-500' : ''
                  }`}
                  placeholder="Enter function expression..."
                  aria-label="Function expression"
                />
              </FormControl>
              {expressionError && (
                <p data-slot="expression-error" className="text-xs text-red-500 mt-0.5">
                  {expressionError}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

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
    </Form>
  );
}

export { FunctionForm };
