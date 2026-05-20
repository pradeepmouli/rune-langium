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


