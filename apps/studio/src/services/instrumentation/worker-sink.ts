// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { configureInstrumentation, type TelemetryRecord } from './core.js';
import { withInstrumentation, Capture } from './core.js';

// `post` here is registered as configureInstrumentation's emit callback
// (an inline arrow, never itself instrumented), so — unlike
// browser-sink.ts's routeTelemetryRecord — installInstrumentationWorkerSink
// itself is safe to wrap: it only runs once at worker boot, before the
// sink exists.
export const installInstrumentationWorkerSink = withInstrumentation(
  function installInstrumentationWorkerSink(
    post: (msg: { type: 'telemetry:record'; record: TelemetryRecord }) => void
  ): void {
    configureInstrumentation((record: TelemetryRecord) => {
      post({ type: 'telemetry:record', record });
    });
  },
  { op: 'installInstrumentationWorkerSink' }
);

export const isTelemetryRecordMessage = withInstrumentation(
  function isTelemetryRecordMessage(msg: unknown): msg is { type: 'telemetry:record'; record: TelemetryRecord } {
    return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'telemetry:record';
  },
  {
    op: 'isTelemetryRecordMessage',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);
