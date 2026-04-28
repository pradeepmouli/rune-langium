// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface FileTreePanelProps {
  files?: ReadonlyArray<{ path: string }>;
  activePath?: string;
  onOpen?: (path: string) => void;
}

export function FileTreePanel({
  files = [],
  activePath,
  onOpen
}: FileTreePanelProps): React.ReactElement {
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-card"
      role="region"
      aria-label="File tree"
      data-testid="panel-fileTree"
      data-component="workspace.fileTree"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Files</h2>
        <span className="text-xs text-muted-foreground">{files.length}</span>
      </div>
      <ul role="tree" className="flex-1 overflow-auto p-2">
        {files.map((f) => (
          <li key={f.path} role="treeitem" aria-selected={f.path === activePath}>
            <button
              type="button"
              onClick={() => onOpen?.(f.path)}
              className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                f.path === activePath
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/50'
              }`}
              data-testid={`file-tree-item-${f.path}`}
            >
              <span className="truncate font-medium">{f.path.split('/').pop() ?? f.path}</span>
              <span className="truncate text-[10px] text-muted-foreground">{f.path}</span>
            </button>
          </li>
        ))}
        {files.length === 0 && (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">No files loaded</li>
        )}
      </ul>
    </section>
  );
}
