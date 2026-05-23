// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { FileLoader } from '../../../components/FileLoader.js';
import { WorkspaceSwitcher } from '../../../components/WorkspaceSwitcher.js';
import { ModelLoader } from '../../../components/ModelLoader.js';
import { useWorkspaceActions } from '../workspace-actions-context.js';

/**
 * WorkspacesPerspective — the launcher screen that subsumes the start page.
 *
 * Composes FileLoader + WorkspaceSwitcher + ModelLoader with the same layout
 * as the App start-page block (T057 / FR-028). Handlers are pulled from
 * WorkspaceActionsContext (provided by App) so PerspectiveHost passes NO props.
 */
export function WorkspacesPerspective(): React.ReactElement {
  const {
    files,
    onFilesLoaded,
    createGitBackedWorkspace,
    onGitHubWorkspaceCreated,
    onOpenWorkspace,
    onCreateWorkspace,
    onDeleteWorkspace
  } = useWorkspaceActions();

  return (
    <section data-testid="workspaces-perspective" className="h-full overflow-auto">
      <div className="flex flex-col items-center justify-center min-h-full px-8 py-12 gap-8">
        <FileLoader
          onFilesLoaded={onFilesLoaded}
          existingFiles={files}
          createGitBackedWorkspace={createGitBackedWorkspace}
          onGitHubWorkspaceCreated={onGitHubWorkspaceCreated}
        />
        <div className="w-full max-w-[560px] mt-8">
          <WorkspaceSwitcher onOpen={onOpenWorkspace} onCreate={onCreateWorkspace} onDelete={onDeleteWorkspace} />
        </div>
        <div className="w-full max-w-[560px]">
          <ModelLoader />
        </div>
      </div>
    </section>
  );
}
