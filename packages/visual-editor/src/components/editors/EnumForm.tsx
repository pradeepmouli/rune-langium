/**
 * EnumForm — structured editor form for an Enumeration node.
 *
 * Sections:
 * 1. Header: editable name + "Enum" green badge
 * 2. Parent enum: TypeSelector (filtered to kind='enum', clearable)
 * 3. Enum values: EnumValueRow list + "Add Value" button
 * 4. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { EnumValueRow } from './EnumValueRow.js';
import { TypeSelector, getKindBadgeClasses } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
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
  /** All editor form action callbacks. */
  actions: EditorFormActions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumForm({ nodeId, data, availableTypes, actions }: EnumFormProps) {
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
        <input
          ref={nameInputRef}
          data-slot="type-name-input"
          type="text"
          value={localName}
          onChange={handleNameChange}
          className="flex-1 text-lg font-semibold bg-transparent border-b border-transparent
            focus:border-border-emphasis focus:outline-none px-1 py-0.5"
          placeholder="Enum name"
          aria-label="Enum type name"
        />
        <span
          data-slot="kind-badge"
          className={`text-xs font-medium px-2 py-0.5 rounded ${getKindBadgeClasses('enum')}`}
        >
          Enum
        </span>
      </div>

      {/* Parent Enum */}
      <section data-slot="parent-section" className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Extends</label>
        <TypeSelector
          value={parentValue ?? ''}
          options={parentOptions}
          onSelect={handleParentSelect}
          placeholder="Select parent enum..."
          allowClear
        />
      </section>

      {/* Enum Values */}
      <section data-slot="values-section" className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Values ({data.members.length})
          </label>
          <button
            data-slot="add-value-btn"
            type="button"
            onClick={handleAddValue}
            className="text-xs text-primary hover:underline"
          >
            + Add Value
          </button>
        </div>

        <div data-slot="value-list" className="flex flex-col gap-0.5" role="list">
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
              No values defined. Click "+ Add Value" to create one.
            </p>
          )}
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

export { EnumForm };
