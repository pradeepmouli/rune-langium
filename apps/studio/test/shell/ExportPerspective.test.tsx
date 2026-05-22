// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExportPerspective tests.
 *
 * These tests cover:
 *  1. Always renders `data-testid="export-perspective"`.
 *  2. Without a `worker` prop: shows the targets table + a "worker pending"
 *     notice (degraded mode; safe before Task 8 wires the Worker seam).
 *  3. With a `worker` prop: renders CodePreviewPanel instead of the pending notice.
 *  4. Store-backed `activeTarget` flows into the targets table in degraded mode.
 *
 * Heavy children (CodePreviewPanel, CodegenTargetsTable) are mocked to avoid
 * needing a real Worker, OPFS, CodeMirror, or dockview in jsdom.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ExportPerspective } from '../../src/shell/perspectives/screens/ExportPerspective.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';

// ---------------------------------------------------------------------------
// Mock heavy child components so jsdom doesn't need CodeMirror / real Worker.
// ---------------------------------------------------------------------------

// Capture the most-recently-rendered onView / onDownload callbacks so tests
// can invoke them directly to simulate user clicks on the targets table.
let capturedOnView: ((target: import('@rune-langium/codegen').Target) => void) | undefined;
let capturedOnDownload: ((target: import('@rune-langium/codegen').Target) => void) | undefined;

vi.mock('../../src/components/CodePreviewPanel.js', () => ({
  CodePreviewPanel: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="mock-code-preview-panel" data-has-worker={String(!!props['worker'])} />
  ))
}));

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorker(): Worker {
  return { postMessage: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Worker;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportPerspective', () => {
  beforeEach(() => {
    // Reset codegen store to defaults between tests.
    useCodegenStore.getState().resetCodegenState();
    capturedOnView = undefined;
    capturedOnDownload = undefined;
  });

  it('always renders data-testid="export-perspective"', () => {
    render(<ExportPerspective />);
    expect(screen.getByTestId('export-perspective')).toBeTruthy();
  });

  describe('degraded mode (no worker prop)', () => {
    it('shows the targets table', () => {
      render(<ExportPerspective />);
      expect(screen.getByTestId('mock-codegen-targets-table')).toBeTruthy();
    });

    it('shows the "worker pending" notice with transient-loading copy', () => {
      render(<ExportPerspective />);
      const notice = screen.getByTestId('export-worker-pending');
      expect(notice).toBeTruthy();
      expect(notice.textContent).toMatch(/Preparing the code generator/i);
    });

    it('does NOT render CodePreviewPanel', () => {
      render(<ExportPerspective />);
      expect(screen.queryByTestId('mock-code-preview-panel')).toBeNull();
    });

    it('wires onView and onDownload callbacks to the targets table', () => {
      render(<ExportPerspective />);
      const table = screen.getByTestId('mock-codegen-targets-table') as HTMLElement;
      expect(table.dataset['hasOnView']).toBe('true');
      expect(table.dataset['hasOnDownload']).toBe('true');
    });

    it('forwards the store activeTarget to the targets table', () => {
      useCodegenStore.getState().setActiveTarget('typescript');
      render(<ExportPerspective />);
      const table = screen.getByTestId('mock-codegen-targets-table') as HTMLElement;
      expect(table.dataset['activeTarget']).toBe('typescript');
    });

    it('handleView updates activeTarget + codePreviewTarget in store even when worker is absent', () => {
      render(<ExportPerspective />);
      // Simulate clicking "View" on the zod row — no worker provided.
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

  describe('full mode (worker prop provided)', () => {
    it('renders CodePreviewPanel instead of the targets-section + notice', () => {
      const worker = makeWorker();
      render(<ExportPerspective worker={worker} />);
      expect(screen.getByTestId('mock-code-preview-panel')).toBeTruthy();
      // The degraded notice must NOT be present when the worker is wired
      expect(screen.queryByTestId('export-worker-pending')).toBeNull();
    });

    it('passes the worker to CodePreviewPanel', () => {
      const worker = makeWorker();
      render(<ExportPerspective worker={worker} />);
      const panel = screen.getByTestId('mock-code-preview-panel') as HTMLElement;
      expect(panel.dataset['hasWorker']).toBe('true');
    });

    it('does NOT render the degraded targets section separately', () => {
      const worker = makeWorker();
      render(<ExportPerspective worker={worker} />);
      expect(screen.queryByTestId('export-targets-section')).toBeNull();
    });
  });
});
