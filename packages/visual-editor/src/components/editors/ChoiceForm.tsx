/**
 * ChoiceForm — structured editor form for a Choice node.
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

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChoiceOptionRow } from './ChoiceOptionRow.js';
import { TypeSelector, getKindBadgeClasses } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
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
  /** All editor form action callbacks. */
  actions: EditorFormActions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChoiceForm({ nodeId, data, availableTypes, actions }: ChoiceFormProps) {
  // ---- Name editing --------------------------------------------------------

  const [localName, setLocalName] = useState(data.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync localName when node selection changes
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

  // ---- Option callbacks ----------------------------------------------------

  function handleRemoveOption(nId: string, typeName: string) {
    actions.removeChoiceOption(nId, typeName);
  }

  function handleAddOption(value: string | null) {
    if (value) {
      // Extract the type label from the option value (format: "namespace::name")
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
        <input
          ref={nameInputRef}
          data-slot="type-name-input"
          type="text"
          value={localName}
          onChange={handleNameChange}
          className="flex-1 text-lg font-semibold bg-transparent border-b border-transparent
            focus:border-border-emphasis focus:outline-none px-1 py-0.5"
          placeholder="Choice name"
          aria-label="Choice type name"
        />
        <span
          data-slot="kind-badge"
          className={`text-xs font-medium px-2 py-0.5 rounded ${getKindBadgeClasses('choice')}`}
        >
          Choice
        </span>
      </div>

      {/* Options */}
      <section data-slot="options-section" className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Options ({data.members.length})
          </label>
        </div>

        <div data-slot="option-list" className="flex flex-col gap-0.5">
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
        </div>

        {/* Add Option via TypeSelector */}
        <div data-slot="add-option" className="mt-1">
          <TypeSelector
            value=""
            options={addableTypes}
            onSelect={handleAddOption}
            placeholder="Add option..."
          />
        </div>
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

export { ChoiceForm };
