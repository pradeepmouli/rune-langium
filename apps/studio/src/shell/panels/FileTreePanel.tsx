// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface FileTreePanelProps {
  files?: ReadonlyArray<{ path: string }>;
  onOpen?: (path: string) => void;
}

export function FileTreePanel({ files = [], onOpen }: FileTreePanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="File tree"
      data-testid="panel-fileTree"
      data-component="workspace.fileTree"
    >
      <h2>Files</h2>
      <ul role="tree">
        {files.map((f) => (
          <li key={f.path} role="treeitem">
            <button type="button" onClick={() => onOpen?.(f.path)}>
              {f.path}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
