// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { WorkspaceFile } from '../../services/workspace.js';

/**
 * Actions + data the WorkspacesPerspective launcher needs, lifted from
 * App.tsx prop-drilling via context so PerspectiveHost doesn't need
 * knowledge of workspace state. App provides the value in Task 8.
 */
export interface WorkspaceActions {
  /** Current workspace files — forwarded to FileLoader as `existingFiles`. */
  files: WorkspaceFile[];
  /** Called when the user loads files via drag-drop / file picker / new. */
  onFilesLoaded: (files: WorkspaceFile[]) => void;
  /**
   * Creates a git-backed workspace (GitHub flow). Matches the shape that
   * FileLoader's `createGitBackedWorkspace` prop expects.
   */
  createGitBackedWorkspace: (input: {
    name: string;
    repoUrl: string;
    branch: string;
    user: string;
    token: string;
  }) => Promise<{ id: string }>;
  /** Notified when the GitHub workspace creation flow completes. */
  onGitHubWorkspaceCreated: (workspaceId: string) => void;
  /** Open an existing workspace by id (WorkspaceSwitcher onOpen). */
  onOpenWorkspace: (workspaceId: string) => void;
  /** Create a new blank workspace (WorkspaceSwitcher onCreate). */
  onCreateWorkspace: () => void;
  /** Delete a workspace by id (WorkspaceSwitcher onDelete). */
  onDeleteWorkspace: (workspaceId: string) => void;
}

export const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null);

export function useWorkspaceActions(): WorkspaceActions {
  const v = useContext(WorkspaceActionsContext);
  if (!v) throw new Error('useWorkspaceActions must be used within a WorkspaceActionsContext provider');
  return v;
}
