// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useCallback } from 'react';
import type { Target } from '@rune-langium/codegen';

export interface TargetSwitcherProps {
  value: Target;
  onChange: (target: Target) => void;
}

const TARGETS: { value: Target; label: string }[] = [
  { value: 'zod', label: 'Zod' },
  { value: 'json-schema', label: 'JSON Schema' },
  { value: 'typescript', label: 'TypeScript' }
];

export function TargetSwitcher({ value, onChange }: TargetSwitcherProps): React.ReactElement {
  const activeIndex = TARGETS.findIndex((t) => t.value === value);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onChange(TARGETS[(activeIndex + 1) % TARGETS.length]!.value);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onChange(TARGETS[(activeIndex - 1 + TARGETS.length) % TARGETS.length]!.value);
      }
    },
    [activeIndex, onChange]
  );

  return (
    <div
      role="tablist"
      aria-label="Code generation target"
      data-testid="target-switcher"
      onKeyDown={handleKeyDown}
    >
      {TARGETS.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          id={`codegen-tab-${t.value}`}
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          onClick={() => onChange(t.value)}
          data-state={value === t.value ? 'active' : 'inactive'}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
