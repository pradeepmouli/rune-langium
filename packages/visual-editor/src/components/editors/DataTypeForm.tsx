/**
 * DataTypeForm — structured editor form for a Data type node.
 *
 * Sections:
 * 1. Header: editable name + "Data" blue badge
 * 2. Inheritance: TypeSelector for parent type (clearable)
 * 3. Attributes: AttributeRow list + "Add Attribute" button
 * 4. Metadata: description, comments, synonyms (MetadataSection)
 *
 * @module
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AttributeRow } from './AttributeRow.js';
import { TypeSelector, getKindBadgeClasses } from './TypeSelector.js';
import { MetadataSection } from './MetadataSection.js';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import type { TypeNodeData, TypeOption, EditorFormActions, MemberDisplay } from '../../types.js';

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
  /** All editor form action callbacks. */
  actions: EditorFormActions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DataTypeForm({ nodeId, data, availableTypes, actions }: DataTypeFormProps) {
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

  // Find current parent value (if any)
  const parentValue = data.parentName
    ? (availableTypes.find((opt) => opt.label === data.parentName)?.value ?? null)
    : null;

  // ---- Render --------------------------------------------------------------

  return (
    <div data-slot="data-type-form" className="flex flex-col gap-4 p-4">
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
          placeholder="Type name"
          aria-label="Data type name"
        />
        <span
          data-slot="kind-badge"
          className={`text-xs font-medium px-2 py-0.5 rounded ${getKindBadgeClasses('data')}`}
        >
          Data
        </span>
      </div>

      {/* Inheritance */}
      <section data-slot="inheritance-section" className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Extends</label>
        <TypeSelector
          value={parentValue ?? ''}
          options={parentOptions}
          onSelect={handleParentSelect}
          placeholder="Select parent type..."
          allowClear
        />
      </section>

      {/* Attributes */}
      <section data-slot="attributes-section" className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Attributes ({data.members.length})
          </label>
          <button
            data-slot="add-attribute-btn"
            type="button"
            onClick={handleAddAttribute}
            className="text-xs text-primary hover:underline"
          >
            + Add Attribute
          </button>
        </div>

        <div data-slot="attribute-list" className="flex flex-col gap-0.5">
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
              No attributes defined. Click "+ Add Attribute" to create one.
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

export { DataTypeForm };
