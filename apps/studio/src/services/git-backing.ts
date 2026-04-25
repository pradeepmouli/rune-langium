// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Git-backed workspace service. Drives `isomorphic-git` against `OpfsFs`
 * so commits live alongside files in the same OPFS tree.
 *
 * Layout per workspace:
 *   /<workspaceId>/files/...   working tree
 *   /<workspaceId>/.git/...    git object store
 *
 * Network ops (clone / fetch / pull / push) are exposed by separate
 * functions that the UI layer wires once the user has authenticated via
 * the device-flow path. They route through the same isomorphic-git CORS
 * proxy as the rest of the studio's git work.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import type { OpfsFs } from '../opfs/opfs-fs.js';

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

function repoDir(workspaceId: string): string {
  return `/${workspaceId}`;
}

export interface InitOptions {
  defaultBranch?: string;
}

export async function initRepo(
  fs: OpfsFs,
  workspaceId: string,
  options: InitOptions = {}
): Promise<void> {
  const dir = repoDir(workspaceId);
  await git.init({
    fs: gitFs(fs) as unknown as Parameters<typeof git.init>[0]['fs'],
    dir,
    defaultBranch: options.defaultBranch ?? 'main'
  });
}

export interface CommitOptions {
  message: string;
  authorName: string;
  authorEmail: string;
}

export async function stageAndCommit(
  fs: OpfsFs,
  workspaceId: string,
  options: CommitOptions
): Promise<string> {
  const dir = repoDir(workspaceId);
  const fsAdapter = gitFs(fs) as unknown as Parameters<typeof git.add>[0]['fs'];
  // Walk the working tree and stage every file under files/.
  const files = await listWorkingTree(fs, workspaceId);
  for (const f of files) {
    await git.add({ fs: fsAdapter, dir, filepath: f });
  }
  const sha = await git.commit({
    fs: fsAdapter,
    dir,
    message: options.message,
    author: { name: options.authorName, email: options.authorEmail }
  });
  return sha;
}

export async function detectSyncState(fs: OpfsFs, workspaceId: string): Promise<SyncState> {
  const dir = repoDir(workspaceId);
  const fsAdapter = gitFs(fs) as unknown as Parameters<typeof git.statusMatrix>[0]['fs'];
  const matrix = await git.statusMatrix({ fs: fsAdapter, dir });
  // Each row: [filepath, head, workdir, stage]. Anything where workdir != stage
  // or workdir != head is a local change → ahead.
  const dirty = matrix.some(
    ([_path, head, workdir, stage]) => head !== workdir || workdir !== stage
  );
  return dirty ? 'ahead' : 'clean';
}

export interface PushOptions {
  remoteUrl: string;
  ref: string;
  token: string;
  user: string;
}

export async function pushBranch(
  fs: OpfsFs,
  workspaceId: string,
  options: PushOptions
): Promise<void> {
  await git.push({
    fs: gitFs(fs) as unknown as Parameters<typeof git.push>[0]['fs'],
    http,
    dir: repoDir(workspaceId),
    url: options.remoteUrl,
    ref: options.ref,
    corsProxy: CORS_PROXY,
    onAuth: () => ({ username: options.user, password: options.token })
  });
}

async function listWorkingTree(fs: OpfsFs, workspaceId: string): Promise<string[]> {
  const out: string[] = [];
  await walk(fs, `/${workspaceId}/files`, '', out);
  return out;
}

async function walk(fs: OpfsFs, base: string, rel: string, out: string[]): Promise<void> {
  const fullPath = rel ? `${base}/${rel}` : base;
  let names: string[];
  try {
    names = await fs.readdir(fullPath);
  } catch (err) {
    // A working-tree dir we can't read is a real failure — silently
    // dropping it would mean `git status` reports "all clean" and a
    // commit would push an incomplete tree. Surface it; let the caller
    // decide whether to abort the commit/push or continue with the
    // partial set.
    // eslint-disable-next-line no-console
    console.error(`[git-backing] walk: readdir(${fullPath}) failed; tree may be incomplete`, err);
    return;
  }
  for (const name of names) {
    const childRel = rel ? `${rel}/${name}` : name;
    let stat;
    try {
      stat = await fs.stat(`${base}/${childRel}`);
    } catch (err) {
      // Race with a concurrent delete — entry vanished between readdir
      // and stat. Skip but log so a real bug isn't masked.
      // eslint-disable-next-line no-console
      console.warn(`[git-backing] walk: stat(${base}/${childRel}) failed; skipping`, err);
      continue;
    }
    if (stat.isFile()) {
      out.push(`files/${childRel}`);
    } else if (stat.isDirectory()) {
      await walk(fs, base, childRel, out);
    }
  }
}
