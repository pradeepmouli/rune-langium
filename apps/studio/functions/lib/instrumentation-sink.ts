// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { configureInstrumentation, type TelemetryRecord } from '../../src/services/instrumentation/core.js';
import { withInstrumentation } from '../../src/services/instrumentation/core.js';

export const installInstrumentationEdgeSink = withInstrumentation(
  function installInstrumentationEdgeSink(env: { INSTRUMENTATION_ENABLED?: string }): void {
    if (env.INSTRUMENTATION_ENABLED !== 'true') return;
    configureInstrumentation((record: TelemetryRecord) => {
      console.log(JSON.stringify(record));
    });
    // The registered sink is an inline arrow (never itself instrumented), so
    // unlike src/services/instrumentation/browser-sink.ts's routeTelemetryRecord
    // this installer is safe to wrap — no self-referential emit loop.
  },
  { op: 'installInstrumentationEdgeSink' }
);
