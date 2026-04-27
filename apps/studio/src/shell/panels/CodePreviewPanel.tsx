// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { useCodegenStore } from '../../store/codegen-store.js';
import { TARGET_LABELS } from '../../components/codegen-ui.js';

export interface CodePreviewPanelProps {
  children?: React.ReactNode;
}

/**
 * Shell stub for the `workspace.codePreview` dock panel.
 * Reads from `useCodegenStore` so the panel reflects target selection even
 * before the real CodePreviewPanel (from `src/components/CodePreviewPanel`)
 * is wired in via `DockShell.panelComponents` with a Worker reference.
 */
export function CodePreviewPanel({ children }: CodePreviewPanelProps): React.ReactElement {
  const target = useCodegenStore((s) => s.codePreviewTarget);
  const label = TARGET_LABELS[target];

  return (
    <section
      role="region"
      aria-label="Code preview"
      data-testid="panel-codePreview"
      data-component="workspace.codePreview"
    >
      <h2>Code preview — {label}</h2>
      {children ?? (
        <p>
          Code preview connects once the LSP worker is wired via{' '}
          <code>DockShell.panelComponents['workspace.codePreview']</code>.
        </p>
      )}
    </section>
  );
}
