// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Git-backed workspace service. Drives `isomorphic-git` against `OpfsFs`
 * so commits live alongside files in the same OPFS tree.
 *
 * Layout per workspace:
 *   /<workspaceId>/files/...   working tree  (isomorphic-git `dir`)
 *   /<workspaceId>/.git/...    git object store (isomorphic-git `gitdir`)
 *
 * Network ops (clone / fetch / pull / push) are exposed by separate
 * functions that the UI layer wires once the user has authenticated via
 * the device-flow path. They route through the same isomorphic-git CORS
 * proxy as the rest of the studio's git work.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import type { OpfsFs } from '../opfs/opfs-fs.js';
import { useOutputStore, fmtLine } from '../store/output-store.js';

const CORS_PROXY = 'https://cors.isomorphic-git.org';

export type SyncState = 'clean' | 'ahead' | 'behind' | 'diverged' | 'conflict';

interface GitFsAdapter {
  promises: {
    readFile: OpfsFs['readFile'];
    writeFile: OpfsFs['writeFile'];
    mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
    rmdir: OpfsFs['rmdir'];
    unlink: OpfsFs['unlink'];
    stat: OpfsFs['stat'];
    lstat: OpfsFs['lstat'];
    readdir: OpfsFs['readdir'];
    readlink: OpfsFs['readlink'];
    symlink: OpfsFs['symlink'];
    chmod: OpfsFs['chmod'];
  };
}

/** Wrap our OpfsFs as the `{ promises: {...} }` shape isomorphic-git wants. */
function gitFs(fs: OpfsFs): GitFsAdapter {
  return {
    promises: {
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      mkdir: async (path: string, _opts?: { recursive?: boolean }) => {
        // OpfsFs.mkdir is already mkdir -p / idempotent.
        await fs.mkdir(path);
      },
      rmdir: fs.rmdir.bind(fs),
      unlink: fs.unlink.bind(fs),
      stat: fs.stat.bind(fs),
      lstat: fs.lstat.bind(fs),
      readdir: fs.readdir.bind(fs),
      readlink: fs.readlink.bind(fs),
      symlink: fs.symlink.bind(fs),
      chmod: fs.chmod.bind(fs)
    }
  };
}

/**
 * Produce the `{ promises }` shape that isomorphic-git requires from any
 * fs-like object. Accepts:
 *  - `OpfsFs` — direct method surface (the primary production path).
 *  - Any object already carrying a `.promises` property (e.g. `InMemoryFs`
 *    in tests) — returned as-is, since it already satisfies the interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGitFs(fs: OpfsFs): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (fs as any).promises === 'object' && (fs as any).promises !== null) {
    return fs;
  }
  return gitFs(fs);
}

/** Working-tree root: `/<workspaceId>/files` (where the editor reads/writes). */
function worktreeDir(workspaceId: string): string {
  return `/${workspaceId}/files`;
}

/** Git object-store root: `/<workspaceId>/.git`. */
function gitDir(workspaceId: string): string {
  return `/${workspaceId}/.git`;
}

export interface InitOptions {
  defaultBranch?: string;
}

export async function initRepo(fs: OpfsFs, workspaceId: string, options: InitOptions = {}): Promise<void> {
  await git.init({
    fs: toGitFs(fs),
    dir: worktreeDir(workspaceId),
    gitdir: gitDir(workspaceId),
    defaultBranch: options.defaultBranch ?? 'main'
  });
}

export interface CommitOptions {
  message: string;
  authorName: string;
  authorEmail: string;
}

export async function stageAndCommit(fs: OpfsFs, workspaceId: string, options: CommitOptions): Promise<string> {
  const dir = worktreeDir(workspaceId);
  const gdir = gitDir(workspaceId);
  const fsAdapter = toGitFs(fs);
  // Walk the working tree and stage every file under files/.
  const files = await listWorkingTree(fs, workspaceId);
  for (const f of files) {
    await git.add({ fs: fsAdapter, dir, gitdir: gdir, filepath: f });
  }
  const sha = await git.commit({
    fs: fsAdapter,
    dir,
    gitdir: gdir,
    message: options.message,
    author: { name: options.authorName, email: options.authorEmail }
  });
  return sha;
}

export async function detectSyncState(fs: OpfsFs, workspaceId: string): Promise<SyncState> {
  const matrix = await git.statusMatrix({
    fs: toGitFs(fs),
    dir: worktreeDir(workspaceId),
    gitdir: gitDir(workspaceId)
  });
  // Each row: [filepath, head, workdir, stage]. Anything where workdir != stage
  // or workdir != head is a local change → ahead.
  const dirty = matrix.some(([_path, head, workdir, stage]) => head !== workdir || workdir !== stage);
  return dirty ? 'ahead' : 'clean';
}

export interface CloneOptions {
  /** Public or private GitHub repo URL (e.g. `https://github.com/owner/repo.git`). */
  remoteUrl: string;
  /** Branch / ref to check out. Defaults to `main` when not supplied. */
  ref?: string;
  /** Personal access token from the device-flow exchange; sent as the password. */
  token: string;
  /** Account name for the auth header; can be anything for token auth. */
  user: string;
  /** Optional progress hook — `phase` enumerates fetch / index / done. */
  onProgress?: (evt: { phase: string; loaded?: number; total?: number }) => void;
}

/**
 * Clone a GitHub repository into a fresh git-backed workspace under OPFS.
 *
 * Layout: `<workspaceId>/files/...` (working tree) + `<workspaceId>/.git/...`
 * (object store). The same shape the existing `initRepo` + `pushBranch`
 * functions assume.
 *
 * Routes through the studio's CORS proxy (`cors.isomorphic-git.org`).
 * This is the GitHub-backed workspace path and runs unconditionally;
 * it is distinct from the curated-archive path in `model-loader.ts`.
 *
 * Clones at full depth (no `depth` limit) so that history-based
 * ahead/behind computation and push-back work correctly.
 */
export async function cloneRepository(fs: OpfsFs, workspaceId: string, options: CloneOptions): Promise<void> {
  await git.clone({
    fs: toGitFs(fs),
    http,
    dir: worktreeDir(workspaceId),
    gitdir: gitDir(workspaceId),
    url: options.remoteUrl,
    ref: options.ref ?? 'main',
    singleBranch: true,
    corsProxy: CORS_PROXY,
    onAuth: () => ({ username: options.user, password: options.token }),
    onProgress: options.onProgress
      ? (evt) =>
          options.onProgress!({
            phase: evt.phase,
            loaded: evt.loaded,
            total: evt.total
          })
      : undefined
  });
}

export interface PushOptions {
  remoteUrl: string;
  ref: string;
  token: string;
  user: string;
}

export async function pushBranch(fs: OpfsFs, workspaceId: string, options: PushOptions): Promise<void> {
  await git.push({
    fs: toGitFs(fs),
    http,
    dir: worktreeDir(workspaceId),
    gitdir: gitDir(workspaceId),
    url: options.remoteUrl,
    ref: options.ref,
    corsProxy: CORS_PROXY,
    onAuth: () => ({ username: options.user, password: options.token })
  });
}

async function listWorkingTree(fs: OpfsFs, workspaceId: string): Promise<string[]> {
  const out: string[] = [];
  await walk(fs, worktreeDir(workspaceId), '', out);
  return out;
}

async function walk(fs: OpfsFs, base: string, rel: string, out: string[]): Promise<void> {
  const fullPath = rel ? `${base}/${rel}` : base;
  // Resolve to the raw promise surface (supports both OpfsFs and InMemoryFs shapes).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: {
    readdir(p: string): Promise<string[]>;
    stat(p: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
  } = (fs as any).promises ?? fs;
  let names: string[];
  try {
    names = await raw.readdir(fullPath);
  } catch (err) {
    // A working-tree dir we can't read is a real failure — silently
    // dropping it would mean `git status` reports "all clean" and a
    // commit would push an incomplete tree. Surface it; let the caller
    // decide whether to abort the commit/push or continue with the
    // partial set.
    // eslint-disable-next-line no-console
    console.error(`[git-backing] walk: readdir(${fullPath}) failed; tree may be incomplete`, err);
    useOutputStore
      .getState()
      .addLine(
        fmtLine(
          'git',
          `working tree scan failed at "${fullPath}", commit may be incomplete`,
          err instanceof Error ? err.message : String(err)
        ),
        'error',
        {
          op: 'git',
          subject: fullPath
        }
      );
    return;
  }
  for (const name of names) {
    const childRel = rel ? `${rel}/${name}` : name;
    let stat;
    try {
      stat = await raw.stat(`${base}/${childRel}`);
    } catch (err) {
      // Race with a concurrent delete — entry vanished between readdir
      // and stat. Skip but log so a real bug isn't masked.
      // eslint-disable-next-line no-console
      console.warn(`[git-backing] walk: stat(${base}/${childRel}) failed; skipping`, err);
      continue;
    }
    if (stat.isFile()) {
      // Plain relative path — the working-tree root is /<id>/files, so
      // isomorphic-git sees the file at `childRel` directly.
      out.push(childRel);
    } else if (stat.isDirectory()) {
      await walk(fs, base, childRel, out);
    }
  }
}
