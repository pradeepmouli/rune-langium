// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import git from 'isomorphic-git';
import { InMemoryFs } from '../../src/services/in-memory-fs.js';
import { createGitSyncEngine } from '@rune-langium/git-sync-engine';

describe('git-sync round trip (fs-only)', () => {
  it('commits a local edit via the engine (durability invariant)', async () => {
    const fs = new InMemoryFs() as never;
    await (fs as InMemoryFs).promises.mkdir('/ws/files', { recursive: true });
    await git.init({ fs, dir: '/ws/files', gitdir: '/ws/.git', defaultBranch: 'main' });
    await (fs as InMemoryFs).promises.writeFile('/ws/files/a.rosetta', 'namespace a');
    await git.add({ fs, dir: '/ws/files', gitdir: '/ws/.git', filepath: 'a.rosetta' });
    await git.commit({ fs, dir: '/ws/files', gitdir: '/ws/.git', message: 'init', author: { name: 'A', email: 'a@x' } });

    // Simulate a studio edit landing in the working tree
    await (fs as InMemoryFs).promises.writeFile('/ws/files/a.rosetta', 'namespace a\ntype X:');

    const engine = createGitSyncEngine({
      fs,
      // Stub http that always rejects — guarantees the fetch step fails cleanly
      // without relying on isomorphic-git's behaviour with an empty `{}` http
      // object (which varies across versions). The durability assertion (commit
      // precedes any network step) is unaffected: stageAll + commit run before
      // the first fetch call.
      http: { request: async () => { throw new Error('no network'); } },
      dir: '/ws/files',
      gitdir: '/ws/.git',
      remoteUrl: 'memory://noop',
      ref: 'main',
      onAuth: () => ({ username: 'u', password: 't' }),
      author: { name: 'A', email: 'a@x' },
      debounceMs: 0,
    });

    // No remote tracking ref / unreachable remoteUrl → the fetch step fails and
    // the engine goes 'offline', but the local commit must have happened FIRST
    // (durability invariant: commit precedes any network step).
    await engine.syncNow();

    const log = await git.log({ fs, dir: '/ws/files', gitdir: '/ws/.git' });
    // init + the engine's commit of the edit
    expect(log.length).toBeGreaterThanOrEqual(2);
  });
});
