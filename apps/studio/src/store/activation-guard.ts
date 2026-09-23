// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from '../services/instrumentation/core.js';

/** Owns an async activation snapshot until a later local transition supersedes it. */
export const createActivationGuard = withInstrumentation(
  function createActivationGuard() {
    let generation = 0;
    return {
      begin(): number {
        return ++generation;
      },
      invalidate(): void {
        ++generation;
      },
      isCurrent(candidate: number): boolean {
        return generation === candidate;
      }
    };
  },
  { op: 'createActivationGuard' }
);
