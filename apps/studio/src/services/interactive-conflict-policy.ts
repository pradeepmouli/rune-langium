// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ConflictPolicy, ConflictResolution } from '@rune-langium/git-sync-engine';

export interface InteractiveConflictPolicy extends ConflictPolicy {
  resolve(choice: 'keepMine' | 'takeRemote'): void;
}

/**
 * A ConflictPolicy whose onConflict() promise stays pending until the UI
 * calls resolve(choice). The engine awaits onConflict; the sync-status badge
 * fulfils it when the user clicks keep-mine / take-remote.
 */
export function createInteractiveConflictPolicy(): InteractiveConflictPolicy {
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
}
