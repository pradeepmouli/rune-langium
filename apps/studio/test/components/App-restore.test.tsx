// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T027 — App workspace restore on mount (US2 / 014-studio-prod-ready).
 *
 * Verifies the FR-010 / FR-011 contract:
 *   - fresh profile          → start page renders (FileLoader copy visible)
 *   - one recent workspace   → restored at mount; body marked active
 *   - recent workspace whose
 *     OPFS handle is gone    → fall back to start page
 *
 * Regression coverage for the current restore flow: recent workspaces are
 * consulted before the start page is shown, and missing OPFS handles fall
 * back cleanly to the loader.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import { App } from '../../src/App.js';
import {
  saveWorkspace,
  _resetForTests,
  type WorkspaceRecord
} from '../../src/workspace/persistence.js';
import { createOpfsRoot, type OpfsRoot } from '../setup/opfs-mock.js';
import { saveWorkspaceFiles, setWorkspaceFilesDeps } from '../../src/workspace/workspace-files.js';

vi.mock('../../src/components/ModelLoader.js', () => ({
  ModelLoader: () => null
}));

vi.mock('../../src/pages/EditorPage.js', () => ({
  EditorPage: ({ fileCount }: { fileCount?: number }) =>
    fileCount != null ? <span>{fileCount} file(s)</span> : null
}));

vi.mock('../../src/store/model-store.js', () => ({
  useModelStore: () => new Map()
}));

vi.mock('../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({
    onStateChange: () => () => {},
    dispose: () => {}
  })
}));

vi.mock('../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    syncWorkspaceFiles: vi.fn(),
    dispose: vi.fn()
  })
}));

function makeWorkspace(
  id: string,
  name: string,
  lastOpenedAt = new Date().toISOString()
): WorkspaceRecord {
  return {
    id,
    name,
    kind: 'browser-only',
    createdAt: lastOpenedAt,
    lastOpenedAt,
    layout: { version: 1, writtenBy: '0', dockview: null },
    tabs: [],
    activeTabPath: null,
    curatedModels: [],
    schemaVersion: 1
  };
}

beforeEach(async () => {
  const opfsRoot: OpfsRoot = createOpfsRoot();
  setWorkspaceFilesDeps({
    getOpfsRoot: async () => opfsRoot as unknown as FileSystemDirectoryHandle
  });
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      getDirectory: vi.fn().mockResolvedValue(opfsRoot as unknown as FileSystemDirectoryHandle)
    }
  });
  await _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('rune-studio');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  // Body attribute is set by App on successful restore; clear between cases
  // so a passing case can't leak its `data-workspace-active` into the next.
  document.body.removeAttribute('data-workspace-active');
});

afterEach(() => {
  setWorkspaceFilesDeps({
    getOpfsRoot: async () => {
      throw new Error('test opfs root not configured');
    }
  });
  cleanup();
});

describe('App workspace restore on mount (T027/US2)', () => {
  it('renders the start page when no recents exist', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Load Rune DSL Models/i)).toBeInTheDocument();
    });
    expect(document.body).not.toHaveAttribute('data-workspace-active', 'true');
  });

  it('restores the most-recent workspace on mount when one exists', async () => {
    await saveWorkspace(makeWorkspace('ws-restored', 'Restored Project'));
    await saveWorkspaceFiles('ws-restored', [
      {
        name: 'trade.rosetta',
        path: 'trade.rosetta',
        content: 'namespace restored.project\n\ntype Trade:\n  tradeDate date (1..1)\n',
        dirty: false
      }
    ]);
    render(<App />);
    await waitFor(
      () => {
        expect(document.body).toHaveAttribute('data-workspace-active', 'true');
      },
      { timeout: 4000 }
    );
    // Start-page copy must NOT appear once a workspace has been restored.
    expect(screen.queryByText(/Load Rune DSL Models/i)).not.toBeInTheDocument();
  });

  it('reloads saved workspace files on mount', async () => {
    await saveWorkspace(makeWorkspace('ws-files', 'Restored Files'));
    await saveWorkspaceFiles('ws-files', [
      {
        name: 'trade.rosetta',
        path: 'trade.rosetta',
        content: 'namespace restored.model\n\ntype Trade:\n  tradeDate date (1..1)\n',
        dirty: false
      }
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('1 file(s)').length).toBeGreaterThan(0);
    });
    expect(document.body).toHaveAttribute('data-workspace-active', 'true');
    expect(screen.queryByText(/Load Rune DSL Models/i)).not.toBeInTheDocument();
  });

  it('falls back to start page if loadWorkspace returns nothing for the recent', async () => {
    // Persist a recents row without a corresponding workspace record by
    // mocking loadWorkspace → undefined (simulating an OPFS root that's gone
    // or a workspace metadata row that was wiped out-of-band).
    await saveWorkspace(makeWorkspace('ws-orphan', 'Orphan Project'));
    const persistence = await import('../../src/workspace/persistence.js');
    const spy = vi.spyOn(persistence, 'loadWorkspace').mockResolvedValue(undefined);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Load Rune DSL Models/i)).toBeInTheDocument();
    });
    expect(document.body).not.toHaveAttribute('data-workspace-active', 'true');
    spy.mockRestore();
  });

  it('falls back to the start page when the most recent workspace has no saved files', async () => {
    await saveWorkspace(makeWorkspace('ws-empty', 'Empty Project'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Load Rune DSL Models/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workspace-restored')).not.toBeInTheDocument();
    expect(document.body).not.toHaveAttribute('data-workspace-active', 'true');
  });
});
