// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CardinalityPicker — Dropdown select for cardinality with custom input option.
 *
 * Provides quick-select for common cardinalities (1..1, 0..1, 0..*, 1..*)
 * via a compact dropdown, plus a custom input that validates via `validateCardinality()`.
 */

import { useState, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system/ui/select';
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

/** Sentinel value used to trigger the custom input flow. */
const CUSTOM_VALUE = '__custom__';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Cardinality picker as a compact dropdown with 4 presets and a custom option.
 *
 * Preset selection commits immediately. Choosing "Custom…" shows an inline
 * input that validates with `validateCardinality()` on blur or Enter.
 */
export function CardinalityPicker({
  value,
  onChange,
  disabled = false
}: CardinalityPickerProps): React.ReactNode {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Normalize the value for display (strip parens)
  const normalizedValue = value.replace(/[()]/g, '').trim();

  // Find matching preset for the Select's controlled value
  const matchingPreset = PRESETS.find(
    (p) => p.value.replace(/[()]/g, '').trim() === normalizedValue
  );
  const selectValue = matchingPreset?.value ?? CUSTOM_VALUE;

  const handleSelectChange = useCallback(
    (newValue: string) => {
      if (newValue === CUSTOM_VALUE) {
        setShowCustom(true);
        setCustomValue(normalizedValue);
        setCustomError(null);
      } else {
        setShowCustom(false);
        setCustomError(null);
        onChange(newValue);
      }
    },
    [normalizedValue, onChange]
  );

  const commitCustom = useCallback(() => {
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
        commitCustom();
      }
      if (e.key === 'Escape') {
        setShowCustom(false);
        setCustomError(null);
      }
    },
    [commitCustom]
  );

  if (showCustom) {
    return (
      <div data-slot="cardinality-picker" className="flex items-center gap-1">
        <input
          type="text"
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            setCustomError(null);
          }}
          onBlur={commitCustom}
          onKeyDown={handleCustomKeyDown}
          disabled={disabled}
          placeholder="inf..sup"
          aria-label="Custom cardinality"
          aria-invalid={!!customError}
          autoFocus
          className={`w-20 rounded border px-1.5 py-0.5 text-xs font-mono
            bg-background outline-none
            focus:ring-1 focus:ring-ring
            ${customError ? 'border-destructive' : 'border-input'}`}
        />
        {customError && <span className="text-xs text-destructive">{customError}</span>}
      </div>
    );
  }

  return (
    <div data-slot="cardinality-picker">
      <Select value={selectValue} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger
          size="sm"
          className="h-6 min-w-[4.5rem] px-2 py-0 text-xs font-mono gap-1"
          aria-label="Cardinality"
        >
          <SelectValue>{normalizedValue || '1..1'}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className="min-w-[6rem]">
          {PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value} className="text-xs font-mono">
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE} className="text-xs">
            Custom…
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
