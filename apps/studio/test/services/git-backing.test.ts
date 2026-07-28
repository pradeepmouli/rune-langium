// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T055 — git-backing tests against isomorphic-git over OpfsFs.
 * Network calls (clone / fetch / push) are not exercised here — those are
 * integration territory. Unit tests pin the local-only operations: init,
 * status state machine, commit, dirty-tree detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import git from 'isomorphic-git';
import { createOpfsRoot } from '../setup/opfs-mock.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';
import { initRepo, stageAndCommit, detectSyncState } from '../../src/services/git-backing.js';
import { useOutputStore } from '../../src/store/output-store.js';

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

describe('stageAndCommit — working-tree scan failure (op-log)', () => {
  it('logs an op-log error when the working-tree scan fails, since a swallowed readdir would otherwise push an incomplete tree', async () => {
    useOutputStore.setState({ lines: [] });
    await fs.mkdir(`/${WS}/files`);
    await initRepo(fs, WS, { defaultBranch: 'main' });
    await fs.writeFile(`/${WS}/files/a.rosetta`, 'namespace a\n');

    vi.spyOn(fs, 'readdir').mockRejectedValue(new Error('permission denied'));

    // walk() catches the readdir failure internally rather than propagating
    // it, so the commit still succeeds — just with whatever partial tree
    // could be scanned.
    await expect(
      stageAndCommit(fs, WS, { message: 'partial', authorName: 'T', authorEmail: 't@e.com' })
    ).resolves.toEqual(expect.any(String));

    const entry = useOutputStore.getState().lines.find((l) => l.op === 'git');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('error');
    expect(entry?.text).toContain('working tree scan failed');
  });
});

describe('git-backing dir/gitdir layout', () => {
  it('commits files under <id>/files with .git at <id>/.git, and detects ahead', async () => {
    const memFs = new InMemoryFs() as never;
    const wsId = 'ws1';
    await (memFs as InMemoryFs).promises.mkdir('/ws1/files', { recursive: true });
    await initRepo(memFs as unknown as OpfsFs, wsId);
    await (memFs as InMemoryFs).promises.writeFile('/ws1/files/a.rosetta', 'namespace x');

    expect(await detectSyncState(memFs as unknown as OpfsFs, wsId)).toBe('ahead');
    const sha = await stageAndCommit(memFs as unknown as OpfsFs, wsId, {
      message: 'init',
      authorName: 'A',
      authorEmail: 'a@x'
    });
    expect(typeof sha).toBe('string');
    expect(await detectSyncState(memFs as unknown as OpfsFs, wsId)).toBe('clean');

    const dotGit = await (memFs as InMemoryFs).promises.readdir('/ws1/.git');
    expect(dotGit).toContain('HEAD');
    const fsForGit = memFs as never;
    const log = await git.log({ fs: fsForGit, dir: '/ws1/files', gitdir: '/ws1/.git' });
    expect(log.length).toBe(1);
  });
});
