// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { WorkspaceFile } from './services/workspace.js';

export interface RuneStudioTestApi {
  createCodegenWorker?(): Worker;
  replaceWorkspaceFiles?(files: WorkspaceFile[]): Promise<void>;
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


