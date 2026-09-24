// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { instrumentationConfigFromEnv } from './core.js';

const env = (
  import.meta as {
    env?: {
      VITE_INSTRUMENTATION_LEVEL?: string;
      VITE_INSTRUMENTATION_OPS?: string;
      VITE_INSTRUMENTATION_TIMING_ONLY?: string;
    };
  }
).env;

export const viteInstrumentationConfig = instrumentationConfigFromEnv({
  INSTRUMENTATION_LEVEL: env?.VITE_INSTRUMENTATION_LEVEL,
  INSTRUMENTATION_OPS: env?.VITE_INSTRUMENTATION_OPS,
  INSTRUMENTATION_TIMING_ONLY: env?.VITE_INSTRUMENTATION_TIMING_ONLY
});
