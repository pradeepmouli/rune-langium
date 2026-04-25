// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface VisualPreviewPanelProps {
  children?: React.ReactNode;
}

export function VisualPreviewPanel({ children }: VisualPreviewPanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="Visual preview"
      data-testid="panel-visualPreview"
      data-component="workspace.visualPreview"
    >
      <h2>Visual preview</h2>
      {children ?? <p>The visual editor preview mounts here.</p>}
    </section>
  );
}
