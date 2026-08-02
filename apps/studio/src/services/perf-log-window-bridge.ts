// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getLastStartedOpId, getPerfLogSnapshot, type PerfLogEntry } from './perf-log.js';
import { withInstrumentation } from './instrumentation/core.js';

export interface RuneStudioPerfLogBridge {
  snapshot(): PerfLogEntry[];
  /** The opId most recently allocated for `op`, or undefined if none yet. */
  lastStartedOpId(op: string): number | undefined;
}

declare global {
  interface Window {
    __runeStudioPerfLog?: RuneStudioPerfLogBridge;
  }
}

export const installPerfLogWindowBridge = withInstrumentation(
  function installPerfLogWindowBridge(): void {
    window.__runeStudioPerfLog = {
      snapshot: getPerfLogSnapshot,
      lastStartedOpId: getLastStartedOpId
    };
  },
  { op: 'installPerfLogWindowBridge' }
);
