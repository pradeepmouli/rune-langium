/**
 * @rune-langium/studio — Standalone App API Contract
 *
 * This file defines the TypeScript types for the standalone web application's
 * internal service interfaces. These are NOT public npm exports — they define
 * the internal architecture of the studio app.
 *
 * NOTE: This is a design contract, not runnable code.
 */

// ---------------------------------------------------------------------------
// Workspace Service
// ---------------------------------------------------------------------------

export interface WorkspaceFile {
  /** File URI (e.g., "file:///model.rosetta") */
  uri: string;
  /** Original file content */
  originalContent: string;
  /** Current content (after edits) */
  currentContent: string;
  /** Whether file has unsaved changes */
  isDirty: boolean;
  /** File name (e.g., "model.rosetta") */
  fileName: string;
}

export interface WorkspaceService {
  /** Load a single .rosetta file */
  loadFile(file: File): Promise<WorkspaceFile>;
  /** Load a directory of .rosetta files */
  loadDirectory(files: FileList): Promise<WorkspaceFile[]>;
  /** Get all loaded files */
  getFiles(): WorkspaceFile[];
  /** Get a file by URI */
  getFile(uri: string): WorkspaceFile | undefined;
  /** Update file content after editing */
  updateFile(uri: string, content: string): void;
  /** Check if any files have unsaved changes */
  hasDirtyFiles(): boolean;
  /** Clear all loaded files */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Export Service
// ---------------------------------------------------------------------------

export type ExportFormat = 'svg' | 'png' | 'rosetta';

export interface ExportOptions {
  /** For image export: scale factor (default 2x for retina) */
  scale?: number;
  /** For image export: background color (default white) */
  backgroundColor?: string;
  /** For .rosetta export: include only modified files */
  onlyDirty?: boolean;
}

export interface ExportService {
  /** Export graph as image */
  exportImage(format: 'svg' | 'png', options?: ExportOptions): Promise<Blob>;
  /** Export .rosetta source files */
  exportRosetta(options?: ExportOptions): Promise<Map<string, string>>;
  /** Download a blob as a file */
  download(blob: Blob, fileName: string): void;
  /** Download multiple files as a zip */
  downloadZip(files: Map<string, string>, zipName: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------------

export interface StudioState {
  /** Workspace state */
  workspace: {
    files: WorkspaceFile[];
    isLoading: boolean;
    error?: string;
  };
  /** UI state */
  ui: {
    sourceViewOpen: boolean;
    sourceViewFile?: string;
    sidebarOpen: boolean;
    theme: 'light' | 'dark';
  };
}

// ---------------------------------------------------------------------------
// App Layout
// ---------------------------------------------------------------------------

/**
 * Studio app layout:
 *
 * ┌──────────────────────────────────────────────┐
 * │ Toolbar (file load, export, undo/redo, view) │
 * ├──────────────────┬───────────────────────────┤
 * │                  │                           │
 * │   Type Graph     │   Source View (optional)  │
 * │   (visual-editor │   (.rosetta text)         │
 * │    component)    │                           │
 * │                  │                           │
 * ├──────────────────┴───────────────────────────┤
 * │ Status Bar (file count, errors, selection)   │
 * └──────────────────────────────────────────────┘
 */
