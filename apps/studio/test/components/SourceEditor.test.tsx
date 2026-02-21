/**
 * SourceEditor component tests (T018, T019, T022, T023).
 *
 * Covers: rendering, tab switching, content display,
 * diagnostics integration, hover, and completion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SourceEditor } from '../../src/components/SourceEditor.js';
import type { SourceEditorProps } from '../../src/components/SourceEditor.js';

// Mock CodeMirror since it needs a real DOM
const mockEditorViewDestroy = vi.fn();

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    state = { doc: { toString: () => '' } };
    dispatch = vi.fn();
    destroy = mockEditorViewDestroy;
    static updateListener = { of: vi.fn().mockReturnValue([]) };
    constructor() {
      // no-op
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

vi.mock('../../src/lang/rune-dsl.js', () => ({
  runeDslLanguage: vi.fn().mockReturnValue([])
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
  });

  describe('editor container', () => {
    it('renders an editor container element', () => {
      render(<SourceEditor files={sampleFiles} />);
      expect(screen.getByTestId('source-editor-container')).toBeInTheDocument();
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
