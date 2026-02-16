/**
 * EnumValueRow — inline editable row for a single enumeration value.
 *
 * Renders: drag handle (⠿) | value name input | display name input | remove button.
 * Uses useAutoSave for debounced name/displayName commits (500 ms).
 * Empty value names show a red border.
 *
 * @module
 */

import { useState, useCallback } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnumValueRowProps {
  /** Current value name. */
  name: string;
  /** Optional display name for the value. */
  displayName?: string;
  /** Node ID owning this enum value. */
  nodeId: string;
  /** Index position in the value list. */
  index: number;
  /** Commit value name/displayName changes: (nodeId, oldName, newName, displayName). */
  onUpdate: (nodeId: string, oldName: string, newName: string, displayName?: string) => void;
  /** Remove this enum value. */
  onRemove: (nodeId: string, valueName: string) => void;
  /** Reorder (drag) callback; fromIndex → toIndex. */
  onReorder: (nodeId: string, fromIndex: number, toIndex: number) => void;
  /** Whether the row is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EnumValueRow({
  name: initialName,
  displayName: initialDisplayName,
  nodeId,
  index,
  onUpdate,
  onRemove,
  onReorder,
  disabled = false
}: EnumValueRowProps) {
  const [localName, setLocalName] = useState(initialName);
  const [localDisplayName, setLocalDisplayName] = useState(initialDisplayName ?? '');

  // Auto-save commits name + displayName together after 500ms idle
  const debouncedUpdate = useAutoSave<{ name: string; displayName: string }>(
    useCallback(
      (val) => {
        onUpdate(nodeId, initialName, val.name, val.displayName || undefined);
      },
      [nodeId, initialName, onUpdate]
    ),
    500
  );

  // ---- Handlers -----------------------------------------------------------

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newName = e.target.value;
    setLocalName(newName);
    debouncedUpdate({ name: newName, displayName: localDisplayName });
  }

  function handleDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDisplay = e.target.value;
    setLocalDisplayName(newDisplay);
    debouncedUpdate({ name: localName, displayName: newDisplay });
  }

  function handleRemove() {
    onRemove(nodeId, initialName);
  }

  // ---- Render -------------------------------------------------------------

  const isEmpty = localName.trim() === '';

  return (
    <div data-slot="enum-value-row" className="flex items-center gap-1.5 py-1" role="listitem">
      {/* Drag handle */}
      <span
        data-slot="drag-handle"
        className="cursor-grab text-muted-foreground text-xs select-none shrink-0"
        aria-hidden="true"
      >
        ⠿
      </span>

      {/* Value name */}
      <input
        type="text"
        value={localName}
        onChange={handleNameChange}
        disabled={disabled}
        aria-label={`Value name for ${initialName || 'new value'}`}
        placeholder="Value name"
        className={`flex-1 min-w-0 px-2 py-1 text-sm rounded
          bg-transparent border
          ${isEmpty ? 'border-red-500' : 'border-border'}
          focus:outline-none focus:ring-1 focus:ring-ring`}
      />

      {/* Display name (optional) */}
      <input
        type="text"
        value={localDisplayName}
        onChange={handleDisplayNameChange}
        disabled={disabled}
        placeholder="Display name (optional)"
        className="flex-1 min-w-0 px-2 py-1 text-sm rounded
          bg-transparent border border-border
          focus:outline-none focus:ring-1 focus:ring-ring"
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={disabled}
        aria-label={`Remove value ${initialName}`}
        className="shrink-0 p-1 text-muted-foreground hover:text-destructive
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✕
      </button>
    </div>
  );
}

export { EnumValueRow };
