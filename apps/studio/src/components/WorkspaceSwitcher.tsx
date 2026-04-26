// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * WorkspaceSwitcher — recent-workspaces list backed by the persistence
 * `recents` IDB store. Distinguishes the three kinds visually via
 * `data-kind` so the design system can theme each independently.
 */

import { useEffect, useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { listRecents, type RecentWorkspaceRecord } from '../workspace/persistence.js';

interface Props {
  onOpen: (workspaceId: string) => void;
  onCreate: () => void;
  onDelete: (workspaceId: string) => void;
}

const KIND_LABEL: Record<RecentWorkspaceRecord['kind'], string> = {
  'browser-only': 'Browser-only',
  'folder-backed': 'Folder',
  'git-backed': 'Git'
};

export function WorkspaceSwitcher({ onOpen, onCreate, onDelete }: Props): React.ReactElement {
  const [rows, setRows] = useState<RecentWorkspaceRecord[]>([]);

  useEffect(() => {
    void listRecents().then(setRows);
  }, []);

  function handleDelete(row: RecentWorkspaceRecord) {
    if (typeof confirm === 'function' && !confirm(`Delete workspace "${row.name}"?`)) return;
    onDelete(row.id);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  return (
    <div data-testid="workspace-switcher">
      <Button onClick={onCreate}>New workspace</Button>
      <ul>
        {rows.map((row) => (
          <li key={row.id} data-testid="workspace-row" data-id={row.id} data-kind={row.kind}>
            <button type="button" onClick={() => onOpen(row.id)} aria-label={`Open ${row.name}`}>
              {row.name}
              <span> ({KIND_LABEL[row.kind]})</span>
            </button>
            <Button
              variant="ghost"
              onClick={() => handleDelete(row)}
              aria-label={`Delete ${row.name}`}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
