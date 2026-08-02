// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, fmtLine } from '../../store/output-store.js';
import { configureInstrumentation, type TelemetryRecord } from './core.js';

/**
 * Wires the instrumentation core's emit sink to the SAME addLine op-log
 * telemetry-shipper.ts already reads — this is a new PRODUCER into the
 * existing pipe, not a second channel. Call once at browser bootstrap
 * (apps/studio/src/main.tsx), mirroring installTelemetryCapture().
 */

/**
 * Maps one TelemetryRecord onto the existing addLine shape. Exported
 * standalone because the worker relays (Task 5) route worker-originated
 * records through the exact same mapping — one mapping, not three copies.
 * `trace`/`debug` collapse to severity 'info' (OutputSeverity has no lower
 * tier, and the op_spans wire schema's level enum is closed over
 * info|warn|error) — with the default threshold they never get here at all.
 */
export function routeTelemetryRecord(record: TelemetryRecord): void {
  const addLine = useOutputStore.getState().addLine;
  const severity = record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : 'info';
  addLine(fmtLine(record.op, record.subject ?? ''), severity, {
    op: record.op,
    subject: record.subject,
    signature: record.signature,
    durationMs: record.durationMs
  });
}

export function installInstrumentationBrowserSink(): void {
  configureInstrumentation(routeTelemetryRecord);
}
