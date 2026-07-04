// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExportPerspective tests — Codex P2 post-fix edition.
 *
 * ExportPerspective is now a READ-ONLY consumer of `useCodegenStore`.
 * It does NOT accept a `worker` prop and does NOT subscribe to the codegen
 * worker (worker-driving lives entirely in EditorPage — single owner).
 *
 * These tests cover:
 *  1. Always renders `data-testid="export-perspective"`.
 *  2. Target selector (`CodegenTargetsTable`) is always visible; selecting a
 *     target updates the store (`activeTarget` + `codePreviewTarget`).
 *  3. Read-only preview renders the store's generated `snapshot` content.
 *  4. Empty state when there is no generated snapshot yet.
 *  5. Download action opens the config modal and calls `downloadTargetViaRouter`.
 *  6. No `CodePreviewPanel` is ever mounted (no worker subscription).
 *
 * Heavy children (CodegenTargetsTable, DownloadConfigModal) are mocked to avoid
 * needing CodeMirror / real Worker / OPFS / dockview in jsdom.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ExportPerspective } from '../../src/shell/perspectives/screens/ExportPerspective.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';
import type { Target } from '@rune-langium/codegen/export';

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.hoisted avoids the TDZ issue with module factory hoisting)
// ---------------------------------------------------------------------------

const { mockDownloadTargetViaRouter } = vi.hoisted(() => ({
  mockDownloadTargetViaRouter: vi.fn().mockResolvedValue(undefined)
}));

// ---------------------------------------------------------------------------
// Mock heavy child components
// ---------------------------------------------------------------------------

let capturedOnView: ((target: Target) => void) | undefined;
let capturedOnDownload: ((target: Target) => void) | undefined;

vi.mock('../../src/components/CodegenTargetsTable.js', () => ({
  CodegenTargetsTable: vi.fn((props: Record<string, unknown>) => {
    capturedOnView = props['onView'] as typeof capturedOnView;
    capturedOnDownload = props['onDownload'] as typeof capturedOnDownload;
    return (
      <div
        data-testid="mock-codegen-targets-table"
        data-active-target={String(props['activeTarget'] ?? '')}
        data-has-on-view={String(typeof props['onView'] === 'function')}
        data-has-on-download={String(typeof props['onDownload'] === 'function')}
      />
    );
  })
}));

// Mock the download modal so we can detect when it opens.
let capturedModalTarget: Target | undefined;
let capturedOnGenerate: ((config: Record<string, unknown>) => void) | undefined;
let capturedOnClose: (() => void) | undefined;

vi.mock('../../src/components/DownloadConfigModal.js', () => ({
  DownloadConfigModal: vi.fn((props: Record<string, unknown>) => {
    capturedModalTarget = props['target'] as Target;
    capturedOnGenerate = props['onGenerate'] as typeof capturedOnGenerate;
    capturedOnClose = props['onClose'] as typeof capturedOnClose;
    return <div data-testid="mock-download-modal" data-target={String(props['target'] ?? '')} />;
  })
}));

// Mock the download helper so tests don't need a real fetch.
vi.mock('../../src/services/workspace.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/services/workspace.js')>();
  return {
    ...mod,
    downloadTargetViaRouter: mockDownloadTargetViaRouter,
    collectCuratedBundlesFromWorkspace: vi.fn().mockReturnValue([])
  };
});

// Ensure CodePreviewPanel is NOT pulled in (belt-and-suspenders: the new
// ExportPerspective doesn't import it, but guard against regressions).
vi.mock('../../src/components/CodePreviewPanel.js', () => ({
  CodePreviewPanel: vi.fn(() => <div data-testid="mock-code-preview-panel" />)
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFiles(): import('../../src/services/workspace.js').WorkspaceFile[] {
  return [{ name: 'model.rune', path: '/ws/model.rune', content: 'namespace Foo {}', dirty: false }];
}

function seedReadySnapshot(target: Target = 'zod') {
  useCodegenStore.getState().setActiveTarget(target);
  useCodegenStore.getState().receiveCodePreviewResult({
    target,
    files: [{ relativePath: 'index.ts', content: 'export const schema = z.object({});', sourceMap: [] }]
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportPerspective', () => {
  beforeEach(() => {
    useCodegenStore.getState().resetCodegenState();
    capturedOnView = undefined;
    capturedOnDownload = undefined;
    capturedModalTarget = undefined;
    capturedOnGenerate = undefined;
    capturedOnClose = undefined;
    mockDownloadTargetViaRouter.mockClear();
  });

  it('always renders data-testid="export-perspective"', () => {
    render(<ExportPerspective />);
    expect(screen.getByTestId('export-perspective')).toBeTruthy();
  });

  it('does NOT mount CodePreviewPanel (no worker subscription in Export)', () => {
    render(<ExportPerspective />);
    expect(screen.queryByTestId('mock-code-preview-panel')).toBeNull();
  });

  describe('target selector', () => {
    it('always shows the targets table', () => {
      render(<ExportPerspective />);
      expect(screen.getByTestId('mock-codegen-targets-table')).toBeTruthy();
    });

    it('wires onView and onDownload callbacks', () => {
      render(<ExportPerspective />);
      const table = screen.getByTestId('mock-codegen-targets-table') as HTMLElement;
      expect(table.dataset['hasOnView']).toBe('true');
      expect(table.dataset['hasOnDownload']).toBe('true');
    });

    it('forwards activeTarget from store to the targets table', () => {
      useCodegenStore.getState().setActiveTarget('typescript');
      render(<ExportPerspective />);
      const table = screen.getByTestId('mock-codegen-targets-table') as HTMLElement;
      expect(table.dataset['activeTarget']).toBe('typescript');
    });

    it('handleView updates activeTarget + codePreviewTarget in store', () => {
      render(<ExportPerspective />);
      act(() => {
        capturedOnView?.('zod');
      });
      expect(useCodegenStore.getState().activeTarget).toBe('zod');
      expect(useCodegenStore.getState().codePreviewTarget).toBe('zod');
    });

    it('handleView toggles activeTarget off when the same target is clicked twice', () => {
      render(<ExportPerspective />);
      act(() => {
        capturedOnView?.('typescript');
      });
      expect(useCodegenStore.getState().activeTarget).toBe('typescript');
      act(() => {
        capturedOnView?.('typescript');
      });
      expect(useCodegenStore.getState().activeTarget).toBeUndefined();
    });
  });

  describe('read-only preview', () => {
    it('shows empty-state message when no target is selected', () => {
      render(<ExportPerspective />);
      const empty = screen.getByTestId('export-preview-empty');
      expect(empty.textContent).toMatch(/Select a target/i);
    });

    it('shows empty-state message when target is selected but snapshot is waiting', () => {
      useCodegenStore.getState().setActiveTarget('zod');
      render(<ExportPerspective />);
      // snapshot status is 'waiting' — content not yet generated
      expect(screen.queryByTestId('export-preview-content')).toBeNull();
      expect(screen.getByTestId('export-preview-empty')).toBeTruthy();
    });

    it('renders snapshot content read-only when snapshot is ready', () => {
      seedReadySnapshot('zod');
      render(<ExportPerspective />);
      const preview = screen.getByTestId('export-preview-content');
      expect(preview.textContent).toContain('export const schema = z.object({});');
    });

    it('shows the active target label in the toolbar', () => {
      seedReadySnapshot('typescript');
      render(<ExportPerspective />);
      expect(screen.getByTestId('export-active-target').textContent).toMatch(/typescript/i);
    });

    it('shows status text for waiting snapshot', () => {
      useCodegenStore.getState().setActiveTarget('zod');
      render(<ExportPerspective />);
      const status = screen.getByTestId('export-preview-status');
      expect(status.textContent).toMatch(/Generating/i);
    });

    it('shows status text for ready snapshot', () => {
      seedReadySnapshot('zod');
      render(<ExportPerspective />);
      const status = screen.getByTestId('export-preview-status');
      expect(status.textContent).toMatch(/Generated/i);
    });
  });

  describe('download action', () => {
    it('does not open modal when workspace has no files', () => {
      render(<ExportPerspective files={[]} />);
      act(() => {
        capturedOnDownload?.('zod');
      });
      expect(screen.queryByTestId('mock-download-modal')).toBeNull();
    });

    it('opens DownloadConfigModal when workspace has user files', () => {
      render(<ExportPerspective files={makeFiles()} />);
      act(() => {
        capturedOnDownload?.('typescript');
      });
      expect(screen.getByTestId('mock-download-modal')).toBeTruthy();
      expect(capturedModalTarget).toBe('typescript');
    });

    it('calls downloadTargetViaRouter when modal fires onGenerate', async () => {
      render(<ExportPerspective files={makeFiles()} />);
      act(() => {
        capturedOnDownload?.('zod');
      });
      expect(capturedOnGenerate).toBeDefined();
      await act(async () => {
        await capturedOnGenerate?.({
          target: 'zod',
          layout: undefined,
          options: undefined,
          namespaces: []
        });
      });
      expect(mockDownloadTargetViaRouter).toHaveBeenCalledOnce();
      expect(mockDownloadTargetViaRouter.mock.calls[0]?.[1]).toBe('zod');
    });

    it('closes the modal when onClose is called', () => {
      render(<ExportPerspective files={makeFiles()} />);
      act(() => {
        capturedOnDownload?.('zod');
      });
      expect(screen.getByTestId('mock-download-modal')).toBeTruthy();
      act(() => {
        capturedOnClose?.();
      });
      expect(screen.queryByTestId('mock-download-modal')).toBeNull();
    });
  });
});
