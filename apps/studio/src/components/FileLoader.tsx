/**
 * FileLoader — Drag-and-drop + file picker for loading .rosetta files (T084, T099).
 */

import { useCallback, useRef, useState } from 'react';
import type { WorkspaceFile } from '../services/workspace.js';
import { readFileList } from '../services/workspace.js';

export interface FileLoaderProps {
  onFilesLoaded: (files: WorkspaceFile[]) => void;
}

export function FileLoader({ onFilesLoaded }: FileLoaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const files = await readFileList(fileList);
      if (files.length > 0) {
        onFilesLoaded(files);
      }
    },
    [onFilesLoaded]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        await handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        await handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  return (
    <div
      className={`studio-file-loader ${isDragging ? 'studio-file-loader--dragging' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-testid="file-loader"
    >
      <div className="studio-file-loader__content">
        <p className="studio-file-loader__title">Load Rune DSL Models</p>
        <p className="studio-file-loader__hint">
          Drag and drop .rosetta files here, or use the buttons below
        </p>
        <div className="studio-file-loader__actions">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="studio-file-loader__button"
          >
            Select Files
          </button>
          <button
            onClick={() => dirInputRef.current?.click()}
            className="studio-file-loader__button studio-file-loader__button--secondary"
          >
            Select Folder
          </button>
        </div>
        {/* Visually hidden — NOT display:none, Chrome blocks .click() on those */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".rosetta"
          multiple
          onChange={handleFileInput}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
        />
        <input
          ref={dirInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is not in the type defs
          webkitdirectory=""
          onChange={handleFileInput}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
        />
      </div>
    </div>
  );
}
