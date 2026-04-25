// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * FileLoader — Drag-and-drop + file picker for loading .rosetta files (T084, T099).
 *
 * Shows a progress bar during chunked file reading for large folders.
 */

import { useCallback, useRef, useState } from 'react';
import type { WorkspaceFile, WorkspaceLoadProgress } from '../services/workspace.js';
import { createBlankWorkspaceFile, readFileList } from '../services/workspace.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { cn } from '@rune-langium/design-system/utils';

export interface FileLoaderProps {
  onFilesLoaded: (files: WorkspaceFile[]) => void;
  /**
   * Current workspace files — used to compute a unique name for the "New"
   * action (`untitled.rosetta`, `untitled-2.rosetta`, …). Defaults to empty.
   */
  existingFiles?: ReadonlyArray<WorkspaceFile>;
}

export function FileLoader({ onFilesLoaded, existingFiles = [] }: FileLoaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [loadProgress, setLoadProgress] = useState<WorkspaceLoadProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      setLoadProgress({ phase: 'reading', loaded: 0, total: 0 });
      const files = await readFileList(fileList, (progress) => {
        setLoadProgress(progress);
      });
      setLoadProgress({ phase: 'syncing', loaded: files.length, total: files.length });
      if (files.length > 0) {
        onFilesLoaded(files);
      }
      setLoadProgress(null);
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

  const handleNew = useCallback(() => {
    const file = createBlankWorkspaceFile(existingFiles);
    onFilesLoaded([file]);
  }, [existingFiles, onFilesLoaded]);

  return (
    <section
      className={cn(
        'flex items-center justify-center h-full p-8 transition-colors',
        isDragging && 'bg-primary/15'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-testid="file-loader"
      aria-label="File loader"
    >
      <div className="text-center max-w-[480px]">
        <p className="text-2xl font-semibold text-foreground mb-2">Load Rune DSL Models</p>
        <p className="text-md text-muted-foreground mb-6">
          Start a new file, or drag and drop existing .rosetta files here
        </p>

        {loadProgress ? (
          <div className="w-full" data-testid="load-progress">
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width: `${loadProgress.total > 0 ? (loadProgress.loaded / loadProgress.total) * 100 : 0}%`
                }}
                role="progressbar"
                aria-valuenow={loadProgress.loaded}
                aria-valuemin={0}
                aria-valuemax={loadProgress.total}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {loadProgress.phase === 'reading'
                ? `Loading ${loadProgress.loaded}/${loadProgress.total} files...`
                : 'Syncing with language server...'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button size="lg" onClick={handleNew}>
                New
              </Button>
              <Button variant="secondary" size="lg" onClick={() => fileInputRef.current?.click()}>
                Select Files
              </Button>
              <Button variant="secondary" size="lg" onClick={() => dirInputRef.current?.click()}>
                Select Folder
              </Button>
            </div>
          </>
        )}

        {/* Visually hidden — NOT display:none, Chrome blocks .click() on those.
            aria-label is required even on hidden inputs: axe-core flags an
            unlabeled file input as a critical violation regardless of CSS. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".rosetta"
          multiple
          aria-label="Choose .rosetta files"
          onChange={handleFileInput}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
        />
        <input
          ref={dirInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is not in the type defs
          webkitdirectory=""
          aria-label="Choose a folder of .rosetta files"
          onChange={handleFileInput}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
        />
      </div>
    </section>
  );
}
