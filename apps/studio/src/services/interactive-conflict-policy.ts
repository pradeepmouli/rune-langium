// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ConflictPolicy, ConflictResolution } from '@rune-langium/git-sync-engine';
import { withInstrumentation } from './instrumentation/core.js';

export interface InteractiveConflictPolicy extends ConflictPolicy {
  resolve(choice: 'keepMine' | 'takeRemote'): void;
}

export const createInteractiveConflictPolicy = withInstrumentation(
  function createInteractiveConflictPolicy(): InteractiveConflictPolicy {
    let pending: ((r: ConflictResolution) => void) | null = null;
    return {
      onConflict() {
        return new Promise<ConflictResolution>((res) => {
          pending = res;
        });
      },
      resolve(choice) {
        pending?.({ action: choice });
        pending = null;
      }
    };
  },
  { op: 'createInteractiveConflictPolicy' }
);
