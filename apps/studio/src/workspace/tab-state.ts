// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Per-tab scroll + cursor position storage. Lives at
 * `<workspace-id>/.studio/scratch.json` in OPFS so it travels with the
 * workspace and survives reload (FR-011).
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';

export interface TabScratch {
  path: string;
  scrollTop: number;
  cursorOffset: number;
}

export interface ScratchState {
  activeTabPath: string | null;
  tabs: TabScratch[];
}

const SCRATCH_PATH = '.studio/scratch.json';

export async function saveScratch(fs: OpfsFs, wsId: string, state: ScratchState): Promise<void> {
  await fs.writeFile(`/${wsId}/${SCRATCH_PATH}`, JSON.stringify(state));
}

export async function loadScratch(fs: OpfsFs, wsId: string): Promise<ScratchState | null> {
  let raw: string;
  try {
    const v = await fs.readFile(`/${wsId}/${SCRATCH_PATH}`, 'utf8');
    raw = typeof v === 'string' ? v : new TextDecoder().decode(v);
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as ScratchState;
  } catch {
    // Malformed shadow file — treat as absent rather than fail the open.
    return null;
  }
}
