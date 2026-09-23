// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from './instrumentation/core.js';

export class OperationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'OperationTimeoutError';
  }
}

/** Bound an entire fetch operation, including consumption of its response body. */
export const withAbortTimeout = withInstrumentation(
  async function withAbortTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new OperationTimeoutError(timeoutMs);
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([run(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  },
  { op: 'withAbortTimeout' }
);
