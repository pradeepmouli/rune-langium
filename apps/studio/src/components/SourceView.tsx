/**
 * SourceView — Side-by-side .rosetta source display (T085).
 *
 * Shows the raw text content of loaded .rosetta files with
 * syntax-highlighted read-only display and dirty-state indicators.
 */

import { useState, useMemo } from 'react';
import type { WorkspaceFile } from '../services/workspace.js';

export interface SourceViewProps {
  files: WorkspaceFile[];
  activeFile?: string;
  onFileSelect?: (path: string) => void;
}

export function SourceView({ files, activeFile, onFileSelect }: SourceViewProps) {
  const [selectedPath, setSelectedPath] = useState<string>(activeFile ?? files[0]?.path ?? '');

  const currentFile = useMemo(
    () => files.find((f) => f.path === selectedPath),
    [files, selectedPath]
  );

  const handleFileSelect = (path: string) => {
    setSelectedPath(path);
    onFileSelect?.(path);
  };

  if (files.length === 0) {
    return (
      <div className="studio-source-view studio-source-view--empty" data-testid="source-view">
        <p>No files loaded</p>
      </div>
    );
  }

  return (
    <div className="studio-source-view" data-testid="source-view">
      <div className="studio-source-view__tabs">
        {files.map((file) => (
          <button
            key={file.path}
            className={`studio-source-view__tab ${
              file.path === selectedPath ? 'studio-source-view__tab--active' : ''
            }`}
            onClick={() => handleFileSelect(file.path)}
            title={file.path}
          >
            {file.name}
            {file.dirty && <span className="studio-source-view__dirty"> ●</span>}
          </button>
        ))}
      </div>
      <div className="studio-source-view__content">
        {currentFile ? (
          <pre className="studio-source-view__code">
            <code>{currentFile.content}</code>
          </pre>
        ) : (
          <p className="studio-source-view__placeholder">Select a file to view</p>
        )}
      </div>
    </div>
  );
}
