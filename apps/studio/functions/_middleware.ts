// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { installInstrumentationEdgeSink } from './lib/instrumentation-sink.js';

/**
 * Pages Functions middleware. Configures cross-cutting concerns
 * (instrumentation, error envelopes, request logging) at the request boundary.
 */

export const onRequest: PagesFunction<{ INSTRUMENTATION_ENABLED?: string }> = (ctx) => {
  installInstrumentationEdgeSink(ctx.env);
  return ctx.next();
};
