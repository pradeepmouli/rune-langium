// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface CodePreviewPanelProps {
  children?: React.ReactNode;
}

export function CodePreviewPanel({ children }: CodePreviewPanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="Code preview"
      data-testid="panel-codePreview"
      data-component="workspace.codePreview"
    >
      <h2>Code preview</h2>
      {children ?? <p>The code preview panel mounts here.</p>}
    </section>
  );
}
