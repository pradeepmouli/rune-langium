// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface OutputPanelProps {
  lines?: ReadonlyArray<string>;
}

export function OutputPanel({ lines = [] }: OutputPanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="Output"
      data-testid="panel-output"
      data-component="workspace.output"
    >
      <h2>Output</h2>
      <pre aria-live="polite">{lines.join('\n')}</pre>
    </section>
  );
}
