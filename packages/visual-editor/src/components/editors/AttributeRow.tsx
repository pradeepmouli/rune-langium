/**
 * AttributeRow — inline editable row for a single Data type attribute.
 *
 * Renders: drag handle (⠿) | name input | TypeSelector | CardinalityPicker | remove button.
 * Uses useAutoSave for debounced name/type commits (500 ms).
 * Override attributes display a dimmed "(override)" badge.
 *
 * @module
 */

import { useState, useCallback, useMemo } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave.js';
import { TypeSelector } from './TypeSelector.js';
import { CardinalityPicker } from './CardinalityPicker.js';
import type { MemberDisplay, TypeOption } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AttributeRowProps {
  /** Current attribute member data. */
  member: MemberDisplay;
  /** Node ID owning this attribute. */
  nodeId: string;
  /** Index position of this member in the list. */
  index: number;
  /** Available type options for the TypeSelector. */
  availableTypes: TypeOption[];
  /** Commit name/type/cardinality changes. */
  onUpdate: (
    nodeId: string,
    oldName: string,
    newName: string,
    typeName: string,
    cardinality: string
  ) => void;
  /** Remove this attribute. */
  onRemove: (nodeId: string, attrName: string) => void;
  /** Reorder (drag) callback; fromIndex → toIndex. */
  onReorder: (nodeId: string, fromIndex: number, toIndex: number) => void;
  /** Whether the form is read-only. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AttributeRow({
  member,
  nodeId,
  index,
  availableTypes,
  onUpdate,
  onRemove,
  onReorder,
  disabled = false
}: AttributeRowProps) {
  const [localName, setLocalName] = useState(member.name);

  // ---- Auto-save for name changes ------------------------------------------

  const commitName = useCallback(
    (newName: string) => {
      onUpdate(
        nodeId,
        member.name,
        newName,
        member.typeName ?? 'string',
        member.cardinality ?? '(1..1)'
      );
    },
    [nodeId, member.name, member.typeName, member.cardinality, onUpdate]
  );

  const debouncedName = useAutoSave(commitName, 500);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setLocalName(val);
    debouncedName(val);
  }

  // ---- Type selection (immediate) ------------------------------------------

  function handleTypeSelect(value: string | null) {
    if (!value) return;
    // Resolve option value (ID) to its display label for storage.
    // The store uses typeName as a display string, not the option's
    // internal value (e.g., 'builtin::string' → 'string').
    const option = availableTypes.find((o) => o.value === value);
    const typeName = option?.label ?? value;
    onUpdate(nodeId, member.name, localName, typeName, member.cardinality ?? '(1..1)');
  }

  // ---- Cardinality (immediate from picker) ---------------------------------

  function handleCardinalityChange(card: string) {
    onUpdate(nodeId, member.name, localName, member.typeName ?? 'string', card);
  }

  // ---- Drag reorder (simplified up/down for now) ---------------------------

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(fromIndex) && fromIndex !== index) {
      onReorder(nodeId, fromIndex, index);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  // ---- Remove --------------------------------------------------------------

  function handleRemove() {
    onRemove(nodeId, member.name);
  }

  // ---- Resolve typeName (label) to option value for TypeSelector ----------

  const typeValue = useMemo(() => {
    const name = member.typeName ?? '';
    // Try exact value match first, then label match
    const byValue = availableTypes.find((o) => o.value === name);
    if (byValue) return byValue.value;
    const byLabel = availableTypes.find((o) => o.label === name);
    return byLabel?.value ?? name;
  }, [member.typeName, availableTypes]);

  // ---- Render --------------------------------------------------------------

  return (
    <div
      data-slot="attribute-row"
      data-index={index}
      className={`flex items-center gap-1.5 py-1 px-1 rounded ${
        member.isOverride ? 'opacity-60' : ''
      }`}
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Drag handle */}
      <span
        data-slot="drag-handle"
        className="cursor-grab text-muted-foreground select-none text-xs"
        aria-hidden="true"
      >
        ⠿
      </span>

      {/* Name input */}
      <input
        data-slot="attribute-name"
        type="text"
        value={localName}
        onChange={handleNameChange}
        disabled={disabled}
        className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border border-transparent rounded
          focus:border-border-emphasis focus:outline-none bg-transparent"
        placeholder="name"
        aria-label={`Attribute name: ${member.name}`}
      />

      {/* Type selector */}
      <div data-slot="attribute-type" className="w-28 shrink-0">
        <TypeSelector
          value={typeValue}
          options={availableTypes}
          onSelect={handleTypeSelect}
          disabled={disabled}
          placeholder="type"
        />
      </div>

      {/* Cardinality */}
      <div data-slot="attribute-cardinality" className="shrink-0">
        <CardinalityPicker
          value={member.cardinality ?? '(1..1)'}
          onChange={handleCardinalityChange}
          disabled={disabled}
        />
      </div>

      {/* Override badge */}
      {member.isOverride && (
        <span
          data-slot="override-badge"
          className="text-xs text-muted-foreground italic whitespace-nowrap"
        >
          override
        </span>
      )}

      {/* Remove button */}
      <button
        data-slot="attribute-remove"
        type="button"
        onClick={handleRemove}
        disabled={disabled || member.isOverride}
        className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive
          disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={`Remove attribute ${member.name}`}
      >
        ✕
      </button>
    </div>
  );
}

export { AttributeRow };
