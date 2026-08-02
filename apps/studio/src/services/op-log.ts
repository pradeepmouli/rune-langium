// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, type OutputSeverity } from '../store/output-store.js';
import { useActivityStore } from '../store/activity-store.js';
import { withInstrumentation, Capture } from './instrumentation/core.js';

export type OpLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface OpLogEntry {
  opId?: number;
  op: string;
  subject?: string;
  level: OpLogLevel;
  message: string;
  durationMs?: number;
  ts: number;
  /**
   * `'perf'` is never produced by `getOpLogSnapshot` below (it stays a pure
   * mirror of the Activity/Output panels — see op-log-window-bridge.ts's
   * doc comment) — it's here only so `JourneyRecord.opLog` can carry
   * perf-log.ts entries too, merged in test-side by prod-ux/fixtures.ts.
   */
  panel: 'output' | 'activity' | 'perf';
  /**
   * The source store's own unique id for this entry (`OutputLine.id` /
   * `ActivityEntry.id`, each a monotonic per-store counter — for
   * `panel: 'perf'` entries, reuse `opId`, which perf-log.ts already
   * guarantees unique per entry). `(panel, sourceId)` is a genuinely
   * unique composite key, unlike `(op, opId, ts, message)`: `opId` is
   * often absent, `ts` can collide (browsers may clamp
   * `performance.now()`'s resolution), and two DIFFERENT entries can
   * share identical message text (e.g. two diagnostics with the same
   * code emitted synchronously). Exists specifically so
   * `EvidenceCollector.recordOpLog`'s dedup key has a real identity to
   * key on instead of guessing from content.
   */
  sourceId: number;
}

let _opIdCounter = 0;

export const allocateOpId = withInstrumentation(
  function allocateOpId(): number {
    return ++_opIdCounter;
  },
  { op: 'allocateOpId', capture: Capture.Output, sanitize: (value, which) => (which === 'output' ? value : undefined) }
);

function severityToLevel(severity: OutputSeverity): OpLogLevel {
  return severity;
}

export const getOpLogSnapshot = withInstrumentation(
  function getOpLogSnapshot(): OpLogEntry[] {
    const fromOutput: OpLogEntry[] = useOutputStore.getState().lines.map((line) => ({
      opId: line.opId,
      op: line.op ?? 'output',
      subject: line.subject,
      level: severityToLevel(line.severity),
      message: line.text,
      durationMs: line.durationMs,
      ts: line.ts,
      panel: 'output',
      sourceId: line.id
    }));

    const fromActivity: OpLogEntry[] = useActivityStore.getState().entries.map((entry) => ({
      opId: entry.opId,
      op: entry.tag,
      subject: entry.subject,
      level: entry.ok ? 'success' : 'error',
      message: entry.msg,
      durationMs: entry.durationMs,
      ts: entry.ts,
      panel: 'activity',
      sourceId: entry.id
    }));

    return [...fromOutput, ...fromActivity].sort((a, b) => a.ts - b.ts);
    // Entries carry free-form `message`/`subject` text (op-log producers can
    // surface user/model-derived strings — see telemetry-shipper.ts's
    // safeSubject commentary) — never capture the array itself, only a count.
  },
  {
    op: 'getOpLogSnapshot',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' && Array.isArray(value) ? { count: value.length } : undefined)
  }
);
