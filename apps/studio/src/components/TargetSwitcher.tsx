// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import React, { useCallback } from 'react';
import type { Target } from '@rune-langium/codegen';
import { CODE_PREVIEW_PANEL_ID, TARGET_OPTIONS } from './codegen-ui.js';

export interface TargetSwitcherProps {
  value: Target;
  onChange: (target: Target) => void;
}

export function TargetSwitcher({ value, onChange }: TargetSwitcherProps): React.ReactElement {
  const activeIndex = TARGET_OPTIONS.findIndex((t) => t.value === value);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (activeIndex < 0) {
        console.error('[TargetSwitcher] Unknown target value:', value);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onChange(TARGET_OPTIONS[(activeIndex + 1) % TARGET_OPTIONS.length]!.value);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onChange(
          TARGET_OPTIONS[(activeIndex - 1 + TARGET_OPTIONS.length) % TARGET_OPTIONS.length]!.value
        );
      }
    },
    [activeIndex, onChange, value]
  );

  return (
    <div
      role="tablist"
      aria-label="Code generation target"
      data-testid="target-switcher"
      className="preview-panel__target-switcher"
      onKeyDown={handleKeyDown}
    >
      {TARGET_OPTIONS.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          id={`codegen-tab-${t.value}`}
          aria-controls={CODE_PREVIEW_PANEL_ID}
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          onClick={() => onChange(t.value)}
          data-state={value === t.value ? 'active' : 'inactive'}
          className="preview-panel__target-button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
