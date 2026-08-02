// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

export const isWorkerGlobalScope = withInstrumentation(
  function isWorkerGlobalScope(): boolean {
    if (typeof self === 'undefined') return false;
    // `WorkerGlobalScope` only exists inside a worker; in the main thread it's
    // undefined even though `self` resolves to `window`.
    const WorkerGlobalScopeCtor = (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope;
    if (typeof WorkerGlobalScopeCtor === 'function' && self instanceof (WorkerGlobalScopeCtor as new () => unknown)) {
      return true;
    }
    // Fallback: `importScripts` is defined on every worker variant
    // (Dedicated, Shared, and Service worker global scopes) but never on
    // `window`, so it's a sound "is-this-a-worker" check.
    return typeof (self as { importScripts?: unknown }).importScripts === 'function';
  },
  {
    op: 'isWorkerGlobalScope',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);
