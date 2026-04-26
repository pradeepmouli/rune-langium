// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T045 / T047 — tab-state + crash-recovery (FR-015) tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createOpfsRoot, type OpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { saveScratch, loadScratch } from '../../src/workspace/tab-state.js';
import {
  saveDirtyBuffer,
  loadDirtyBuffer,
  clearDirtyBuffer,
  listDirtyBuffers
} from '../../src/workspace/dirty-buffer.js';

let opfs: OpfsRoot;
let fs: OpfsFs;
const WS = '01ARZ3';

beforeEach(() => {
  opfs = createOpfsRoot();
  fs = new OpfsFs(opfs as unknown as FileSystemDirectoryHandle);
});

describe('saveScratch / loadScratch (T045)', () => {
  it('round-trips per-tab scroll/cursor positions', async () => {
    await saveScratch(fs, WS, {
      activeTabPath: 'foo.rosetta',
      tabs: [
        { path: 'foo.rosetta', scrollTop: 120, cursorOffset: 542 },
        { path: 'bar.rosetta', scrollTop: 0, cursorOffset: 0 }
      ]
    });
    const loaded = await loadScratch(fs, WS);
    expect(loaded?.activeTabPath).toBe('foo.rosetta');
    expect(loaded?.tabs).toHaveLength(2);
    expect(loaded?.tabs[0]?.scrollTop).toBe(120);
  });

  it('returns null when no scratch has been saved yet', async () => {
    expect(await loadScratch(fs, WS)).toBeNull();
  });

  it('overwrites previous scratch on subsequent save', async () => {
    await saveScratch(fs, WS, { activeTabPath: 'a', tabs: [] });
    await saveScratch(fs, WS, { activeTabPath: 'b', tabs: [] });
    expect((await loadScratch(fs, WS))?.activeTabPath).toBe('b');
  });

  it('quietly returns null on malformed JSON in the scratch file', async () => {
    await fs.mkdir(`/${WS}/.studio`);
    await fs.writeFile(`/${WS}/.studio/scratch.json`, 'not json');
    expect(await loadScratch(fs, WS)).toBeNull();
  });
});

describe('dirty-buffer crash recovery (T047 / FR-015)', () => {
  it('saves a dirty buffer, restores it, then clears', async () => {
    await saveDirtyBuffer(fs, WS, 'foo/a.rosetta', 'edited content');
    expect(await loadDirtyBuffer(fs, WS, 'foo/a.rosetta')).toBe('edited content');
    await clearDirtyBuffer(fs, WS, 'foo/a.rosetta');
    expect(await loadDirtyBuffer(fs, WS, 'foo/a.rosetta')).toBeNull();
  });

  it('lists every dirty buffer in the workspace (post-crash recovery)', async () => {
    await saveDirtyBuffer(fs, WS, 'foo/a.rosetta', 'A');
    await saveDirtyBuffer(fs, WS, 'bar/b.rosetta', 'B');
    const paths = await listDirtyBuffers(fs, WS);
    expect(paths.sort()).toEqual(['bar/b.rosetta', 'foo/a.rosetta']);
  });

  it('encoded path collision: two paths that differ only by `/` vs `__` do not clobber', async () => {
    // The flat shadow file uses `__` as the separator; we must ensure a
    // legitimate path containing `__` doesn't collide with an encoded `/`.
    await saveDirtyBuffer(fs, WS, 'a/b', 'slash');
    await saveDirtyBuffer(fs, WS, 'a__b', 'underscore');
    expect(await loadDirtyBuffer(fs, WS, 'a/b')).toBe('slash');
    expect(await loadDirtyBuffer(fs, WS, 'a__b')).toBe('underscore');
  });
});
