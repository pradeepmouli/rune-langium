// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { configureInstrumentation, type TelemetryRecord } from './core.js';

/**
 * Wires the instrumentation core's emit sink to postMessage a
 * `telemetry:record` message. The main thread relays this into the SAME
 * browser sink (routeTelemetryRecord) so a worker's captured error lands
 * in the identical pipe, sampling, and shipper as a main-thread one.
 * `post` is injected (rather than reaching for a global `self`) so this
 * is testable without a real Worker context.
 */
export function installInstrumentationWorkerSink(
  post: (msg: { type: 'telemetry:record'; record: TelemetryRecord }) => void
): void {
  configureInstrumentation((record: TelemetryRecord) => {
    post({ type: 'telemetry:record', record });
  });
}

/**
 * Message guard for the relay side. Lives HERE (not in codegen-service.ts,
 * where the preview/instance guards are centralized) because it is not a
 * codegen-specific message — both workers post it, and both relay sites
 * import this one guard.
 */
export function isTelemetryRecordMessage(msg: unknown): msg is { type: 'telemetry:record'; record: TelemetryRecord } {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'telemetry:record';
}
