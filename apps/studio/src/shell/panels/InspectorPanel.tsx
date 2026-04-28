// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface InspectorPanelProps {
  /** Slot where the migrated z2f form will mount (Phase 7). */
  children?: React.ReactNode;
}

export function InspectorPanel({ children }: InspectorPanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="Inspector"
      data-testid="panel-inspector"
      data-component="workspace.inspector"
      className="flex h-full flex-col overflow-hidden"
    >
      {children ?? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
          Select a node in the editor or visual preview to inspect it.
        </div>
      )}
    </section>
  );
}
