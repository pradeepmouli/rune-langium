// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import git from 'isomorphic-git';
import type { IsoGitFs, IsoGitHttp } from './types.js';

export interface GitOpsConfig {
  fs: IsoGitFs;
  http: IsoGitHttp;
  dir: string;
  gitdir: string;
  corsProxy?: string;
  onAuth?: () => { username: string; password: string };
}

export interface MergeResult {
  ok: boolean;
  conflictPaths?: string[];
}

export interface GitOps {
  stageAll(): Promise<string[]>;
  commit(message: string, author: { name: string; email: string }): Promise<string>;
  fetch(ref: string, remoteUrl: string): Promise<void>;
  computeAheadBehind(ref: string): Promise<{ ahead: number; behind: number }>;
  fastForward(ref: string): Promise<void>;
  merge(ref: string, author: { name: string; email: string }): Promise<MergeResult>;
  push(ref: string, remoteUrl: string, opts?: { force?: boolean }): Promise<void>;
  resetTo(ref: string): Promise<void>;
  currentSha(ref: string): Promise<string | null>;
  remoteSha(ref: string): Promise<string | null>;
}

export function createGitOps(cfg: GitOpsConfig): GitOps {
  const base = { fs: cfg.fs as never, dir: cfg.dir, gitdir: cfg.gitdir };
  const net = { http: cfg.http as never, corsProxy: cfg.corsProxy, onAuth: cfg.onAuth };

  // Define as locals so methods that call each other avoid `this` issues.
  const currentSha = async (ref: string): Promise<string | null> => {
    try {
      return await git.resolveRef({ ...base, ref });
    } catch {
      return null;
    }
  };

  const remoteSha = async (ref: string): Promise<string | null> => {
    try {
      return await git.resolveRef({ ...base, ref: `refs/remotes/origin/${ref}` });
    } catch {
      return null;
    }
  };

  const stageAll = async (): Promise<string[]> => {
    const matrix = await git.statusMatrix(base);
    const changed: string[] = [];
    for (const [filepath, head, workdir, stage] of matrix) {
      if (head === workdir && workdir === stage) continue;
      changed.push(filepath);
      if (workdir === 0) {
        await git.remove({ ...base, filepath });
      } else {
        await git.add({ ...base, filepath });
      }
    }
    return changed;
  };

  const commit = async (
    message: string,
    author: { name: string; email: string },
  ): Promise<string> => {
    return git.commit({ ...base, message, author });
  };

  const fetch = async (ref: string, url: string): Promise<void> => {
    await git.fetch({ ...base, ...net, url, ref, singleBranch: true, tags: false });
  };

  /**
   * Counts commits the local ref is ahead/behind its remote tracking ref.
   *
   * Assumes a NON-shallow clone (full history). Under a `depth: 1` shallow
   * clone the `git.log` walks are truncated, so the counts become best-effort.
   * The git-backed clone is made full-depth in a later task, so this assumption
   * holds.
   *
   * Returning `{ ahead: 0, behind: 0 }` when either SHA is null means "treat as
   * in-sync / nothing to do".
   */
  const computeAheadBehind = async (
    ref: string,
  ): Promise<{ ahead: number; behind: number }> => {
    const local = await currentSha(ref);
    const remote = await remoteSha(ref);
    if (!local || !remote) return { ahead: 0, behind: 0 };
    if (local === remote) return { ahead: 0, behind: 0 };
    const localLog = await git.log({ ...base, ref: local });
    const remoteLog = await git.log({ ...base, ref: remote });
    const localShas = new Set(localLog.map((c) => c.oid));
    const remoteShas = new Set(remoteLog.map((c) => c.oid));
    const ahead = localLog.filter((c) => !remoteShas.has(c.oid)).length;
    const behind = remoteLog.filter((c) => !localShas.has(c.oid)).length;
    return { ahead, behind };
  };

  /**
   * Precondition: caller must have verified the remote is strictly ahead (local
   * has no un-pushed commits, i.e. ahead === 0). Performs an unconditional
   * ref-move + force checkout and does NOT itself guard against losing local
   * history. (`resetTo` is the intentional unconditional hard-reset-to-remote.)
   */
  const fastForward = async (ref: string): Promise<void> => {
    const remote = await remoteSha(ref);
    if (!remote) return;
    await git.writeRef({ ...base, ref: `refs/heads/${ref}`, value: remote, force: true });
    await git.checkout({ ...base, ref, force: true });
  };

  const merge = async (
    ref: string,
    author: { name: string; email: string },
  ): Promise<MergeResult> => {
    try {
      // abortOnConflict: false → throws MergeConflictError (with data.filepaths) on conflict.
      // abortOnConflict: true (default) → throws MergeNotSupportedError (no paths available).
      await git.merge({
        ...base,
        ours: ref,
        theirs: `refs/remotes/origin/${ref}`,
        author,
        abortOnConflict: false,
      });
      await git.checkout({ ...base, ref, force: true });
      return { ok: true };
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'MergeConflictError') {
        // err.data.filepaths lists all conflicting paths.
        const paths =
          (err as { data?: { filepaths?: string[] } })?.data?.filepaths ?? [];
        return { ok: false, conflictPaths: paths };
      }
      if (code === 'MergeNotSupportedError') {
        // Fallback: unsupported merge strategy (binary files, etc.), no paths.
        return { ok: false, conflictPaths: [] };
      }
      throw err;
    }
  };

  const push = async (
    ref: string,
    url: string,
    opts?: { force?: boolean },
  ): Promise<void> => {
    await git.push({ ...base, ...net, url, ref, force: opts?.force ?? false });
  };

  const resetTo = async (ref: string): Promise<void> => {
    const remote = await remoteSha(ref);
    if (!remote) return;
    await git.writeRef({ ...base, ref: `refs/heads/${ref}`, value: remote, force: true });
    await git.checkout({ ...base, ref, force: true });
  };

  return {
    stageAll,
    commit,
    fetch,
    computeAheadBehind,
    fastForward,
    merge,
    push,
    resetTo,
    currentSha,
    remoteSha,
  };
}
