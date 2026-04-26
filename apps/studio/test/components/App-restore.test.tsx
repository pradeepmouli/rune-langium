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
 * Strict TDD RED step: these assertions intentionally fail against the
 * current `App.tsx` (which boots straight into `<FileLoader>` whenever
 * `userFiles.length === 0`, without ever consulting the recents store).
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
});
