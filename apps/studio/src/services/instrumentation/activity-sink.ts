// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { addInstrumentationSink, withInstrumentation, type TelemetryRecord } from './core.js';
import { useActivityStore } from '../../store/activity-store.js';
import { isFailureRecord } from './record-status.js';

/**
 * Feeds the Activity Panel from the shared telemetry pipe. Gates on
 * `record.namespace` being set, NOT numeric level — every unconditionally-
 * emitted error already clears any numeric floor by construction, so
 * gating on level alone would turn every uncaught error anywhere in the
 * app into an activity entry. `namespace` presence is what marks a call as
 * deliberately activity-worthy. See docs/superpowers/specs/
 * 2026-08-02-instrumentation-multi-sink-design.md.
 *
 * Independent of the Toast sink (StudioToastProvider.tsx) — a separate
 * registration, calling `addActivity` directly, never routed through any
 * toast machinery.
 */
export const installInstrumentationActivitySink = withInstrumentation(
  function installInstrumentationActivitySink(): () => void {
    return addInstrumentationSink((record: TelemetryRecord) => {
      if (!record.namespace) return;
      // `isFailureRecord` (shared with the Toast sink) is the correct
      // ok/fail discriminator. `level` alone is NOT: a `handled: true`
      // error is demoted to 'warn' (or 'debug' with `errorLevel: 'debug'`)
      // while still being an error, so `level !== 'error'` would misreport
      // handled errors as successes.
      useActivityStore.getState().addActivity(record.namespace, !isFailureRecord(record), record.message ?? record.op, {
        durationMs: record.durationMs,
        signature: record.signature
      });
    });
  },
  { op: 'installInstrumentationActivitySink' }
);
