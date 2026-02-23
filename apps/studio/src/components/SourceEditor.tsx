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

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useImperativeHandle,
  forwardRef
} from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { defaultKeymap } from '@codemirror/commands';
import { runeDslLanguage } from '../lang/rune-dsl.js';
import type { LspClientService } from '../services/lsp-client.js';
import { pathToUri } from '../utils/uri.js';
import { cn } from '@rune-langium/design-system/utils';

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
  /** When true, the file is a system/built-in file and cannot be edited. */
  readOnly?: boolean;
}

export interface SourceEditorProps {
  /** Workspace files to show as tabs. */
  files: SourceEditorFile[];
  /** Currently active file path. */
  activeFile?: string;
  /** Called when user switches tabs. */
  onFileSelect?: (path: string) => void;
  /** Called when a tab close button is clicked. */
  onFileClose?: (path: string) => void;
  /** Called when editor content changes. */
  onContentChange?: (path: string, content: string) => void;
  /** LSP client service (injected). */
  lspClient?: LspClientService;
}

/** Imperative handle exposed by SourceEditor for programmatic navigation. */
export interface SourceEditorRef {
  /** Scroll to a line in the specified (or current) file and highlight it. */
  revealLine(line: number, filePath?: string): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a stable, unique ID for a tab from a file path.
 * Uses encodeURIComponent so that all non-alphanumerics are encoded with
 * '%' delimiters, avoiding collisions with literal alphanumeric sequences.
 */
function getTabId(path: string): string {
  const encoded = encodeURIComponent(path);
  return `tab-${encoded}`;
}

/** Scroll to a 1-based line number and highlight it briefly. */
function scrollToLine(view: EditorView | null, line: number): void {
  if (!view) return;
  const clampedLine = Math.max(1, Math.min(line, view.state.doc.lines));
  const lineInfo = view.state.doc.line(clampedLine);
  view.dispatch({
    selection: { anchor: lineInfo.from },
    effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' })
  });
  view.focus();
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export const SourceEditor = forwardRef<SourceEditorRef, SourceEditorProps>(function SourceEditor(
  { files, activeFile, onFileSelect, onFileClose, onContentChange, lspClient },
  ref
) {
  const [selectedPath, setSelectedPath] = useState<string>(activeFile ?? files[0]?.path ?? '');
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  // Sync selectedPath when activeFile prop changes externally
  useEffect(() => {
    if (activeFile && activeFile !== selectedPath) {
      const exists = files.some((f) => f.path === activeFile);
      if (exists) {
        setSelectedPath(activeFile);
      }
    }
  }, [activeFile, files]);

  // Expose imperative handle for programmatic navigation
  useImperativeHandle(
    ref,
    () => ({
      revealLine(line: number, filePath?: string) {
        // If a different file is specified, switch to it first
        if (filePath && filePath !== selectedPath) {
          const target = files.find((f) => f.path === filePath || f.name === filePath);
          if (target) {
            setSelectedPath(target.path);
            onFileSelect?.(target.path);
            // Schedule the scroll after the editor is recreated for the new file
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scrollToLine(editorViewRef.current, line);
              });
            });
            return;
          }
        }
        scrollToLine(editorViewRef.current, line);
      }
    }),
    [files, selectedPath, onFileSelect]
  );

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
    (filePath: string, isReadOnly: boolean): Extension[] => {
      const exts: Extension[] = [basicSetup, keymap.of(defaultKeymap), runeDslLanguage()];

      if (isReadOnly) {
        exts.push(EditorState.readOnly.of(true));
      } else {
        exts.push(
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const content = update.state.doc.toString();
              contentMapRef.current.set(filePath, content);
              onContentChangeRef.current?.(filePath, content);
            }
          })
        );
      }

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
      extensions: buildExtensions(currentFile.path, currentFile.readOnly ?? false)
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
        className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground"
        data-testid="source-editor"
      >
        <p>No files loaded</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col h-full bg-background" data-testid="source-editor">
      {/* Tab bar */}
      <nav
        className="flex overflow-x-auto bg-card border-b border-border gap-px min-h-[32px]"
        role="tablist"
        aria-label="Open files"
      >
        {files.map((file) => (
          <div
            key={file.path}
            className={cn(
              'group flex items-center gap-0.5 border-b-2 border-b-transparent transition-colors',
              file.path === selectedPath ? 'border-b-primary' : ''
            )}
          >
            <button
              id={getTabId(file.path)}
              role="tab"
              aria-selected={file.path === selectedPath}
              aria-controls="editor-tabpanel"
              tabIndex={file.path === selectedPath ? 0 : -1}
              className={cn(
                'pl-3 pr-1 py-1.5 text-sm bg-transparent border-none cursor-pointer whitespace-nowrap transition-colors',
                'hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                file.path === selectedPath ? 'text-primary' : 'text-muted-foreground'
              )}
              onClick={() => handleFileSelect(file.path)}
              title={file.path}
            >
              {file.name}
              {file.readOnly && (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-label="read-only"
                  className="inline-block ml-1 opacity-60"
                >
                  <path d="M11 7V5a3 3 0 0 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1zm-5 0V5a2 2 0 1 1 4 0v2H6zm2 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                </svg>
              )}
              {file.dirty && <span className="text-warning text-xs"> ●</span>}
            </button>
            {onFileClose && !file.readOnly && (
              <button
                type="button"
                aria-label={`Close ${file.name}`}
                className={cn(
                  'shrink-0 p-0.5 rounded-sm text-muted-foreground transition-colors',
                  'hover:text-foreground hover:bg-muted',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  file.path === selectedPath && 'opacity-60'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileClose(file.path);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
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
});
