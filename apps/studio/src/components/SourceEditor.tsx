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
import { cn } from '@/lib/utils.js';

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
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a stable, unique ID for a tab from a file path.
 * Uses hex encoding to handle special characters and ensure uniqueness.
 */
function getTabId(path: string): string {
  // Convert each character to hex for a stable, unique, HTML-safe ID
  const encoded = Array.from(path)
    .map((char) => {
      const code = char.charCodeAt(0);
      // Keep alphanumeric chars as-is, encode others as hex
      if (/[a-zA-Z0-9]/.test(char)) {
        return char;
      }
      return code.toString(16).padStart(2, '0');
    })
    .join('');
  return `tab-${encoded}`;
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

  // Stable callback refs — prevents editor recreation when parent re-renders
  const onContentChangeRef = useRef(onContentChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  // Initialise content map (new files only)
  useEffect(() => {
    for (const file of files) {
      if (!contentMapRef.current.has(file.path)) {
        contentMapRef.current.set(file.path, file.content);
      }
    }
  }, [files]);

  // Handle external content updates (e.g., from graph → source sync)
  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const file = files.find((f) => f.path === selectedPath);
    if (!file) return;
    const editorContent = view.state.doc.toString();
    const mapContent = contentMapRef.current.get(file.path);
    // Only update if file content differs from BOTH editor and map (external change)
    if (file.content !== editorContent && file.content !== mapContent) {
      contentMapRef.current.set(file.path, file.content);
      view.dispatch({
        changes: { from: 0, to: editorContent.length, insert: file.content }
      });
    }
  }, [files, selectedPath]);

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

  // Build extensions — uses refs for callbacks to keep extensions stable
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
            onContentChangeRef.current?.(filePath, content);
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
    [lspClient]
  );

  // Create / update editor view when file PATH changes (tab switch) or LSP connects.
  // Content changes are handled by CodeMirror's internal state + updateListener.
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
    // Only recreate editor when file path changes (tab switch) or LSP connects.
    // Content updates are handled by the updateListener extension, NOT by recreating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.path, buildExtensions]);

  // Empty state
  if (files.length === 0) {
    return (
      <section
        className="flex flex-col items-center justify-center h-full bg-surface-base text-text-muted"
        data-testid="source-editor"
      >
        <p>No files loaded</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col h-full bg-surface-base" data-testid="source-editor">
      {/* Tab bar */}
      <nav
        className="flex overflow-x-auto bg-surface-raised border-b border-border-default gap-px min-h-[32px]"
        role="tablist"
        aria-label="Open files"
      >
        {files.map((file) => (
          <button
            key={file.path}
            id={getTabId(file.path)}
            role="tab"
            aria-selected={file.path === selectedPath}
            aria-controls="editor-tabpanel"
            tabIndex={file.path === selectedPath ? 0 : -1}
            className={cn(
              'px-3.5 py-1.5 text-sm bg-transparent border-none border-b-2 border-b-transparent cursor-pointer whitespace-nowrap transition-colors',
              'hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
              file.path === selectedPath ? 'text-accent border-b-accent' : 'text-text-secondary'
            )}
            onClick={() => handleFileSelect(file.path)}
            title={file.path}
          >
            {file.name}
            {file.dirty && <span className="text-warning text-xs"> ●</span>}
          </button>
        ))}
      </nav>

      {/* Editor container */}
      <div
        id="editor-tabpanel"
        className="flex-1 overflow-hidden"
        role="tabpanel"
        aria-labelledby={selectedPath ? getTabId(selectedPath) : undefined}
        data-testid="source-editor-container"
        ref={editorContainerRef}
      />
    </section>
  );
}
