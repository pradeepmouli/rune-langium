// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Explore's chrome — the center (FileTabStrip) and actions (Validate /
 * Export Code / Share / Generate) slots declared by the `explore` registry
 * entry, rendered by `AppHeader` (shared-perspective-chrome plan, Task 3).
 * Content MOVED VERBATIM from `ExplorePerspective`'s private header; each is
 * a zero-arg component reading its own hooks/stores rather than props
 * threaded from `ExplorePerspective` — the FileTabStrip's real dependencies
 * (activeEditorFile, openFileInSource, combinedFileDiagnostics) now come from
 * `useWorkspace()`, `useDiagnosticsStore()`, and `explore-file-nav-store.ts`.
 */

import { useMemo } from 'react';
import { Check, Download, Share2, Zap, Plus } from 'lucide-react';
import { Button } from '@rune-langium/design-system/ui/button';
import type { WorkspaceFile } from '../../services/workspace.js';
import { createBlankWorkspaceFile } from '../../services/workspace.js';
import { useWorkspace } from '../providers/workspace-context.js';
import { useWorkspaceActions } from './workspace-actions-context.js';
import { useDiagnosticsStore } from '../../store/diagnostics-store.js';
import { combineFileDiagnostics } from '../explore-diagnostics.js';
import { useExploreFileNavStore } from '../explore-file-nav-store.js';
import { useExportDialogStore } from '../export-dialog-store.js';
import type { LspDiagnostic } from '../../store/diagnostics-store.js';

/** Stable module-level reference — same rationale as ExplorePerspective's
 *  EMPTY_PARSE_ERRORS: avoids a fresh Map() on every render that would
 *  false-positive the useMemo dep check below when parseErrors is absent. */
const EMPTY_PARSE_ERRORS: ReadonlyMap<string, string[]> = new Map();

function getFileKindBadge(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  switch (ext) {
    case 'rosetta':
      return 'DSL';
    case 'json':
      return 'JSON';
    case 'yaml':
    case 'yml':
      return 'YAML';
    case 'ts':
      return 'TS';
    case 'js':
      return 'JS';
    case 'md':
      return 'MD';
    default:
      return ext ? ext.slice(0, 4).toUpperCase() : 'FILE';
  }
}

/** Count error (severity 1) and warning (severity 2) diagnostics for a file. */
function countFileDiagnostics(diagnostics: readonly LspDiagnostic[] | undefined): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  if (diagnostics) {
    for (const d of diagnostics) {
      if (d.severity === 1) errors += 1;
      else if (d.severity === 2) warnings += 1;
    }
  }
  return { errors, warnings };
}

function FileTabStrip({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  fileDiagnostics
}: {
  files: readonly WorkspaceFile[];
  activeFile: string | undefined;
  onSelectFile: (path: string) => void;
  onCreateFile: () => void;
  fileDiagnostics: ReadonlyMap<string, readonly LspDiagnostic[]>;
}) {
  const userFiles = files.filter((f) => !f.readOnly);

  return (
    <div className="studio-topbar__tabs">
      {userFiles.map((f) => {
        const { errors, warnings } = countFileDiagnostics(fileDiagnostics.get(f.path));
        return (
          <button
            key={f.path}
            type="button"
            className={`studio-topbar__tab ${f.path === activeFile ? 'is-active' : ''}`}
            onClick={() => onSelectFile(f.path)}
            title={f.path}
            // Explicit label so screen readers don't read the diagnostics
            // chiclets as bare numbers (e.g. "a.rosetta 2 1").
            aria-label={`${f.name}${f.dirty ? ', unsaved' : ''}${
              errors > 0 ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''
            }${warnings > 0 ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}`}
          >
            <span className={`studio-topbar__tab-dot ${f.dirty ? 'is-dirty' : ''}`} />
            <span className="studio-topbar__tab-name">{f.name}</span>
            {errors > 0 && (
              <span className="studio-topbar__tab-count is-error" title={`${errors} error${errors === 1 ? '' : 's'}`}>
                {errors}
              </span>
            )}
            {warnings > 0 && (
              <span
                className="studio-topbar__tab-count is-warning"
                title={`${warnings} warning${warnings === 1 ? '' : 's'}`}
              >
                {warnings}
              </span>
            )}
            <span className="studio-topbar__tab-badge" aria-hidden="true">
              {getFileKindBadge(f.name)}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="studio-topbar__tab-new"
        aria-label="New file"
        title="New file"
        onClick={onCreateFile}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function ExploreCenterSlot() {
  const { files, parseErrors } = useWorkspace();
  const { onFilesChange } = useWorkspaceActions();
  const { fileDiagnostics } = useDiagnosticsStore();
  const activeEditorFile = useExploreFileNavStore((s) => s.activeEditorFile);
  const openFileInSource = useExploreFileNavStore((s) => s.openFileInSource);

  const effectiveParseErrors = parseErrors ?? EMPTY_PARSE_ERRORS;
  const combinedFileDiagnostics = useMemo(
    () => combineFileDiagnostics(fileDiagnostics, files, effectiveParseErrors),
    [fileDiagnostics, files, effectiveParseErrors]
  );

  const handleCreateFile = () => {
    const file = createBlankWorkspaceFile(files);
    onFilesChange?.([...files, file]);
    openFileInSource(file.path);
  };

  return (
    <FileTabStrip
      files={files}
      activeFile={activeEditorFile}
      onSelectFile={openFileInSource}
      onCreateFile={handleCreateFile}
      fileDiagnostics={combinedFileDiagnostics}
    />
  );
}

export function ExploreActions() {
  const setShowExportDialog = useExportDialogStore((s) => s.setOpen);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Validate" title="Validate">
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Export code"
        title="Export code"
        onClick={() => setShowExportDialog(true)}
      >
        <Download />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Share" title="Share">
        <Share2 />
      </Button>
      <button type="button" className="studio-topbar__generate" onClick={() => setShowExportDialog(true)}>
        <Zap className="size-3.5" />
        Generate
      </button>
    </>
  );
}
