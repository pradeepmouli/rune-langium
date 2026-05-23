// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { WorkspaceFile } from './services/workspace.js';

export interface RuneStudioTestApi {
  createCodegenWorker?(): Worker;
  replaceWorkspaceFiles?(files: WorkspaceFile[]): Promise<void>;
  /**
   * Drive the same workspace-switch flow the WorkspaceSwitcher / start-page
   * Recents list invokes. Exposed for the curated-binding switch-race
   * regression (Codex P1, PR #220) — testing the race requires that
   * `restoreWorkspace` runs with a prior `restoredWorkspace` set so the
   * eviction step engages. Cold-start render doesn't satisfy that
   * precondition.
   */
  switchWorkspace?(workspaceId: string): Promise<void>;
  /**
   * Drive the launcher file-load flow (FileLoader → App.handleFilesLoaded) with
   * a workspace already open. Exposed for the destructive-overwrite regression
   * (Codex P1, PR #238): the Workspaces perspective is reachable while a project
   * is active, but that surface renders inside EditorPage (mocked in App tests),
   * so a cold-start render can't reach it. An explicit `targetWorkspaceId`
   * mirrors the git-clone path (load INTO a specific workspace).
   */
  loadFiles?(files: WorkspaceFile[], targetWorkspaceId?: string): Promise<void> | void;
}

const IS_TEST_MODE =
  (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.MODE === 'test';

declare global {
  interface Window {
    __runeStudioTestApi?: RuneStudioTestApi;
  }
}

export function getRuneStudioTestApi(): RuneStudioTestApi | undefined {
  return IS_TEST_MODE ? window.__runeStudioTestApi : undefined;
}

export function setRuneStudioTestApi(
  updater: (current: RuneStudioTestApi | undefined) => RuneStudioTestApi | undefined
): void {
  if (!IS_TEST_MODE) {
    return;
  }
  const next = updater(window.__runeStudioTestApi);
  if (!next || Object.keys(next).length === 0) {
    delete window.__runeStudioTestApi;
    return;
  }
  window.__runeStudioTestApi = next;
}


