// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
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
  return (
    <div role="tablist" aria-label="Code generation target" data-testid="target-switcher">
      {TARGETS.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          data-state={value === t.value ? 'active' : 'inactive'}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
