// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import http from 'isomorphic-git/http/web';
import {
  createGitSyncEngine,
  type GitSyncEngine,
  type ConflictPolicy,
  type SyncStatus
} from '@rune-langium/git-sync-engine';
import type { OpfsFs } from '../opfs/opfs-fs.js';
import type { GitBackingRecord } from '../workspace/persistence.js';
import { loadWorkspace, saveWorkspace } from '../workspace/persistence.js';
import { createInteractiveConflictPolicy, type InteractiveConflictPolicy } from './interactive-conflict-policy.js';
import { loadWorkspaceToken } from './github-auth.js';
import { loadGlobalGitHubToken } from './github-store.js';

/**
 * Resolve the git token for a workspace: use the per-workspace OPFS token
 * first; fall back to the globally-connected GitHub token; return '' if neither
 * is set.
 *
 * Fix D: treat empty/whitespace as absent — `??` would short-circuit on a
 * non-null empty string from an OPFS file that was written but left blank,
 * skipping a valid global token.
 */
export async function resolveGitToken(fs: OpfsFs, workspaceId: string): Promise<string> {
  const ws = (await loadWorkspaceToken(fs, workspaceId))?.trim();
  if (ws) return ws;
  const global = (await loadGlobalGitHubToken())?.trim();
  return global ?? '';
}

/** Map the engine's live phase to the persisted GitBackingRecord.syncState. */
export function phaseToSyncState(s: SyncStatus): GitBackingRecord['syncState'] {
  switch (s.phase) {
    case 'blocked':
      return s.conflictPaths !== undefined ? 'conflict' : 'diverged';
    case 'offline':
      return s.ahead > 0 ? 'ahead' : 'clean';
    case 'idle':
      return s.ahead > 0 ? 'ahead' : s.behind > 0 ? 'behind' : 'clean';
    default:
      return 'ahead'; // mid-sync (committing/fetching/merging/pushing)
  }
}

async function persistSyncState(workspaceId: string, s: SyncStatus): Promise<void> {
  const ws = await loadWorkspace(workspaceId);
  if (!ws || ws.kind !== 'git-backed') return;
  ws.gitBacking.syncState = phaseToSyncState(s);
  ws.gitBacking.lastSyncedSha = s.lastSyncedSha;
  await saveWorkspace(ws);
}

/** The authenticated git proxy lives behind the github-auth worker route. */
export function defaultGitProxyUrl(): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'https://www.daikonic.dev';
  return `${origin}/rune-studio/api/github-auth/git`;
}

const engines = new Map<string, GitSyncEngine>();
const policies = new Map<string, InteractiveConflictPolicy>();

/**
 * Pending subscribers that registered before the engine was created.
 * Drained into the real engine the moment getOrCreateSyncEngine creates it.
 */
const pendingEngineSubscribers = new Map<string, Set<(s: SyncStatus) => void>>();

/**
 * Tracks workspace IDs for which notifySyncOnSave was called before the
 * engine was created. Drained (single notifyDirty call) the moment
 * getOrCreateSyncEngine creates the engine.
 */
const pendingDirty = new Set<string>();

export interface SyncEngineInput {
  fs: OpfsFs;
  workspaceId: string;
  gitBacking: GitBackingRecord;
  /** @deprecated Pass the fs instead; the engine loads the token lazily on each
   *  isomorphic-git call via `onAuth`. Providing `token` here is still accepted
   *  for backward-compat with existing tests but is ignored at runtime. */
  token?: string;
  conflictPolicy?: ConflictPolicy;
  onState?: (s: ReturnType<GitSyncEngine['getState']>) => void;
  proxyUrl?: string;
}

export function getOrCreateSyncEngine(input: SyncEngineInput): GitSyncEngine {
  const existing = engines.get(input.workspaceId);
  if (existing) return existing;

  // If no conflictPolicy is provided, auto-create an interactive one so the
  // badge's onResolve can route through resolveConflict(). If a policy IS
  // provided (e.g. in tests), use it directly and don't overwrite the registry.
  let effectivePolicy: ConflictPolicy | undefined = input.conflictPolicy;
  if (!effectivePolicy) {
    const interactive = createInteractiveConflictPolicy();
    policies.set(input.workspaceId, interactive);
    effectivePolicy = interactive;
  }

  const workspaceId = input.workspaceId;
  const fs = input.fs;

  const engine = createGitSyncEngine({
    fs: fs as never,
    http,
    dir: `/${workspaceId}/files`,
    gitdir: `/${workspaceId}/.git`,
    remoteUrl: input.gitBacking.repoUrl,
    ref: input.gitBacking.branch,
    corsProxy: input.proxyUrl ?? defaultGitProxyUrl(),
    // Lazy token: load fresh from OPFS on every isomorphic-git auth call so a
    // rotated token is always used without recreating the engine.
    onAuth: async () => ({
      username: input.gitBacking.user,
      password: await resolveGitToken(fs, workspaceId)
    }),
    author: { name: input.gitBacking.user, email: `${input.gitBacking.user}@users.noreply.github.com` },
    conflictPolicy: effectivePolicy
  });
  if (input.onState) engine.subscribe(input.onState);
  // Always subscribe an internal handler that persists state only on terminal
  // phases (idle, blocked, offline) — avoids thrashing IDB on mid-sync emits.
  engine.subscribe((s) => {
    if (s.phase === 'idle' || s.phase === 'blocked' || s.phase === 'offline') {
      void persistSyncState(workspaceId, s);
    }
  });
  engines.set(workspaceId, engine);

  // Drain any subscribers that registered before the engine was created.
  const pending = pendingEngineSubscribers.get(workspaceId);
  if (pending) {
    for (const cb of pending) {
      engine.subscribe(cb);
      cb(engine.getState());
    }
    pending.clear();
    pendingEngineSubscribers.delete(workspaceId);
  }

  // Replay any saves that arrived before the engine was ready.
  if (pendingDirty.has(workspaceId)) {
    pendingDirty.delete(workspaceId);
    engine.notifyDirty();
  }

  return engine;
}

/**
 * Subscribe to engine state updates that survive late engine creation.
 *
 * - If the engine already exists: immediately calls `cb` with current state,
 *   then subscribes for future updates. Returns a live unsubscribe.
 * - If the engine does not exist yet: enqueues `cb` so it is attached
 *   (and called with initial state) the moment `getOrCreateSyncEngine` creates
 *   the engine. Returns an unsubscribe that removes `cb` from the queue — or,
 *   if it was already drained into a live engine, from the engine itself.
 *
 * Design: `cb` identity is used throughout (no wrapper). The drain path in
 * `getOrCreateSyncEngine` calls `engine.subscribe(cb)` directly, so the same
 * function pointer is registered. The returned unsubscribe checks whichever
 * state is current at the time it is called.
 */
export function subscribeToEngine(workspaceId: string, cb: (s: SyncStatus) => void): () => void {
  const engine = engines.get(workspaceId);
  if (engine) {
    cb(engine.getState());
    return engine.subscribe(cb);
  }

  // Engine not yet created — enqueue cb by its own identity.
  let set = pendingEngineSubscribers.get(workspaceId);
  if (!set) {
    set = new Set();
    pendingEngineSubscribers.set(workspaceId, set);
  }
  set.add(cb);

  return () => {
    const pending = pendingEngineSubscribers.get(workspaceId);
    if (pending?.has(cb)) {
      // Still in the queue — cb was never drained into the engine.
      pending.delete(cb);
      return;
    }
    // Already drained into the live engine — remove via unsubscribe.
    engines.get(workspaceId)?.unsubscribe(cb);
  };
}

export function disposeSyncEngine(workspaceId: string): void {
  engines.get(workspaceId)?.dispose();
  engines.delete(workspaceId);
  policies.delete(workspaceId);
  pendingEngineSubscribers.delete(workspaceId);
  pendingDirty.delete(workspaceId);
}

/**
 * Route a user conflict-resolution choice to the interactive ConflictPolicy
 * that was auto-created for this workspace by getOrCreateSyncEngine.
 * No-op if the workspace has no pending conflict or no interactive policy.
 */
export function resolveConflict(workspaceId: string, choice: 'keepMine' | 'takeRemote'): void {
  policies.get(workspaceId)?.resolve(choice);
}

export function getSyncEngine(workspaceId: string): GitSyncEngine | undefined {
  return engines.get(workspaceId);
}

/** Nudge the background sync engine after a save. No-op for non-git workspaces.
 *  If the engine is not yet created (async init still in progress), the dirty
 *  signal is queued and replayed the moment the engine is instantiated. */
export function notifySyncOnSave(workspaceId: string): void {
  const e = engines.get(workspaceId);
  if (e) {
    e.notifyDirty();
  } else {
    pendingDirty.add(workspaceId);
  }
}
