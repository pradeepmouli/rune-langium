// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface EditorTab {
  path: string;
  dirty: boolean;
}

export interface EditorPanelProps {
  tabs?: ReadonlyArray<EditorTab>;
  activePath?: string | null;
  onSelect?: (path: string) => void;
  onClose?: (path: string) => void;
}

export function EditorPanel({
  tabs = [],
  activePath = null,
  onSelect,
  onClose
}: EditorPanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="Editor"
      data-testid="panel-editor"
      data-component="workspace.editor"
    >
      <div role="tablist" aria-orientation="horizontal">
        {tabs.map((t) => (
          <div key={t.path} role="tab" aria-selected={t.path === activePath}>
            <button type="button" onClick={() => onSelect?.(t.path)}>
              {/* Dirty indicator MUST be visually distinct from the close button (FR-026) */}
              {t.dirty && (
                <span aria-label="unsaved changes" data-testid={`dirty-${t.path}`}>
                  •
                </span>
              )}
              {t.path}
            </button>
            <button type="button" aria-label={`Close ${t.path}`} onClick={() => onClose?.(t.path)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={activePath ?? undefined}>
        {/* Real Monaco mounts here in a future commit — this is a stable host
         * with the right roles for FR-A03 + a11y assertions. */}
      </div>
    </section>
  );
}
