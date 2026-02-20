/**
 * EnumValueRow — inline editable row for a single enumeration value.
 *
 * Uses local state (name + displayName) and debounces commits via
 * useAutoSave. Does not depend on react-hook-form FormProvider so it
 * can be used standalone or inside any parent form.
 *
 * Renders: drag handle (⠿) | value name input | display name input | remove button.
 * Name/displayName changes are debounced (500 ms). Empty names show a red border.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnumValueRowProps {
  /** Current value name (used as initial state and committed reference). */
  name: string;
  /** Current display name (used as initial state). */
  displayName: string;
  /** Node ID of the parent Enum — forwarded to callbacks for store dispatch. */
  nodeId: string;
  /** Index position of this member in the list. */
  index: number;
  /** Commit value name/displayName changes to the graph. */
  onUpdate: (nodeId: string, oldName: string, newName: string, displayName?: string) => void;
  /** Remove this enum value. */
  onRemove: (nodeId: string, valueName: string) => void;
  /** Reorder (drag) callback; fromIndex → toIndex. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Whether the row is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumValueRow({
  name,
  displayName,
  nodeId,
  index,
  onUpdate,
  onRemove,
  onReorder,
  disabled = false
}: EnumValueRowProps) {
  const [localName, setLocalName] = useState(name);
  const [localDisplayName, setLocalDisplayName] = useState(displayName);

  // ---- Name auto-save (debounced) ------------------------------------------

  const commitNameChange = useCallback(
    (newName: string) => {
      onUpdate(nodeId, name, newName, localDisplayName || undefined);
    },
    [nodeId, name, localDisplayName, onUpdate]
  );

  const debouncedName = useAutoSave(commitNameChange, 500);

  // ---- Display name auto-save (debounced) ----------------------------------

  const commitDisplayName = useCallback(
    (newDisplayName: string) => {
      onUpdate(nodeId, name, localName, newDisplayName || undefined);
    },
    [nodeId, name, localName, onUpdate]
  );

  const debouncedDisplayName = useAutoSave(commitDisplayName, 500);

  // ---- Drag reorder --------------------------------------------------------

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(fromIndex) && fromIndex !== index) {
      onReorder(fromIndex, index);
    }
  }

  // ---- Render -------------------------------------------------------------

  const isEmpty = localName.trim() === '';

  return (
    <div
      data-slot="enum-value-row"
      className="flex items-center gap-1.5 py-1"
      role="listitem"
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag handle */}
      <span
        data-slot="drag-handle"
        className="cursor-grab text-muted-foreground text-xs select-none shrink-0"
        aria-hidden="true"
      >
        ⠿
      </span>

      {/* Value name input */}
      <input
        type="text"
        value={localName}
        onChange={(e) => {
          setLocalName(e.target.value);
          debouncedName(e.target.value);
        }}
        disabled={disabled}
        aria-label={`Value name for ${name || 'new value'}`}
        placeholder="Value name"
        className={`flex-1 min-w-0 px-2 py-1 text-sm rounded
          bg-transparent border
          ${isEmpty ? 'border-red-500' : 'border-border'}
          focus:outline-none focus:ring-1 focus:ring-ring`}
      />

      {/* Display name input */}
      <input
        type="text"
        value={localDisplayName}
        onChange={(e) => {
          setLocalDisplayName(e.target.value);
          debouncedDisplayName(e.target.value);
        }}
        disabled={disabled}
        placeholder="Display name (optional)"
        className="flex-1 min-w-0 px-2 py-1 text-sm rounded
          bg-transparent border border-border
          focus:outline-none focus:ring-1 focus:ring-ring"
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(nodeId, name)}
        disabled={disabled}
        aria-label={`Remove value ${name || 'unnamed'}`}
        className="shrink-0 p-1 text-muted-foreground hover:text-destructive
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✕
      </button>
    </div>
  );
}

export { EnumValueRow };
