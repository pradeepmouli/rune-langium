// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
/**
 * PerspectiveHost — renders the active perspective in the shell content slot.
 * Explore (the DockShell workbench, passed in as `explore`) is ALWAYS mounted
 * and hidden via `display:none` when inactive — keep-alive preserves the
 * dockview layout, open files, unsaved edits, and the LSP worker. The other
 * four screens mount on demand.
 */
import type React from 'react';
import { usePerspectiveStore } from '../../store/perspective-store.js';
import { SettingsPerspective } from './screens/SettingsPerspective.js';
import { WorkspacesPerspective } from './screens/WorkspacesPerspective.js';
import { GitSyncPerspective } from './screens/GitSyncPerspective.js';
import { ExportPerspective } from './screens/ExportPerspective.js';
import type { WorkspaceKind } from '../../workspace/persistence.js';
import type { WorkspaceFile } from '../../services/workspace.js';

interface Props {
  explore: React.ReactNode;
  hasWorkspace: boolean;
  /** Forwarded to GitSyncPerspective — wired by Task 8. */
  workspaceId?: string;
  /** Forwarded to GitSyncPerspective — wired by Task 8. */
  workspaceKind?: WorkspaceKind;
  /** Shared codegen Worker from EditorPage — forwarded to ExportPerspective (Task 8). */
  codegenWorker?: Worker | null;
  /** Workspace files forwarded to ExportPerspective (Task 8). */
  files?: ReadonlyArray<WorkspaceFile>;
}

export function PerspectiveHost({
  explore,
  hasWorkspace,
  workspaceId,
  workspaceKind,
  codegenWorker,
  files
}: Props): React.ReactElement {
  const active = usePerspectiveStore((s) => s.activePerspective);
  return (
    <div className="flex-1 min-h-0">
      {/* Explore: kept alive — hidden via display:none, NEVER unmounted. */}
      <div
        data-perspective-slot="explore"
        className="h-full"
        style={{ display: active === 'explore' ? undefined : 'none' }}
      >
        {explore}
      </div>
      {active === 'workspaces' && <WorkspacesPerspective />}
      {active === 'git' && hasWorkspace && (
        <GitSyncPerspective workspaceId={workspaceId} workspaceKind={workspaceKind} />
      )}
      {active === 'export' && hasWorkspace && <ExportPerspective worker={codegenWorker} files={files} />}
      {active === 'settings' && <SettingsPerspective />}
    </div>
  );
}
