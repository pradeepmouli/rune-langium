/**
 * CardinalityPicker — 4 preset toggle buttons + custom input.
 *
 * Provides quick-select for common cardinalities (1..1, 0..1, 0..*, 1..*)
 * with a custom input field that validates via `validateCardinality()`.
 */

import { useState, useCallback } from 'react';
import { validateCardinality } from '../../validation/edit-validator.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CardinalityPickerProps {
  /** Current cardinality value (e.g., "(0..*)"). */
  value: string;
  /** Called when cardinality changes. */
  onChange: (cardinality: string) => void;
  /** Whether the picker is disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: '1..1', value: '(1..1)' },
  { label: '0..1', value: '(0..1)' },
  { label: '0..*', value: '(0..*)' },
  { label: '1..*', value: '(1..*)' }
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Cardinality picker with 4 preset toggle buttons and a custom input field.
 *
 * Preset clicks commit immediately. Custom input validates with
 * `validateCardinality()` on blur.
 */
export function CardinalityPicker({
  value,
  onChange,
  disabled = false
}: CardinalityPickerProps): React.ReactNode {
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  // Normalize the value for comparison with presets
  const normalizedValue = value.replace(/[()]/g, '').trim();
  const isPresetActive = (preset: (typeof PRESETS)[number]): boolean => {
    const presetNorm = preset.value.replace(/[()]/g, '').trim();
    return normalizedValue === presetNorm;
  };

  const handlePresetClick = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      if (disabled) return;
      setShowCustom(false);
      setCustomError(null);
      onChange(preset.value);
    },
    [disabled, onChange]
  );

  const handleCustomToggle = useCallback(() => {
    setShowCustom((prev) => !prev);
    setCustomError(null);
    // Pre-fill custom input with current value (without parens)
    setCustomValue(normalizedValue);
  }, [normalizedValue]);

  const handleCustomBlur = useCallback(() => {
    if (!customValue.trim()) {
      setCustomError(null);
      return;
    }
    const error = validateCardinality(customValue);
    if (error) {
      setCustomError(error);
    } else {
      setCustomError(null);
      const formatted = customValue.startsWith('(') ? customValue : `(${customValue})`;
      onChange(formatted);
      setShowCustom(false);
    }
  }, [customValue, onChange]);

  const handleCustomKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCustomBlur();
      }
      if (e.key === 'Escape') {
        setShowCustom(false);
        setCustomError(null);
      }
    },
    [handleCustomBlur]
  );

  return (
    <div data-slot="cardinality-picker" className="flex items-center gap-1">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => handlePresetClick(preset)}
          disabled={disabled}
          data-active={isPresetActive(preset) || undefined}
          aria-pressed={isPresetActive(preset)}
          className="rounded px-1.5 py-0.5 text-xs font-mono transition-colors
            data-[active]:bg-accent-emphasis data-[active]:text-text-on-emphasis
            hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {preset.label}
        </button>
      ))}

      <button
        type="button"
        onClick={handleCustomToggle}
        disabled={disabled}
        data-active={showCustom || undefined}
        aria-label="Custom cardinality"
        className="rounded px-1.5 py-0.5 text-xs transition-colors
          data-[active]:bg-surface-raised hover:bg-surface-raised
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ···
      </button>

      {showCustom && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={customValue}
            onChange={(e) => {
              setCustomValue(e.target.value);
              setCustomError(null);
            }}
            onBlur={handleCustomBlur}
            onKeyDown={handleCustomKeyDown}
            disabled={disabled}
            placeholder="inf..sup"
            aria-label="Custom cardinality"
            aria-invalid={!!customError}
            className={`w-20 rounded border px-1.5 py-0.5 text-xs font-mono
              bg-surface-base outline-none
              focus:ring-1 focus:ring-ring
              ${customError ? 'border-status-error' : 'border-border-emphasis'}`}
          />
          {customError && <span className="text-xs text-status-error">{customError}</span>}
        </div>
      )}
    </div>
  );
}
