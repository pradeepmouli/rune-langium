// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { useUtilityTrayControls } from '../utility-tray-context.js';

export interface OutputPanelProps {
  lines?: ReadonlyArray<string>;
}

export function OutputPanel({ lines = [] }: OutputPanelProps): React.ReactElement {
  const { utilitiesCollapsed, setUtilitiesCollapsed } = useUtilityTrayControls();

  return (
    <section
      role="region"
      aria-label="Messages"
      data-testid="panel-output"
      data-component="workspace.output"
    >
      <div className="flex items-center justify-between gap-2">
        <h2>Messages</h2>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-[11px] text-foreground"
          onClick={() => setUtilitiesCollapsed(!utilitiesCollapsed)}
        >
          {utilitiesCollapsed ? 'Show utilities' : 'Hide utilities'}
        </button>
      </div>
      <pre aria-live="polite">{lines.join('\n')}</pre>
    </section>
  );
}
