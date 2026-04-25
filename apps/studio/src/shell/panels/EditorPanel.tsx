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

// File paths can contain `/`, `.`, and other characters that aren't valid in
// HTML ids (and risk colliding with paths from other panels). Hash to a stable
// alphanumeric id so `aria-controls` / `aria-labelledby` actually resolve.
function tabId(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = (h * 31 + path.charCodeAt(i)) | 0;
  }
  return `editor-tab-${(h >>> 0).toString(36)}`;
}

function tabPanelId(path: string): string {
  return `${tabId(path)}-panel`;
}

export function EditorPanel({
  tabs = [],
  activePath = null,
  onSelect,
  onClose
}: EditorPanelProps): React.ReactElement {
  const activeTabId = activePath ? tabId(activePath) : undefined;
  const activeTabPanelId = activePath ? tabPanelId(activePath) : undefined;
  return (
    <section
      role="region"
      aria-label="Editor"
      data-testid="panel-editor"
      data-component="workspace.editor"
    >
      <div role="tablist" aria-orientation="horizontal">
        {tabs.map((t) => {
          const id = tabId(t.path);
          const isActive = t.path === activePath;
          return (
            <div
              key={t.path}
              role="tab"
              id={id}
              aria-selected={isActive}
              aria-controls={isActive ? tabPanelId(t.path) : undefined}
            >
              <button type="button" onClick={() => onSelect?.(t.path)}>
                {/* Dirty indicator MUST be visually distinct from the close button (FR-026) */}
                {t.dirty && (
                  <span aria-label="unsaved changes" data-testid={`dirty-${t.path}`}>
                    •
                  </span>
                )}
                {t.path}
              </button>
              <button
                type="button"
                aria-label={`Close ${t.path}`}
                onClick={() => onClose?.(t.path)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div role="tabpanel" id={activeTabPanelId} aria-labelledby={activeTabId}>
        {/* Real Monaco mounts here in a future commit — this is a stable host
         * with the right roles for FR-A03 + a11y assertions. */}
      </div>
    </section>
  );
}
