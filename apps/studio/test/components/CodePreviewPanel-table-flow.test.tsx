// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * 018 Phase 0 Task 0.8 — integration coverage for the table-as-landing
 * flow on CodePreviewPanel.
 *
 * Verifies:
 *   - panel mounts to the targets table (activeTarget=undefined initial)
 *   - no codegen request is dispatched while the table is showing
 *   - clicking [View] enters the viewer for that target AND triggers codegen
 *   - clicking the ← Targets button returns to the table
 *   - the obsolete TargetSwitcher tabs are no longer rendered
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('@codemirror/view', () => ({
  EditorView: class MockEditorView {
    dom = document.createElement('div');
    state = { doc: { toString: () => '' } };
    destroy = vi.fn();
    dispatch = vi.fn();
    static theme = vi.fn(() => []);
    static updateListener = { of: vi.fn(() => []) };
    static domEventHandlers = vi.fn(() => []);
    static lineWrapping = [];
    constructor({ parent }: { parent?: Element }) {
      if (parent) parent.appendChild(this.dom);
    }
  },
  lineNumbers: vi.fn(() => []),
  highlightActiveLine: vi.fn(() => []),
  drawSelection: vi.fn(() => [])
}));
vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn(() => ({})), readOnly: { of: vi.fn(() => []) } },
  Compartment: class {
    of = vi.fn(() => []);
    reconfigure = vi.fn(() => ({}));
  }
}));
vi.mock('@codemirror/language', () => ({
  StreamLanguage: { define: vi.fn(() => []) },
  HighlightStyle: { define: vi.fn(() => ({})) },
  syntaxHighlighting: vi.fn(() => [])
}));
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => []) }));
vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => []) }));

import { CodePreviewPanel } from '../../src/components/CodePreviewPanel.js';
import { useCodegenStore } from '../../src/store/codegen-store.js';

afterEach(() => cleanup());
beforeEach(() => useCodegenStore.getState().resetCodegenState());

function makeWorker() {
  return {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

describe('CodePreviewPanel table-as-landing flow', () => {
  it('renders the targets table on initial mount (activeTarget undefined)', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(screen.getByTestId('codegen-targets-table')).toBeTruthy();
    expect(screen.queryByTestId('code-preview-editor')).toBeNull();
  });

  it('does not request codegen while the table is showing', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(w.postMessage).not.toHaveBeenCalled();
  });

  it('clicking the eye on a row opens the preview below the table (table stays visible)', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-typescript'));
    // store transitions to viewer mode
    expect(useCodegenStore.getState().activeTarget).toBe('typescript');
    expect(useCodegenStore.getState().codePreviewTarget).toBe('typescript');
    // 019 polish — table stays mounted; viewer expands below it.
    expect(screen.getByTestId('codegen-targets-table')).toBeTruthy();
    expect(screen.getByTestId('code-preview-editor')).toBeTruthy();
    // codegen dispatched for the chosen target
    expect(w.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codegen:generate', target: 'typescript' })
    );
  });

  it('clicking the eye a second time on the active row toggles the preview off', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    expect(useCodegenStore.getState().activeTarget).toBe('zod');
    // Toggle off — second click on the same row's eye icon.
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    expect(useCodegenStore.getState().activeTarget).toBeUndefined();
    // Table still visible; viewer is gone.
    expect(screen.getByTestId('codegen-targets-table')).toBeTruthy();
    expect(screen.queryByTestId('code-preview-editor')).toBeNull();
  });

  it('clicking the eye on a different row swaps the preview without closing it', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    expect(useCodegenStore.getState().activeTarget).toBe('zod');
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-typescript'));
    expect(useCodegenStore.getState().activeTarget).toBe('typescript');
    expect(screen.getByTestId('code-preview-editor')).toBeTruthy();
    // codegen ran for both targets.
    expect(
      w.postMessage.mock.calls.filter((c) => (c[0] as { target?: string })?.target === 'typescript')
    ).not.toHaveLength(0);
  });

  it('toggling the eye off then back on re-triggers codegen for the same target', async () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    const callsAfterFirstView = w.postMessage.mock.calls.length;
    // toggle off
    await act(async () => {
      fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    });
    // toggle back on
    await act(async () => {
      fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    });
    expect(w.postMessage.mock.calls.length).toBeGreaterThan(callsAfterFirstView);
  });

  it('does not render the old TargetSwitcher tabs in either mode', () => {
    const w = makeWorker();
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} />);
    expect(screen.queryByTestId('target-switcher')).toBeNull();
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    expect(screen.queryByTestId('target-switcher')).toBeNull();
  });

  // 018 Task 0.12 — clicking [Download] should POST to /api/codegen,
  // show a spinner on the clicked row while in-flight, then clear it
  // once the fetch resolves. The download itself is exercised by
  // workspace-download.test.ts; here we just verify the panel-level
  // wiring: fetch is invoked with the workspace files, and the table's
  // spinner reflects the in-flight state.
  it('clicking [Download] posts to /api/codegen with the workspace files', async () => {
    let resolveFetch: (res: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    // Only stub URL.createObjectURL / revokeObjectURL — these aren't
    // present in jsdom and would throw on the real download path. The
    // actual anchor click is a no-op in jsdom, so leaving createElement
    // / appendChild / removeChild alone keeps testing-library's own
    // DOM mounts working.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    const w = makeWorker();
    const files = [
      { name: 'x.rune', path: 'x.rune', content: 'namespace x\ntype T:\n  a string (1..1)\n', dirty: false }
    ];
    render(<CodePreviewPanel worker={w as unknown as Worker} sourceEditorRef={null} files={files as never} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('codegen-targets-table__download-zod'));
    });

    // Spinner appears on the zod row while the fetch is pending.
    expect(screen.getByTestId('codegen-targets-table__spinner-zod')).toBeTruthy();
    expect(screen.queryByTestId('codegen-targets-table__view-zod')).toBeNull();

    // Fetch was invoked with the right URL + body.
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/codegen');
    const body = JSON.parse((init as RequestInit).body as string) as {
      files: Array<{ path: string; content: string }>;
      target: string;
    };
    expect(body.target).toBe('zod');
    expect(body.files).toEqual([{ path: 'x.rune', content: files[0]!.content }]);

    // Resolve the fetch with a successful response so the spinner clears.
    await act(async () => {
      resolveFetch(
        new Response('out', {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="x.zod.ts"' }
        })
      );
    });

    // Spinner gone; row buttons are back.
    expect(screen.queryByTestId('codegen-targets-table__spinner-zod')).toBeNull();
    expect(screen.getByTestId('codegen-targets-table__view-zod')).toBeTruthy();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
