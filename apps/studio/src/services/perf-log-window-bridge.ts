// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getLastStartedOpId, getPerfLogSnapshot, type PerfLogEntry } from './perf-log.js';

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

/**
 * Installs an always-on, read-only window global exposing high-frequency
 * operation timing that's deliberately kept OUT of the Activity/Output
 * panels (see perf-log.ts) — a separate channel from
 * `installOpLogWindowBridge`, not a superset of it, so that bridge's own
 * "exposes nothing beyond what the panels already render" invariant stays
 * true. There is no write method.
 */
export function installPerfLogWindowBridge(): void {
  window.__runeStudioPerfLog = {
    snapshot: getPerfLogSnapshot,
    lastStartedOpId: getLastStartedOpId
  };
}
