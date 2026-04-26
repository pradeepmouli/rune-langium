// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T055 — git-backing tests against isomorphic-git over OpfsFs.
 * Network calls (clone / fetch / push) are not exercised here — those are
 * integration territory. Unit tests pin the local-only operations: init,
 * status state machine, commit, dirty-tree detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { initRepo, stageAndCommit, detectSyncState } from '../../src/services/git-backing.js';

let fs: OpfsFs;
const WS = 'ws-git-1';

beforeEach(() => {
  const root = createOpfsRoot();
  fs = new OpfsFs(root as unknown as FileSystemDirectoryHandle);
});

describe('initRepo (T055)', () => {
  it('initialises a fresh repo at <ws>/.git/', async () => {
    await fs.mkdir(`/${WS}/files`);
    await initRepo(fs, WS, { defaultBranch: 'main' });
    const head = (await fs.readFile(`/${WS}/.git/HEAD`, 'utf8')) as string;
    expect(head.trim()).toBe('ref: refs/heads/main');
  });
});

describe('stageAndCommit (T055)', () => {
  it('records a commit with the given identity + message', async () => {
    await fs.mkdir(`/${WS}/files`);
    await initRepo(fs, WS, { defaultBranch: 'main' });
    await fs.writeFile(`/${WS}/files/hello.rosetta`, 'namespace hello\n');
    const sha = await stageAndCommit(fs, WS, {
      message: 'first',
      authorName: 'Test',
      authorEmail: 'test@example.com'
    });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('detectSyncState (T055)', () => {
  it('reports clean immediately after a commit', async () => {
    await fs.mkdir(`/${WS}/files`);
    await initRepo(fs, WS, { defaultBranch: 'main' });
    await fs.writeFile(`/${WS}/files/a.rosetta`, 'namespace a\n');
    await stageAndCommit(fs, WS, {
      message: 'init',
      authorName: 'T',
      authorEmail: 't@e.com'
    });
    expect(await detectSyncState(fs, WS)).toBe('clean');
  });

  it('reports ahead when there are uncommitted changes', async () => {
    await fs.mkdir(`/${WS}/files`);
    await initRepo(fs, WS, { defaultBranch: 'main' });
    await fs.writeFile(`/${WS}/files/a.rosetta`, 'first\n');
    await stageAndCommit(fs, WS, {
      message: 'init',
      authorName: 'T',
      authorEmail: 't@e.com'
    });
    await fs.writeFile(`/${WS}/files/a.rosetta`, 'edited\n');
    expect(await detectSyncState(fs, WS)).toBe('ahead');
  });
});
