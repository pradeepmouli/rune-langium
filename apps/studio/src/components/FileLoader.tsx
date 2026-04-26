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
import { GitHubConnectDialog } from './GitHubConnectDialog.js';

export interface FileLoaderProps {
  onFilesLoaded: (files: WorkspaceFile[]) => void;
  /**
   * Current workspace files — used to compute a unique name for the "New"
   * action (`untitled.rosetta`, `untitled-2.rosetta`, …). Defaults to empty.
   */
  existingFiles?: ReadonlyArray<WorkspaceFile>;
  /**
   * Override the github-auth base URL (T031 / FR-012). Defaults to the
   * production same-origin path; tests inject their own.
   */
  githubAuthBase?: string;
}

function defaultGithubAuthBase(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/rune-studio/api/github-auth`;
}

export function FileLoader({ onFilesLoaded, existingFiles = [], githubAuthBase }: FileLoaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [loadProgress, setLoadProgress] = useState<WorkspaceLoadProgress | null>(null);
  const [isGitHubOpen, setIsGitHubOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const authBase = githubAuthBase ?? defaultGithubAuthBase();

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
        // T057 — sized to the start-page column rather than to the
        // entire viewport; the parent container handles vertical
        // centring. Drag-target affordance still flashes on dragenter.
        'flex items-center justify-center w-full transition-colors rounded-lg',
        isDragging && 'bg-primary/15'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-testid="file-loader"
      aria-label="File loader"
    >
      {/* T057 (014/FR-028) — empty-state hierarchy:
       *   1. Heading (text-3xl font-semibold tracking-tight, body
       *      already maps to font-display via T053)
       *   2. ONE primary CTA ("New blank workspace")
       *   3. Equal-weight transparent secondaries (Select Files /
       *      Select Folder). "Open from GitHub" is wired in Phase 6.
       *   4. ModelLoader (curated reference models) renders below as
       *      a discoverable but visually subordinate row — no
       *      `border-t` divider, just `mt-8`. */}
      <div className="text-center max-w-[560px]">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground mb-3">
          Load Rune DSL Models
        </h2>
        <p className="text-md text-text-secondary mb-8">
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
          <div className="flex flex-col items-stretch gap-4">
            <Button size="lg" onClick={handleNew}>
              New blank workspace
            </Button>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="secondary" size="lg" onClick={() => fileInputRef.current?.click()}>
                Select Files
              </Button>
              <Button variant="secondary" size="lg" onClick={() => dirInputRef.current?.click()}>
                Select Folder
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setIsGitHubOpen(true)}>
                Open from GitHub repository…
              </Button>
            </div>
          </div>
        )}

        {isGitHubOpen && (
          // Phase 6 T031 — visible affordance lands; auth tokens flow into
          // workspace creation via T032 once cloneRepository / createGitBacked
          // scaffolding lands. For now the dialog completes auth and closes;
          // a follow-up task surfaces the cloned tree.
          <div
            role="presentation"
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsGitHubOpen(false);
            }}
          >
            <div className="bg-popover border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
              <GitHubConnectDialog
                authBase={authBase}
                onConnected={() => {
                  // Phase 6 follow-up will pipe the token into
                  // WorkspaceManager.createGitBacked. For now: close + flag.
                  setIsGitHubOpen(false);
                }}
                onCancel={() => setIsGitHubOpen(false)}
              />
            </div>
          </div>
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
