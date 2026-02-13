/**
 * SourceEditor — CodeMirror 6 editor for .rosetta files (T020).
 *
 * Replaces the read-only SourceView with a full-featured editor
 * backed by @codemirror/lsp-client for diagnostics, hover,
 * completion, and go-to-definition.
 *
 * Multi-tab support (T026): Tab bar, active tab switching,
 * and cross-file navigation.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { defaultKeymap } from '@codemirror/commands';
import { runeDslLanguage } from '../lang/rune-dsl.js';
import type { LspClientService } from '../services/lsp-client.js';
import { pathToUri } from '../utils/uri.js';

// Re-export pathToUri for backward compatibility
export { pathToUri } from '../utils/uri.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface SourceEditorFile {
  name: string;
  path: string;
  content: string;
  dirty: boolean;
}

export interface SourceEditorProps {
  /** Workspace files to show as tabs. */
  files: SourceEditorFile[];
  /** Currently active file path. */
  activeFile?: string;
  /** Called when user switches tabs. */
  onFileSelect?: (path: string) => void;
  /** Called when editor content changes. */
  onContentChange?: (path: string, content: string) => void;
  /** LSP client service (injected). */
  lspClient?: LspClientService;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function SourceEditor({
  files,
  activeFile,
  onFileSelect,
  onContentChange,
  lspClient
}: SourceEditorProps) {
  const [selectedPath, setSelectedPath] = useState<string>(activeFile ?? files[0]?.path ?? '');
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  // Track content per file for document model
  const contentMapRef = useRef<Map<string, string>>(new Map());

  // Initialise content map
  useEffect(() => {
    for (const file of files) {
      if (!contentMapRef.current.has(file.path)) {
        contentMapRef.current.set(file.path, file.content);
      }
    }
  }, [files]);

  const currentFile = useMemo(
    () => files.find((f) => f.path === selectedPath),
    [files, selectedPath]
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      // Save current content before switching
      if (editorViewRef.current && selectedPath) {
        const content = editorViewRef.current.state.doc.toString();
        contentMapRef.current.set(selectedPath, content);
      }
      setSelectedPath(path);
      onFileSelect?.(path);
    },
    [selectedPath, onFileSelect]
  );

  // Build extensions
  const buildExtensions = useCallback(
    (filePath: string): Extension[] => {
      const exts: Extension[] = [
        basicSetup,
        keymap.of(defaultKeymap),
        runeDslLanguage(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            contentMapRef.current.set(filePath, content);
            onContentChange?.(filePath, content);
          }
        })
      ];

      // Wire LSP plugin if client is available
      if (lspClient?.isInitialized()) {
        const lspPlugin = lspClient.getPlugin(pathToUri(filePath));
        if (lspPlugin) exts.push(lspPlugin);
      }

      return exts;
    },
    [lspClient, onContentChange]
  );

  // Create / update editor view when file changes
  useEffect(() => {
    if (!editorContainerRef.current || !currentFile) return;

    // Destroy previous editor
    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    const content = contentMapRef.current.get(currentFile.path) ?? currentFile.content;

    const state = EditorState.create({
      doc: content,
      extensions: buildExtensions(currentFile.path)
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [currentFile, buildExtensions]);

  // Empty state
  if (files.length === 0) {
    return (
      <div className="studio-source-editor studio-source-editor--empty" data-testid="source-editor">
        <p>No files loaded</p>
      </div>
    );
  }

  return (
    <div className="studio-source-editor" data-testid="source-editor">
      {/* Tab bar */}
      <div className="studio-source-editor__tabs">
        {files.map((file) => (
          <button
            key={file.path}
            className={`studio-source-editor__tab ${
              file.path === selectedPath ? 'studio-source-editor__tab--active' : ''
            }`}
            onClick={() => handleFileSelect(file.path)}
            title={file.path}
          >
            {file.name}
            {file.dirty && <span className="studio-source-editor__dirty"> ●</span>}
          </button>
        ))}
      </div>

      {/* Editor container */}
      <div
        className="studio-source-editor__content"
        data-testid="source-editor-container"
        ref={editorContainerRef}
      />
    </div>
  );
}
