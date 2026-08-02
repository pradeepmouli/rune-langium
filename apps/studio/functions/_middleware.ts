// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { installInstrumentationEdgeSink } from './lib/instrumentation-sink.js';
import { withInstrumentation } from '../src/services/instrumentation/core.js';

/**
 * Pages Functions middleware. Configures cross-cutting concerns
 * (instrumentation, error envelopes, request logging) at the request boundary.
 */

// Manually wrapped (Cloudflare Pages Function convention exports an arrow,
// which the codemod doesn't touch). `ctx` carries the raw Request (headers,
// cookies) and `env` (may carry secret bindings) — never captured.
export const onRequest: PagesFunction<{ INSTRUMENTATION_ENABLED?: string }> = withInstrumentation(
  (ctx) => {
    installInstrumentationEdgeSink(ctx.env);
    return ctx.next();
  },
  { op: 'onRequest' }
);
