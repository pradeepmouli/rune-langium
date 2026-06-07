// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * SourceEditor component tests (T018, T019, T022, T023).
 *
 * Covers: rendering, tab switching, content display,
 * diagnostics integration, hover, and completion.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { SourceEditor, handleTypeRefDragOver, handleTypeRefDrop } from '../../src/components/SourceEditor.js';
import type { SourceEditorProps, DropTargetView } from '../../src/components/SourceEditor.js';
import { TYPE_REF_PAYLOAD_MIME } from '@rune-langium/visual-editor';

// Mock CodeMirror since it needs a real DOM
const mockEditorViewDestroy = vi.fn();
const mockEditorViewFocus = vi.fn();
const mockContentDomFocus = vi.fn();
const mockEditorViewDispatch = vi.fn();
let lastEditorView: {
  dispatch: typeof mockEditorViewDispatch;
  focus: typeof mockEditorViewFocus;
  contentDOM: { focus: typeof mockContentDomFocus };
} | null = null;

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = {
      focus: mockContentDomFocus
    };
    state = {
      doc: {
        toString: () => '',
        lines: 20,
        line: (number: number) => ({ from: (number - 1) * 10, length: 10 }),
        lineAt: () => ({ number: 1, text: '' })
      }
    };
    dispatch = mockEditorViewDispatch;
    focus = mockEditorViewFocus;
    destroy = mockEditorViewDestroy;
    static updateListener = { of: vi.fn().mockReturnValue([]) };
    static domEventHandlers = vi.fn().mockReturnValue([]);
    static theme = vi.fn().mockReturnValue([]);
    static scrollIntoView = vi.fn((anchor: number) => ({ anchor }));
    static lineWrapping = [];
    constructor() {
      lastEditorView = {
        dispatch: this.dispatch,
        focus: this.focus,
        contentDOM: this.contentDOM
      };
    }
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn().mockReturnValue([]) }
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn().mockReturnValue({
      doc: { toString: () => '' }
    }),
    readOnly: { of: vi.fn().mockReturnValue([]) }
  }
}));

vi.mock('codemirror', () => ({
  basicSetup: []
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: []
}));

vi.mock('@codemirror/language', () => ({
  HighlightStyle: { define: vi.fn().mockReturnValue([]) },
  syntaxHighlighting: vi.fn().mockReturnValue([]),
  defaultHighlightStyle: []
}));

vi.mock('@lezer/highlight', () => ({
  tags: new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) =>
          'tag'
    }
  )
}));

vi.mock('../../src/lang/rune-dsl.js', () => ({
  runeDslLanguage: vi.fn().mockReturnValue([])
}));

vi.mock('../../src/lang/editor-theme.js', () => ({
  studioEditorExtensions: [],
  studioEditorTheme: [],
  studioEditorHighlightStyle: []
}));

const sampleFiles: SourceEditorProps['files'] = [
  {
    name: 'model.rosetta',
    path: '/workspace/model.rosetta',
    content: 'namespace foo',
    dirty: false
  },
  { name: 'types.rosetta', path: '/workspace/types.rosetta', content: 'type Bar:', dirty: true }
];

describe('SourceEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastEditorView = null;
  });

  describe('rendering', () => {
    it('renders empty state when no files', () => {
      render(<SourceEditor files={[]} />);
      expect(screen.getByText(/no files loaded/i)).toBeInTheDocument();
    });

    it('shows dirty indicator on modified files', () => {
      render(<SourceEditor files={sampleFiles} />);
      const typesTab = screen.getByText('types.rosetta').closest('button')!;
      expect(within(typesTab).getByText('●')).toBeInTheDocument();
    });

    it('highlights active tab', () => {
      render(<SourceEditor files={sampleFiles} activeFile="/workspace/types.rosetta" />);
      const typesTab = screen.getByText('types.rosetta').closest('button')!;
      expect(typesTab.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('tabs', () => {
    it('calls onFileSelect when tab is clicked', () => {
      const onFileSelect = vi.fn();
      render(<SourceEditor files={sampleFiles} onFileSelect={onFileSelect} />);
      fireEvent.click(screen.getByText('types.rosetta'));
      expect(onFileSelect).toHaveBeenCalledWith('/workspace/types.rosetta');
    });

    it('switches active tab on click', () => {
      render(<SourceEditor files={sampleFiles} />);
      fireEvent.click(screen.getByText('types.rosetta'));
      const typesTab = screen.getByText('types.rosetta').closest('button')!;
      expect(typesTab.getAttribute('aria-selected')).toBe('true');
    });

    it('supports arrow-key tab switching for compact keyboard navigation', () => {
      render(<SourceEditor files={sampleFiles} activeFile="/workspace/model.rosetta" />);
      const modelTab = screen.getByText('model.rosetta').closest('button')!;
      fireEvent.keyDown(modelTab, { key: 'ArrowRight' });
      const typesTab = screen.getByText('types.rosetta').closest('button')!;
      expect(typesTab.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(typesTab);
      fireEvent.keyDown(typesTab, { key: 'ArrowLeft' });
      expect(modelTab.getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(modelTab);
    });
  });

  describe('editor container', () => {
    it('reveals a source position in the active editor view', () => {
      const ref = React.createRef<import('../../src/components/SourceEditor.js').SourceEditorRef>();
      render(<SourceEditor ref={ref} files={sampleFiles} />);

      ref.current?.revealPosition({ line: 2, character: 3 });

      expect(lastEditorView?.dispatch).toHaveBeenCalledWith({
        selection: { anchor: 12 },
        effects: { anchor: 12 }
      });
      expect(lastEditorView?.contentDOM.focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('switches files before revealing a source position in another tab', async () => {
      const ref = React.createRef<import('../../src/components/SourceEditor.js').SourceEditorRef>();
      const onFileSelect = vi.fn();
      render(
        <SourceEditor ref={ref} files={sampleFiles} activeFile="/workspace/model.rosetta" onFileSelect={onFileSelect} />
      );

      await act(async () => {
        ref.current?.revealPosition({ line: 2, character: 3 }, '/workspace/types.rosetta');
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      expect(onFileSelect).toHaveBeenCalledWith('/workspace/types.rosetta');
      const typesTab = screen.getByText('types.rosetta').closest('button')!;
      expect(typesTab.getAttribute('aria-selected')).toBe('true');
      expect(lastEditorView?.dispatch).toHaveBeenCalledWith({
        selection: { anchor: 12 },
        effects: { anchor: 12 }
      });
      expect(lastEditorView?.contentDOM.focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('matches a basename when revealPosition is given a different file path format', async () => {
      const ref = React.createRef<import('../../src/components/SourceEditor.js').SourceEditorRef>();
      const onFileSelect = vi.fn();
      render(
        <SourceEditor ref={ref} files={sampleFiles} activeFile="/workspace/model.rosetta" onFileSelect={onFileSelect} />
      );

      await act(async () => {
        ref.current?.revealPosition({ line: 2, character: 3 }, 'types.rosetta');
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      expect(onFileSelect).toHaveBeenCalledWith('/workspace/types.rosetta');
      const typesTab = screen.getByText('types.rosetta').closest('button')!;
      expect(typesTab.getAttribute('aria-selected')).toBe('true');
      expect(lastEditorView?.dispatch).toHaveBeenCalledWith({
        selection: { anchor: 12 },
        effects: { anchor: 12 }
      });
      expect(lastEditorView?.contentDOM.focus).toHaveBeenCalledWith({ preventScroll: true });
    });
  });

  describe('read-only files', () => {
    const readOnlyFile = {
      name: 'system.rosetta',
      path: 'system://com.rosetta.model/system.rosetta',
      content: 'namespace com.rosetta.model',
      dirty: false,
      readOnly: true
    };
    const editableFile = {
      name: 'model.rosetta',
      path: '/workspace/model.rosetta',
      content: 'namespace foo',
      dirty: false
    };

    it('shows lock icon for read-only tab', () => {
      render(<SourceEditor files={[readOnlyFile, editableFile]} />);
      const systemTab = screen.getByText('system.rosetta').closest('button')!;
      expect(within(systemTab).getByLabelText('read-only')).toBeInTheDocument();
    });

    it('does not show lock icon for regular tab', () => {
      render(<SourceEditor files={[readOnlyFile, editableFile]} />);
      const modelTab = screen.getByText('model.rosetta').closest('button')!;
      expect(within(modelTab).queryByLabelText('read-only')).not.toBeInTheDocument();
    });

    it('hides close button for read-only tab when onFileClose is provided', () => {
      const onFileClose = vi.fn();
      render(<SourceEditor files={[readOnlyFile, editableFile]} onFileClose={onFileClose} />);
      // Read-only tab: no close button
      expect(screen.queryByLabelText('Close system.rosetta')).not.toBeInTheDocument();
      // Editable tab: close button present
      expect(screen.getByLabelText('Close model.rosetta')).toBeInTheDocument();
    });

    it('applies read-only EditorState extension when read-only file is active', async () => {
      const { EditorState } = vi.mocked(await import('@codemirror/state'));
      const onContentChange = vi.fn();
      render(<SourceEditor files={[readOnlyFile]} activeFile={readOnlyFile.path} onContentChange={onContentChange} />);
      // EditorState.readOnly.of should have been called with true
      expect(EditorState.readOnly.of).toHaveBeenCalledWith(true);
    });

    it('does NOT register drop handlers for read-only files', async () => {
      const { EditorView } = vi.mocked(await import('@codemirror/view'));
      render(<SourceEditor files={[readOnlyFile]} activeFile={readOnlyFile.path} />);
      // domEventHandlers must not have been called with drag/drop handlers when the
      // active file is read-only — otherwise programmatic view.dispatch() inside the
      // drop handler would silently mutate a system buffer that onContentChange never sees.
      expect(EditorView.domEventHandlers).not.toHaveBeenCalled();
    });

    it('registers drop handlers for writable files', async () => {
      const { EditorView } = vi.mocked(await import('@codemirror/view'));
      render(<SourceEditor files={[editableFile]} activeFile={editableFile.path} />);
      // For a writable file the drop extension must be installed.
      expect(EditorView.domEventHandlers).toHaveBeenCalledOnce();
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 9: pure drop-handler unit tests (no EditorView construction needed)
// ────────────────────────────────────────────────────────────────────────────

/** Build a minimal DragEvent-like object for testing. */
function makeDragEvent(overrides: {
  types?: string[];
  getData?: (mime: string) => string;
  clientX?: number;
  clientY?: number;
}): DragEvent {
  const types = overrides.types ?? [TYPE_REF_PAYLOAD_MIME];
  const getData = overrides.getData ?? (() => '');
  const event = {
    dataTransfer: {
      types,
      get dropEffect() {
        return 'none';
      },
      set dropEffect(_v: string) {
        /* no-op in some stubs */
      },
      getData
    },
    clientX: overrides.clientX ?? 100,
    clientY: overrides.clientY ?? 200,
    preventDefault: vi.fn()
  } as unknown as DragEvent;
  return event;
}

const VALID_PAYLOAD = {
  rune: 'type-ref',
  namespaceUri: 'cdm.trade',
  typeId: 'cdm.trade.Trade',
  typeName: 'Trade',
  kind: 'Data'
};

function makeView(posAtCoordsResult: number | null = 42): {
  view: DropTargetView;
  dispatch: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
} {
  const dispatch = vi.fn();
  const focus = vi.fn();
  const view: DropTargetView = {
    posAtCoords: vi.fn().mockReturnValue(posAtCoordsResult),
    state: { selection: { main: { head: 7 } } },
    dispatch,
    focus
  };
  return { view, dispatch, focus };
}

describe('handleTypeRefDragOver', () => {
  it('accepts dragover when our MIME is present', () => {
    const event = makeDragEvent({ types: [TYPE_REF_PAYLOAD_MIME] });
    const result = handleTypeRefDragOver(event);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('accepts MIME comparison case-insensitively (browsers uppercase)', () => {
    const event = makeDragEvent({ types: [TYPE_REF_PAYLOAD_MIME.toUpperCase()] });
    const result = handleTypeRefDragOver(event);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('rejects dragover when MIME is absent', () => {
    const event = makeDragEvent({ types: ['text/plain'] });
    const result = handleTypeRefDragOver(event);
    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('rejects dragover when dataTransfer is null', () => {
    const event = { dataTransfer: null, preventDefault: vi.fn() } as unknown as DragEvent;
    const result = handleTypeRefDragOver(event);
    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('handleTypeRefDrop', () => {
  it('inserts qualified name at drop position and returns true', () => {
    const { view, dispatch, focus } = makeView(42);
    const event = makeDragEvent({
      getData: (mime) => (mime === TYPE_REF_PAYLOAD_MIME ? JSON.stringify(VALID_PAYLOAD) : '')
    });
    const result = handleTypeRefDrop(event, view);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 42, to: 42, insert: 'cdm.trade.Trade' },
      selection: { anchor: 42 + 'cdm.trade.Trade'.length }
    });
    // Focus must be restored after dispatch so the user can type immediately.
    expect(focus).toHaveBeenCalledOnce();
  });

  it('falls back to selection.main.head when posAtCoords returns null', () => {
    const { view, dispatch } = makeView(null);
    const event = makeDragEvent({
      getData: (mime) => (mime === TYPE_REF_PAYLOAD_MIME ? JSON.stringify(VALID_PAYLOAD) : '')
    });
    handleTypeRefDrop(event, view);
    // head is 7
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ changes: expect.objectContaining({ from: 7, to: 7 }) })
    );
  });

  it('rejects when MIME data is empty (wrong drag source)', () => {
    const { view, dispatch } = makeView(42);
    const event = makeDragEvent({ getData: () => '' });
    const result = handleTypeRefDrop(event, view);
    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects when payload JSON is malformed', () => {
    const { view, dispatch } = makeView(42);
    const event = makeDragEvent({ getData: () => 'not-json{' });
    const result = handleTypeRefDrop(event, view);
    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects when payload fails isTypeRefPayload guard (missing field)', () => {
    const { view, dispatch } = makeView(42);
    const invalid = { rune: 'type-ref', namespaceUri: 'cdm.trade' }; // missing typeId, typeName, kind
    const event = makeDragEvent({
      getData: (mime) => (mime === TYPE_REF_PAYLOAD_MIME ? JSON.stringify(invalid) : '')
    });
    const result = handleTypeRefDrop(event, view);
    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects when dataTransfer is null', () => {
    const { view, dispatch } = makeView(42);
    const event = { dataTransfer: null, clientX: 0, clientY: 0, preventDefault: vi.fn() } as unknown as DragEvent;
    const result = handleTypeRefDrop(event, view);
    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
