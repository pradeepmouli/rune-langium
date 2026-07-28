// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, type OutputSeverity } from '../store/output-store.js';
import { useActivityStore } from '../store/activity-store.js';

export type OpLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface OpLogEntry {
  opId?: number;
  op: string;
  subject?: string;
  level: OpLogLevel;
  message: string;
  durationMs?: number;
  ts: number;
  panel: 'output' | 'activity';
}

let _opIdCounter = 0;

/**
 * Allocates a correlation id shared by a start/end addLine or addActivity
 * pair. Pure bookkeeping — does not publish anything on its own.
 */
export function allocateOpId(): number {
  return ++_opIdCounter;
}

function severityToLevel(severity: OutputSeverity): OpLogLevel {
  return severity;
}

/**
 * Stateless read-side aggregator over output-store and activity-store — the
 * studio's two existing publish points for user-visible operation logging.
 * Does not intercept or buffer writes itself; every call re-reads current
 * store state, so it always reflects exactly what the Output/Activity panels
 * show.
 */
export function getOpLogSnapshot(): OpLogEntry[] {
  const fromOutput: OpLogEntry[] = useOutputStore.getState().lines.map((line) => ({
    opId: line.opId,
    op: line.op ?? 'output',
    subject: line.subject,
    level: severityToLevel(line.severity),
    message: line.text,
    durationMs: line.durationMs,
    ts: line.ts,
    panel: 'output'
  }));

  const fromActivity: OpLogEntry[] = useActivityStore.getState().entries.map((entry) => ({
    opId: entry.opId,
    op: entry.tag,
    subject: entry.subject,
    level: entry.ok ? 'success' : 'error',
    message: entry.msg,
    durationMs: entry.durationMs,
    ts: entry.ts,
    panel: 'activity'
  }));

  return [...fromOutput, ...fromActivity].sort((a, b) => a.ts - b.ts);
}
