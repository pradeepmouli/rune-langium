/**
 * ChoiceOptionRow — read-only display row for a single Choice option.
 *
 * Renders: type label with kind-colored badge + remove button.
 * Removing an option triggers both member and edge removal.
 *
 * @module
 */

import { getKindBadgeClasses } from './TypeSelector.js';
import type { TypeOption } from '../../types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChoiceOptionRowProps {
  /** The type name for this choice option. */
  typeName: string;
  /** Node ID owning this choice. */
  nodeId: string;
  /** Available type options (for badge styling lookup). */
  availableTypes: TypeOption[];
  /** Remove this option. */
  onRemove: (nodeId: string, typeName: string) => void;
  /** Whether the row is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChoiceOptionRow({
  typeName,
  nodeId,
  availableTypes,
  onRemove,
  disabled = false
}: ChoiceOptionRowProps) {
  const matchedType = availableTypes.find((opt) => opt.label === typeName);
  const kind = matchedType?.kind ?? 'data';

  function handleRemove() {
    onRemove(nodeId, typeName);
  }

  return (
    <div data-slot="choice-option-row" className="flex items-center gap-2 py-1.5 px-1">
      {/* Kind badge */}
      <span
        className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${getKindBadgeClasses(kind)}`}
      >
        {typeName}
      </span>

      {matchedType?.namespace && (
        <span className="text-xs text-muted-foreground truncate">{matchedType.namespace}</span>
      )}

      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={disabled}
        aria-label={`Remove option ${typeName}`}
        className="ml-auto shrink-0 p-1 text-muted-foreground hover:text-destructive
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✕
      </button>
    </div>
  );
}

export { ChoiceOptionRow };
