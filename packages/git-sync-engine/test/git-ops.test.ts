// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import git from 'isomorphic-git';
import { createGitOps } from '../src/git-ops.js';

describe('createGitOps', () => {
  it('exposes the operations the engine needs', () => {
    const ops = createGitOps({ fs: {} as never, http: {}, dir: '/w/files', gitdir: '/w/.git' });
    for (const m of [
      'stageAll',
      'commit',
      'fetch',
      'computeAheadBehind',
      'fastForward',
      'merge',
      'push',
      'resetTo',
      'currentSha',
      'remoteSha'
    ]) {
      expect(typeof (ops as unknown as Record<string, unknown>)[m]).toBe('function');
    }
  });
});

describe('computeAheadBehind', () => {
  const author = { name: 'Test', email: 'test@example.com' };
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns {ahead:0, behind:0} when local and remote point to the same commit', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'git-ops-test-'));
    const dir = tmpDir;
    const gitdir = join(dir, '.git');

    await git.init({ fs, dir, gitdir, defaultBranch: 'main' });
    writeFileSync(join(dir, 'a.txt'), '0');
    await git.add({ fs, dir, gitdir, filepath: 'a.txt' });
    const sha = await git.commit({ fs, dir, gitdir, message: 'C0', author });

    // Point origin/main at the same commit as local main
    await git.writeRef({ fs, dir, gitdir, ref: 'refs/remotes/origin/main', value: sha, force: true });

    const ops = createGitOps({ fs: fs as never, http: {}, dir, gitdir });
    expect(await ops.computeAheadBehind('main')).toEqual({ ahead: 0, behind: 0 });
  });

  it('returns {ahead:1, behind:1} for a 1-commit divergence on each side', async () => {
    // Fixture:
    //   C0 (shared base)
    //   ├── C1  ← refs/heads/main  (local is 1 ahead)
    //   └── Cr  ← refs/remotes/origin/main  (remote is 1 behind from local, 1 ahead from local POV)
    tmpDir = mkdtempSync(join(tmpdir(), 'git-ops-diverge-'));
    const dir = tmpDir;
    const gitdir = join(dir, '.git');

    await git.init({ fs, dir, gitdir, defaultBranch: 'main' });

    // C0 — shared base
    writeFileSync(join(dir, 'a.txt'), '0');
    await git.add({ fs, dir, gitdir, filepath: 'a.txt' });
    const C0 = await git.commit({ fs, dir, gitdir, message: 'C0', author });

    // C1 — local advance (main stays at C1 after this)
    writeFileSync(join(dir, 'a.txt'), '1');
    await git.add({ fs, dir, gitdir, filepath: 'a.txt' });
    await git.commit({ fs, dir, gitdir, message: 'C1', author });

    // Branch off C0 to produce Cr (the remote commit diverging from base)
    await git.writeRef({ fs, dir, gitdir, ref: 'refs/heads/tmp', value: C0, force: true });
    await git.checkout({ fs, dir, gitdir, ref: 'tmp', force: true });
    writeFileSync(join(dir, 'b.txt'), 'r');
    await git.add({ fs, dir, gitdir, filepath: 'b.txt' });
    const Cr = await git.commit({ fs, dir, gitdir, message: 'Cr', author });

    // Set remote tracking ref
    await git.writeRef({ fs, dir, gitdir, ref: 'refs/remotes/origin/main', value: Cr, force: true });

    // Return to local main
    await git.checkout({ fs, dir, gitdir, ref: 'main', force: true });

    const ops = createGitOps({ fs: fs as never, http: {}, dir, gitdir });
    const result = await ops.computeAheadBehind('main');
    expect(result).toEqual({ ahead: 1, behind: 1 });
  });

  it('returns {ahead:0, behind:0} when local ref does not exist', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'git-ops-null-'));
    const dir = tmpDir;
    const gitdir = join(dir, '.git');

    await git.init({ fs, dir, gitdir, defaultBranch: 'main' });

    // No commits — refs/heads/main does not exist yet
    const ops = createGitOps({ fs: fs as never, http: {}, dir, gitdir });
    expect(await ops.computeAheadBehind('main')).toEqual({ ahead: 0, behind: 0 });
  });

  it('returns {ahead:0, behind:2} when local is 2 behind remote and not diverged', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'git-ops-behind-'));
    const dir = tmpDir;
    const gitdir = join(dir, '.git');

    await git.init({ fs, dir, gitdir, defaultBranch: 'main' });

    // C0
    writeFileSync(join(dir, 'a.txt'), '0');
    await git.add({ fs, dir, gitdir, filepath: 'a.txt' });
    const C0 = await git.commit({ fs, dir, gitdir, message: 'C0', author });

    // CR1 and CR2 — two remote-only commits branching off C0
    await git.writeRef({ fs, dir, gitdir, ref: 'refs/heads/remote-branch', value: C0, force: true });
    await git.checkout({ fs, dir, gitdir, ref: 'remote-branch', force: true });
    writeFileSync(join(dir, 'r.txt'), '1');
    await git.add({ fs, dir, gitdir, filepath: 'r.txt' });
    await git.commit({ fs, dir, gitdir, message: 'CR1', author });
    writeFileSync(join(dir, 'r.txt'), '2');
    await git.add({ fs, dir, gitdir, filepath: 'r.txt' });
    const CR2 = await git.commit({ fs, dir, gitdir, message: 'CR2', author });

    // origin/main points to CR2; local main stays at C0
    await git.writeRef({ fs, dir, gitdir, ref: 'refs/remotes/origin/main', value: CR2, force: true });
    await git.checkout({ fs, dir, gitdir, ref: 'main', force: true });

    const ops = createGitOps({ fs: fs as never, http: {}, dir, gitdir });
    const result = await ops.computeAheadBehind('main');
    expect(result).toEqual({ ahead: 0, behind: 2 });
  });
});
