/**
 * FileLoader — Drag-and-drop + file picker for loading .rosetta files (T084, T099).
 */

import { useCallback, useRef, useState } from 'react';
import type { WorkspaceFile } from '../services/workspace.js';
import { readFileList } from '../services/workspace.js';
import { Button } from './ui/button.js';
import { cn } from '@/lib/utils.js';

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
      className={cn(
        "flex items-center justify-center h-full p-8 transition-colors",
        isDragging && "bg-[var(--color-accent-muted)]"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-testid="file-loader"
    >
      <div className="text-center max-w-[480px]">
        <p className="text-2xl font-semibold text-[var(--color-text-heading)] mb-2">
          Load Rune DSL Models
        </p>
        <p className="text-md text-[var(--color-text-secondary)] mb-6">
          Drag and drop .rosetta files here, or use the buttons below
        </p>
        <div className="flex gap-3 justify-center">
          <Button size="lg" onClick={() => fileInputRef.current?.click()}>
            Select Files
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => dirInputRef.current?.click()}
          >
            Select Folder
          </Button>
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
