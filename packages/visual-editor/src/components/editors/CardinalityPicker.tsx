// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CardinalityPicker — Dropdown select for cardinality with custom input option.
 *
 * Provides quick-select for common cardinalities (1..1, 0..1, 0..*, 1..*)
 * via a compact dropdown, plus a custom input that validates via `validateCardinality()`.
 */

import { useState, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rune-langium/design-system/ui/select';
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
  /**
   * Visual variant for the trigger.
   * - `'default'`: compact input-box look (h-5, rounded).
   * - `'chip'`: pill/chip look matching the structure-view cardinality cell.
   * - `'pill'`: rounded muted-box look matching the inspector type-reference
   *   field, so the cardinality selector and the type picker share an aesthetic.
   */
  variant?: 'default' | 'chip' | 'pill';
  /** Optional wrapper class override for host-specific layouts. */
  wrapperClassName?: string;
  /** Optional trigger class override for compact host-specific chrome. */
  triggerClassName?: string;
  /** Optional popup class override. */
  contentClassName?: string;
  /** Optional custom-input class override. */
  inputClassName?: string;
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

function joinClasses(...classNames: Array<string | undefined>): string | undefined {
  const joined = classNames.filter((className) => Boolean(className && className.trim())).join(' ');
  return joined.length > 0 ? joined : undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Cardinality picker as a compact dropdown with 4 presets and a custom option.
 *
 * Preset selection commits immediately. Choosing "Custom…" shows an inline
 * input that validates with `validateCardinality()` on blur or Enter.
 */
/** Canonical chip trigger class for the structure-view cardinality cell look. */
const CHIP_TRIGGER_CLASS =
  'rune-cell-card h-auto min-w-0 border-0 bg-muted px-[var(--rune-pill-padding-x)] py-[var(--rune-chip-padding-y)] text-2xs text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Inspector pill trigger — wears the shared `.rune-inspector-pill` box (the same
 * SSoT muted-rounded-field aesthetic as the type-reference field), so the
 * cardinality selector and the type picker stay visually in sync from one place.
 * `shadow-none` cancels the shadcn SelectTrigger default ring/shadow.
 */
const PILL_TRIGGER_CLASS = 'rune-inspector-pill shadow-none';

export function CardinalityPicker({
  value,
  onChange,
  disabled = false,
  variant = 'default',
  wrapperClassName,
  triggerClassName,
  contentClassName,
  inputClassName
}: CardinalityPickerProps): React.ReactNode {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Normalize the value for display (strip parens)
  const normalizedValue = value.replace(/[()]/g, '').trim();
  const hasValue = normalizedValue.length > 0;

  // Find matching preset for the Select's controlled value
  const matchingPreset = PRESETS.find((p) => p.value.replace(/[()]/g, '').trim() === normalizedValue);
  const selectValue = hasValue ? (matchingPreset?.value ?? CUSTOM_VALUE) : null;

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
      <div data-slot="cardinality-picker" className={joinClasses('flex items-center gap-1', wrapperClassName)}>
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
          className={joinClasses(
            `w-[4.25rem] rounded border px-1.5 py-0.5 text-2xs font-mono leading-none
            bg-background outline-none
            focus-visible:ring-1 focus-visible:ring-ring
            disabled:cursor-not-allowed disabled:opacity-50
            ${customError ? 'border-destructive' : 'border-input'}`,
            inputClassName
          )}
        />
        {customError && <span className="text-xs text-destructive">{customError}</span>}
      </div>
    );
  }

  return (
    <div data-slot="cardinality-picker" className={wrapperClassName}>
      <Select value={selectValue} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger
          size="sm"
          className={joinClasses(
            variant === 'chip'
              ? CHIP_TRIGGER_CLASS
              : variant === 'pill'
                ? PILL_TRIGGER_CLASS
                : 'h-5 min-w-[3.75rem] rounded-md px-1.5 py-0 text-2xs font-mono leading-none gap-0.5',
            triggerClassName
          )}
          aria-label="Cardinality"
        >
          <SelectValue placeholder="1..1">{hasValue ? normalizedValue : undefined}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className={joinClasses('min-w-[5.5rem]', contentClassName)}>
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
