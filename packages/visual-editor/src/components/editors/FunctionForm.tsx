/**
 * FunctionForm — structured editor form for a Function node.
 *
 * Sections:
 * 1. Header: editable name + "Function" purple badge
 * 2. Input parameters: rows with name + TypeSelector, "Add Input" button
 * 3. Output type: TypeSelector for the return type
 * 4. Expression editor: textarea with validation on blur
 * 5. Metadata: definition, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TypeSelector, getKindBadgeClasses } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { useExpressionAutocomplete } from '../../hooks/useExpressionAutocomplete.js';
import { validateExpression } from '../../validation/edit-validator.js';
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
  /** All editor form action callbacks. */
  actions: EditorFormActions;
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

      <span data-slot="param-name" className="text-sm font-medium min-w-[80px]">
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
  // ---- Name editing --------------------------------------------------------

  const [localName, setLocalName] = useState(data.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalName(data.name);
  }, [data.name]);

  const commitName = useCallback(
    (newName: string) => {
      if (newName && newName.trim() && newName !== data.name) {
        actions.renameType(nodeId, newName.trim());
      }
    },
    [nodeId, data.name, actions]
  );

  const debouncedName = useAutoSave(commitName, 500);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setLocalName(val);
    debouncedName(val);
  }

  // ---- Expression editing --------------------------------------------------

  const expressionText = data.expressionText;
  const [localExpression, setLocalExpression] = useState(expressionText ?? '');
  const [expressionError, setExpressionError] = useState<string | null>(null);

  useEffect(() => {
    setLocalExpression(expressionText ?? '');
  }, [expressionText]);

  function handleExpressionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setLocalExpression(e.target.value);
    // Clear error while typing
    if (expressionError) setExpressionError(null);
  }

  function handleExpressionBlur() {
    const result = validateExpression(localExpression);
    if (!result.valid) {
      setExpressionError(result.error ?? 'Invalid expression');
    } else {
      setExpressionError(null);
      if (localExpression !== (expressionText ?? '')) {
        actions.updateExpression(nodeId, localExpression);
      }
    }
  }

  // ---- Output type ---------------------------------------------------------

  const outputType = data.outputType;

  function handleOutputTypeSelect(value: string | null) {
    if (value) {
      // Resolve value to type label
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

  // Autocomplete hook
  const { getCompletions } = useExpressionAutocomplete(availableTypes, inputParams);
  // getCompletions is available for future autocompletion popup integration

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
    <div data-slot="function-form" className="flex flex-col gap-4 p-4">
      {/* Header: Name + Badge */}
      <div data-slot="form-header" className="flex items-center gap-2">
        <input
          ref={nameInputRef}
          data-slot="type-name-input"
          type="text"
          value={localName}
          onChange={handleNameChange}
          className="flex-1 text-lg font-semibold bg-transparent border-b border-transparent
            focus:border-border-emphasis focus:outline-none px-1 py-0.5"
          placeholder="Function name"
          aria-label="Function type name"
        />
        <span
          data-slot="kind-badge"
          className={`text-xs font-medium px-2 py-0.5 rounded ${getKindBadgeClasses('func')}`}
        >
          Function
        </span>
      </div>

      {/* Input Parameters */}
      <section data-slot="inputs-section" className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Inputs ({data.members.length})
          </label>
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
          <input
            data-slot="add-param-name"
            type="text"
            value={addParamName}
            onChange={(e) => setAddParamName(e.target.value)}
            placeholder="Name"
            className="text-xs border rounded px-1.5 py-0.5 bg-transparent w-24
              focus:outline-none focus:border-primary"
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
        <label className="text-xs font-medium text-muted-foreground">Output Type</label>
        <TypeSelector
          value={outputValue}
          options={availableTypes}
          onSelect={handleOutputTypeSelect}
          placeholder="Select output type..."
        />
      </section>

      {/* Expression Editor */}
      <section data-slot="expression-section" className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Expression</label>
        <textarea
          data-slot="expression-editor"
          value={localExpression}
          onChange={handleExpressionChange}
          onBlur={handleExpressionBlur}
          rows={4}
          className={`text-sm font-mono bg-transparent border rounded px-2 py-1.5
            focus:outline-none focus:border-primary resize-y
            ${expressionError ? 'border-red-500' : 'border-border'}`}
          placeholder="Enter function expression..."
          aria-label="Function expression"
        />
        {expressionError && (
          <p data-slot="expression-error" className="text-xs text-red-500 mt-0.5">
            {expressionError}
          </p>
        )}
      </section>

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

export { FunctionForm };
