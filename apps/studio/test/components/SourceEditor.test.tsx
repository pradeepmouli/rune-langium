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
import { SourceEditor } from '../../src/components/SourceEditor.js';
import type { SourceEditorProps } from '../../src/components/SourceEditor.js';

// Mock CodeMirror since it needs a real DOM
const mockEditorViewDestroy = vi.fn();
const mockEditorViewFocus = vi.fn();
const mockEditorViewDispatch = vi.fn();
let lastEditorView: {
  dispatch: typeof mockEditorViewDispatch;
  focus: typeof mockEditorViewFocus;
} | null = null;

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
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
    static theme = vi.fn().mockReturnValue([]);
    static scrollIntoView = vi.fn((anchor: number) => ({ anchor }));
    static lineWrapping = [];
    constructor() {
      lastEditorView = this;
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

vi.mock('../../src/lang/refactory-dark-theme.js', () => ({
  refactoryDark: [],
  refactoryDarkTheme: [],
  refactoryDarkHighlightStyle: []
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
    it('renders with test id', () => {
      render(<SourceEditor files={sampleFiles} />);
      expect(screen.getByTestId('source-editor')).toBeInTheDocument();
    });

    it('renders empty state when no files', () => {
      render(<SourceEditor files={[]} />);
      expect(screen.getByText(/no files loaded/i)).toBeInTheDocument();
    });

    it('renders tab buttons for each file', () => {
      render(<SourceEditor files={sampleFiles} />);
      expect(screen.getByText('model.rosetta')).toBeInTheDocument();
      expect(screen.getByText('types.rosetta')).toBeInTheDocument();
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
    it('renders an editor container element', () => {
      render(<SourceEditor files={sampleFiles} />);
      expect(screen.getByTestId('source-editor-container')).toBeInTheDocument();
    });

    it('reveals a source position in the active editor view', () => {
      const ref = React.createRef<import('../../src/components/SourceEditor.js').SourceEditorRef>();
      render(<SourceEditor ref={ref} files={sampleFiles} />);

      ref.current?.revealPosition({ line: 2, character: 3 });

      expect(lastEditorView?.dispatch).toHaveBeenCalledWith({
        selection: { anchor: 12 },
        effects: { anchor: 12 }
      });
      expect(lastEditorView?.focus).toHaveBeenCalled();
    });

    it('switches files before revealing a source position in another tab', async () => {
      const ref = React.createRef<import('../../src/components/SourceEditor.js').SourceEditorRef>();
      const onFileSelect = vi.fn();
      render(
        <SourceEditor
          ref={ref}
          files={sampleFiles}
          activeFile="/workspace/model.rosetta"
          onFileSelect={onFileSelect}
        />
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
      expect(lastEditorView?.focus).toHaveBeenCalled();
    });

    it('matches a basename when revealPosition is given a different file path format', async () => {
      const ref = React.createRef<import('../../src/components/SourceEditor.js').SourceEditorRef>();
      const onFileSelect = vi.fn();
      render(
        <SourceEditor
          ref={ref}
          files={sampleFiles}
          activeFile="/workspace/model.rosetta"
          onFileSelect={onFileSelect}
        />
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
      expect(lastEditorView?.focus).toHaveBeenCalled();
    });
  });

  describe('diagnostics', () => {
    it('renders without LSP client prop', () => {
      render(<SourceEditor files={sampleFiles} />);
      expect(screen.getByTestId('source-editor')).toBeInTheDocument();
    });
  });

  describe('hover', () => {
    it('renders editor that could display hover tooltips via LSP', () => {
      render(<SourceEditor files={sampleFiles} />);
      // Hover is handled by @codemirror/lsp-client's hoverTooltips extension
      // which is wired when LSP client is provided. Here we verify the container exists.
      expect(screen.getByTestId('source-editor-container')).toBeInTheDocument();
    });
  });

  describe('completion', () => {
    it('renders editor that could display completions via LSP', () => {
      render(<SourceEditor files={sampleFiles} />);
      // Completion is handled by @codemirror/lsp-client's serverCompletion extension
      expect(screen.getByTestId('source-editor-container')).toBeInTheDocument();
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
      render(
        <SourceEditor
          files={[readOnlyFile]}
          activeFile={readOnlyFile.path}
          onContentChange={onContentChange}
        />
      );
      // EditorState.readOnly.of should have been called with true
      expect(EditorState.readOnly.of).toHaveBeenCalledWith(true);
    });
  });
});
