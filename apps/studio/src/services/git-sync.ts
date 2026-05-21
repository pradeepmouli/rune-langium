// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import http from 'isomorphic-git/http/web';
import { createGitSyncEngine, type GitSyncEngine, type ConflictPolicy } from '@rune-langium/git-sync-engine';
import type { OpfsFs } from '../opfs/opfs-fs.js';
import type { GitBackingRecord } from '../workspace/persistence.js';

/** The authenticated git proxy lives behind the github-auth worker route. */
export function defaultGitProxyUrl(): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://www.daikonic.dev';
  return `${origin}/rune-studio/api/github-auth/git`;
}

const engines = new Map<string, GitSyncEngine>();

export interface SyncEngineInput {
  fs: OpfsFs;
  workspaceId: string;
  gitBacking: GitBackingRecord;
  token: string;
  conflictPolicy?: ConflictPolicy;
  onState?: (s: ReturnType<GitSyncEngine['getState']>) => void;
  proxyUrl?: string;
}

export function getOrCreateSyncEngine(input: SyncEngineInput): GitSyncEngine {
  const existing = engines.get(input.workspaceId);
  if (existing) return existing;
  const engine = createGitSyncEngine({
    fs: input.fs as never,
    http,
    dir: `/${input.workspaceId}/files`,
    gitdir: `/${input.workspaceId}/.git`,
    remoteUrl: input.gitBacking.repoUrl,
    ref: input.gitBacking.branch,
    corsProxy: input.proxyUrl ?? defaultGitProxyUrl(),
    onAuth: () => ({ username: input.gitBacking.user, password: input.token }),
    author: { name: input.gitBacking.user, email: `${input.gitBacking.user}@users.noreply.github.com` },
    conflictPolicy: input.conflictPolicy
  });
  if (input.onState) engine.subscribe(input.onState);
  engines.set(input.workspaceId, engine);
  return engine;
}

export function disposeSyncEngine(workspaceId: string): void {
  engines.get(workspaceId)?.dispose();
  engines.delete(workspaceId);
}

export function getSyncEngine(workspaceId: string): GitSyncEngine | undefined {
  return engines.get(workspaceId);
}
