// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import {
  configureInstrumentation,
  instrumentationConfigFromEnv,
  type InstrumentationEnvironment,
  type TelemetryRecord
} from '../../src/services/instrumentation/core.js';
import { withInstrumentation } from '../../src/services/instrumentation/core.js';

export interface EdgeInstrumentationEnv extends InstrumentationEnvironment {
  INSTRUMENTATION_ENABLED?: string;
}

export const installInstrumentationEdgeSink = withInstrumentation(
  function installInstrumentationEdgeSink(env: EdgeInstrumentationEnv): void {
    if (env.INSTRUMENTATION_ENABLED !== 'true') {
      configureInstrumentation(
        () => {},
        () => false
      );
      return;
    }

    const config = instrumentationConfigFromEnv(env);
    configureInstrumentation(
      (record: TelemetryRecord) => {
        console.log(
          JSON.stringify(
            config.timingOnly
              ? {
                  op: record.op,
                  level: record.level,
                  durationMs: record.durationMs,
                  signature: record.signature,
                  ts: record.ts
                }
              : record
          )
        );
      },
      undefined,
      config
    );
    // The registered sink is an inline arrow (never itself instrumented), so
    // unlike src/services/instrumentation/browser-sink.ts's routeTelemetryRecord
    // this installer is safe to wrap — no self-referential emit loop.
  },
  { op: 'installInstrumentationEdgeSink' }
);

// Each Pages route is bundled independently, so middleware and route modules
// do not share instrumentation-core's module state. Configure the route's own
// sink before its instrumented handler begins.
// oxlint-disable-next-line rune/no-uninstrumented-export -- configuration must run before the wrapped handler
export function withEdgeInstrumentation<Env>(handler: PagesFunction<Env>): PagesFunction<Env> {
  return (ctx) => {
    installInstrumentationEdgeSink((ctx.env ?? {}) as EdgeInstrumentationEnv);
    return handler(ctx);
  };
}
