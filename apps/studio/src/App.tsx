// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * App — Root component for Rune DSL Studio (T089, T028).
 *
 * Orchestrates file loading, parsing, the editor page,
 * and LSP client lifecycle.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import '@rune-langium/visual-editor/styles.css';
import type { RosettaModel } from '@rune-langium/core';
import { FileLoader } from './components/FileLoader.js';
import { ModelLoader } from './components/ModelLoader.js';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher.js';
import { EditorPage } from './pages/EditorPage.js';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import type { WorkspaceFile } from './services/workspace.js';
import { parseWorkspaceFiles, mergeModelFiles, BUNDLE_MARKER_SUFFIX } from './services/workspace.js';
import { useModelStore } from './store/model-store.js';
import { getModelSource } from './services/model-registry.js';
import type { LoadedModel } from './types/model-types.js';
import { createLspClientService, type LspClientService } from './services/lsp-client.js';
import { createTransportProvider, type TransportState } from './services/transport-provider.js';
import { BASE_TYPE_FILES } from './resources/base-types.js';
import { config, studioConfig } from './config.js';
import * as persistence from './workspace/persistence.js';
import type { CuratedModelBinding, WorkspaceRecord } from './workspace/persistence.js';
import { LAYOUT_SCHEMA_VERSION } from './shell/layout-factory.js';
import { deleteWorkspaceFiles, loadWorkspaceFiles, saveWorkspaceFiles } from './workspace/workspace-files.js';
import { WorkspaceManager } from './workspace/workspace-manager.js';
import { StudioToastProvider, useStudioToast } from './components/StudioToastProvider.js';
import './test-api.js';
import { setRuneStudioTestApi } from './test-api.js';

/**
 * Mount-time workspace boot state machine (T028 / 014-US2).
 *
 *   checking   → initial; we are calling listRecents() / loadWorkspace()
 *   restoring  → a recent workspace was found; about to surface it
 *   start      → no recent (or restore failed) → show the empty start page
 *   restored   → a workspace was restored — body[data-workspace-active=true]
 */
type BootState = 'checking' | 'restoring' | 'start' | 'restored';

const STUDIO_VERSION = '0.1.0';

function makeWorkspaceId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Per-tab opaque ID used as the LSP Durable Object identity (019 Phase 2).
 *
 * The DO is keyed by this value, and it stores per-document state (`docs:<uri>`,
 * shutdown handling, etc.) under that key. Until the active-workspace identifier
 * is properly threaded through to `createTransportProvider`, this avoids the
 * worst case where every browser tab/user routes to the same fixed
 * DEFAULT_WORKSPACE_ID DO and stomps on each other's LSP documents.
 *
 * Stored in sessionStorage so a tab refresh keeps the same DO (preserving open
 * documents across refresh) while different tabs / windows / users get
 * isolated instances.
 *
 * The session-mint endpoint (`/api/lsp/session`) validates workspaceId
 * against a strict 26-char Crockford-base32 ULID regex, so this MUST emit a
 * value matching `^[0-9A-HJKMNP-TV-Z]{26}$`. crypto.randomUUID() would
 * produce a hyphenated lowercase UUID and fail that check with a 400
 * schema_violation.
 */
const LSP_SESSION_ID_KEY = 'rune-studio:lsp-session-id';
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function makeLspSessionUlid(): string {
  // 10-char time component + 16-char random component = 26 chars.
  // Not monotonic across calls — single ULID per tab is fine for DO routing.
  let time = '';
  let now = Date.now();
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD_BASE32[now & 31] + time;
    now = Math.floor(now / 32);
  }
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  let randPart = '';
  for (const b of rand) randPart += CROCKFORD_BASE32[b & 31];
  return time + randPart;
}
function getLspSessionId(): string {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return makeLspSessionUlid();
  }
  const existing = window.sessionStorage.getItem(LSP_SESSION_ID_KEY);
  if (existing && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(existing)) return existing;
  const fresh = makeLspSessionUlid();
  try {
    window.sessionStorage.setItem(LSP_SESSION_ID_KEY, fresh);
  } catch {
    // sessionStorage may throw under privacy modes; non-fatal — the caller
    // still gets a unique-for-this-call id, it just won't persist across
    // reloads. The DO will be isolated per-mount instead of per-tab.
  }
  return fresh;
}

/**
 * Project the in-memory `loadedModels` map into the persistable
 * `CuratedModelBinding[]` shape stored on `WorkspaceRecord.curatedModels`.
 *
 * Only curated bundles (sources with an `archiveUrl`) round-trip — the
 * custom-URL / git-clone path doesn't have a stable identity to re-load
 * on restore, so persisting it would surface stale entries we couldn't
 * resolve back to a registry source. See `CuratedModelBinding` for the
 * schema.
 *
 * Prod-smoke 2026-05-20 (Defect D1): the prior wiring loaded curated
 * bundles into the in-memory store but never wrote them back to IDB.
 * On refresh the workspace rehydrated with `curatedModels: []` and the
 * 4768-type explorer collapsed to the 22 built-in types because nothing
 * triggered a re-load.
 */
function deriveCuratedBindings(loadedModels: Map<string, LoadedModel>): CuratedModelBinding[] {
  const bindings: CuratedModelBinding[] = [];
  for (const model of loadedModels.values()) {
    if (!model.source.archiveUrl) continue;
    bindings.push({
      modelId: model.source.id,
      loadedVersion: model.commitHash || 'latest',
      loadedAt: new Date(model.loadedAt).toISOString(),
      updateAvailable: false
    });
  }
  // Stable order so the equality check below doesn't flap on Map iteration order.
  bindings.sort((a, b) => a.modelId.localeCompare(b.modelId));
  return bindings;
}

/**
 * Equality check for `CuratedModelBinding[]` that skips `loadedAt` (a
 * timestamp that drifts on every re-load even when the bundle identity
 * is unchanged). Used to short-circuit the persist effect so a tab-focus
 * re-render doesn't rewrite IDB on every render.
 */
function curatedBindingsEqual(a: CuratedModelBinding[], b: CuratedModelBinding[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.modelId !== right.modelId) return false;
    if (left.loadedVersion !== right.loadedVersion) return false;
    if (left.updateAvailable !== right.updateAvailable) return false;
  }
  return true;
}

function deriveWorkspaceName(files: readonly WorkspaceFile[]): string {
  const firstFile = files[0];
  if (!firstFile) {
    return 'Workspace';
  }

  const rootFolder = firstFile.path.split('/')[0];
  if (files.length > 1 && rootFolder && rootFolder !== firstFile.name) {
    return rootFolder;
  }

  return firstFile.name.replace(/\.rosetta$/i, '') || 'Workspace';
}

function AppContent() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [models, setModels] = useState<RosettaModel[]>([]);
  const [parsedModels, setParsedModels] = useState<Array<{ filePath: string; model: RosettaModel }>>([]);
  const [, setErrors] = useState<Map<string, string[]>>(new Map());
  const [deferredExports, setDeferredExports] = useState<
    Array<{ filePath: string; namespace: string; exports: Array<{ type: string; name: string }> }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [transportState, setTransportState] = useState<TransportState>({
    mode: 'disconnected',
    status: 'disconnected'
  });
  const [bootState, setBootState] = useState<BootState>('checking');
  const [restoredWorkspace, setRestoredWorkspace] = useState<WorkspaceRecord | null>(null);
  // Tracks the workspace.id for which the in-memory model-store has settled
  // (every curated binding declared on the workspace has finished its load
  // attempt — success or failure — since the most recent restoreWorkspace).
  // Until this matches the active workspace.id, the curated-binding persist
  // effect is a no-op so a switch A→B can't accidentally write A's bundles
  // (which still live in the global model-store during B's restore) into B's
  // record. See restoreWorkspace + the persist effect for the lifecycle.
  //
  // Stored in state (not a ref) because the persist effect needs to re-run
  // when sync completes — refs don't trigger re-renders, so the effect would
  // see stale values.
  const [curatedSyncedWorkspaceId, setCuratedSyncedWorkspaceId] = useState<string | null>(null);

  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef<ReturnType<typeof createTransportProvider> | null>(null);
  const reparseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceManagerRef = useRef<WorkspaceManager | null>(null);
  // Incremented before each model-merge parse; only the matching result is
  // applied, preventing stale async results from overwriting newer state.
  const modelParseTokenRef = useRef(0);
  // Tracks the latest files state so the model-loading effect can read it
  // synchronously without stale-closure issues. Starts as [] (matching the
  // `files` initial state) and is kept in sync via the effect below.
  const filesRef = useRef<WorkspaceFile[]>([]);
  // Tracks the latest loaded reference models so syncWorkspaceToEditor can
  // preserve them without calling useModelStore.getState() (which is not
  // available in the test mock of useModelStore).
  const loadedModelsRef = useRef<Map<string, LoadedModel>>(new Map());
  const { showToast } = useStudioToast();

  const reportWorkspaceError = useCallback((message: string, error: unknown) => {
    console.warn(`[App] ${message}:`, error);
    setWorkspaceError(message);
  }, []);

  useEffect(() => {
    if (!workspaceError) {
      return;
    }
    showToast({
      title: 'Workspace error',
      description: workspaceError,
      variant: 'destructive',
      duration: 5000
    });
  }, [showToast, workspaceError]);

  useEffect(() => {
    if (!workspaceNotice) {
      return;
    }
    showToast({
      title: 'Workspace notice',
      description: workspaceNotice,
      duration: 4000
    });
  }, [showToast, workspaceNotice]);

  const applyParseResult = useCallback((result: Awaited<ReturnType<typeof parseWorkspaceFiles>>) => {
    setModels(result.models);
    setParsedModels(result.parsedModels);
    setErrors(result.errors);
    setWorkspaceNotice(result.parseMode === 'main-thread-fallback' ? (result.fallbackMessage ?? null) : null);
    // Store deferred corpus types — they'll be registered in the editor
    // store by the EditorPage effect that watches models + deferredExports.
    setDeferredExports(result.deferredExports ?? []);
    // Surface curated bundle contents into the model-store so ModelLoader's
    // "(N files)" badge + the curated file picker reflect what /api/parse
    // hydrated. The routed parse path is the only place the studio learns
    // which docs belong to each curated bundle (the curated-loader stays
    // metadata-only by design — see model-store.buildArchiveLoader).
    if (result.curatedRefOnlyFiles) {
      const setCuratedFiles = useModelStore.getState().setCuratedFiles;
      for (const [bundleId, files] of Object.entries(result.curatedRefOnlyFiles)) {
        setCuratedFiles(bundleId, files);
      }
    }
  }, []);

  const syncWorkspaceToEditor = useCallback(
    async (workspaceFiles: WorkspaceFile[]) => {
      setLoading(true);
      try {
        // Start with the built-in base types and the user's workspace files.
        let mergedFiles: WorkspaceFile[] = [...BASE_TYPE_FILES.map((file) => ({ ...file })), ...workspaceFiles];
        // Preserve any reference model files that are already loaded so that
        // switching/restoring a workspace doesn't silently drop them.
        for (const model of loadedModelsRef.current.values()) {
          mergedFiles = mergeModelFiles(mergedFiles, model);
        }
        setFiles(mergedFiles);
        // 019: filter synthetic bundle-marker files so the LSP doesn't receive
        // placeholder entries with empty content (bundle content arrives via /api/parse).
        lspClientRef.current?.syncWorkspaceFiles(
          mergedFiles.filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly)
        );

        const result = await parseWorkspaceFiles(mergedFiles);
        applyParseResult(result);
        setWorkspaceError(null);
      } finally {
        setLoading(false);
      }
    },
    [applyParseResult]
  );

  const createWorkspaceRecord = useCallback(async (name: string): Promise<WorkspaceRecord> => {
    const now = new Date().toISOString();
    // Auto-suffix the name when an existing workspace already claims it
    // (Defect D2 / prod-smoke 2026-05-20): the switcher / recents list
    // surfaced two identical `untitled BROWSER` entries with no way to
    // distinguish which was which. Disambiguate at creation time so every
    // workspace record carries a unique label.
    const recents = await persistence.listRecents().catch(() => [] as Awaited<ReturnType<typeof persistence.listRecents>>);
    const takenNames = new Set(recents.map((r) => r.name));
    let uniqueName = name;
    if (takenNames.has(uniqueName)) {
      let suffix = 2;
      while (takenNames.has(`${name} (${suffix})`)) suffix += 1;
      uniqueName = `${name} (${suffix})`;
    }
    const workspace: WorkspaceRecord = {
      id: makeWorkspaceId(),
      name: uniqueName,
      kind: 'browser-only',
      createdAt: now,
      lastOpenedAt: now,
      layout: {
        version: LAYOUT_SCHEMA_VERSION,
        writtenBy: STUDIO_VERSION,
        dockview: null
      },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 1
    };

    await saveWorkspaceFiles(workspace.id, []);
    await persistence.saveWorkspace(workspace);
    return workspace;
  }, []);

  // Capture the workspace ID active when `restoreWorkspace` is called so the
  // eviction step inside it knows whether we're cold-starting (no prior) or
  // switching (prior workspace differs). The ref pattern avoids stale-closure
  // issues that would dog a useCallback-captured `restoredWorkspace`.
  const restoredWorkspaceRef = useRef<WorkspaceRecord | null>(null);
  useEffect(() => {
    restoredWorkspaceRef.current = restoredWorkspace;
  }, [restoredWorkspace]);

  const restoreWorkspace = useCallback(
    async (workspace: WorkspaceRecord): Promise<boolean> => {
      const previousWorkspaceId = restoredWorkspaceRef.current?.id ?? null;
      const restoredFiles = await loadWorkspaceFiles(workspace.id);
      if (restoredFiles.length === 0) {
        // Defect D3: switching to an OPFS-empty workspace left the previous
        // workspace's `files`/`models` state in place. The App then matched
        // `bootState === 'start' && userFiles.length > 0` and re-mounted
        // EditorPage with the stale untitled.rosetta tab — a phantom file
        // that didn't exist in OPFS for the workspace the user just opened.
        // Clear the carry-over state so the start page renders cleanly.
        setRestoredWorkspace(null);
        setFiles([]);
        setModels([]);
        setParsedModels([]);
        setErrors(new Map());
        setDeferredExports([]);
        setCuratedSyncedWorkspaceId(null);
        return false;
      }

      const nextWorkspace = {
        ...workspace,
        lastOpenedAt: new Date().toISOString()
      };
      await persistence.saveWorkspace(nextWorkspace);
      // Mark curated-bindings sync as "pending for this workspace" BEFORE
      // updating restoredWorkspace, so the persist effect sees a non-matching
      // synced id on its first run after the switch and bails out. Without
      // this gate, persisting fires immediately with whatever is currently
      // in the global model-store — which during an A→B switch still holds
      // A's bundles, overwriting B's saved curatedModels with stale state
      // (Codex P1, PR #220).
      setCuratedSyncedWorkspaceId(null);
      setRestoredWorkspace(nextWorkspace);
      try {
        // On a workspace SWITCH (previous workspace exists and differs from
        // the destination), evict any bundles from the global model-store
        // that aren't declared by the destination workspace. Without this
        // step the model-store accumulates bundles across switches: opening
        // A (curated: [cdm]) and then B (curated: [fpml]) would leave [cdm,
        // fpml] in the store, and the persist effect would write `[cdm,
        // fpml]` back to B's record — silently inheriting A's bindings.
        //
        // The persist-gate (`curatedSyncedWorkspaceId`) alone isn't enough:
        // it stops the persist effect from firing too early, but once it
        // opens with stale bundles still in the store, the derived set is
        // still polluted. Eviction makes the store a faithful projection of
        // the destination workspace's declared bindings before the gate is
        // opened.
        //
        // We intentionally SKIP eviction on cold-start restore (no prior
        // workspace) because at that point the model-store's contents
        // reflect bundles the USER loaded since mount — they belong to
        // *this* workspace and should be persisted into its record, not
        // discarded. The D1 fix (persistence test) relies on that path.
        const isSwitch = previousWorkspaceId !== null && previousWorkspaceId !== workspace.id;
        if (isSwitch) {
          const declaredIds = new Set((workspace.curatedModels ?? []).map((b) => b.modelId));
          let currentModelIds: string[] = [];
          try {
            currentModelIds = Array.from(useModelStore.getState().models.keys());
          } catch {
            /* mocked store without getState — treat as empty (nothing to evict). */
          }
          const toEvict = currentModelIds.filter((id) => !declaredIds.has(id));
          if (toEvict.length > 0) {
            const storeUnload = useModelStore.getState().unload;
            for (const id of toEvict) {
              storeUnload(id);
            }
          }
        }

        await syncWorkspaceToEditor(restoredFiles);

        // Replay any curated bundles bound to this workspace (D1 fix). Without
        // this, refresh / switch-workspace would drop CDM/FpML/etc. because
        // the in-memory model-store starts empty on every mount.
        //
        // We schedule the loads in parallel and await them all here so the
        // sync-settled flag flips only after the in-memory store reflects
        // the workspace's declared bindings. `load(source)` resolves on both
        // success and failure (errors land in the store's `errors` map), so
        // a single slow / failing archive can't pin the flag at `null`
        // forever. Loads still run in parallel — total cost is bounded by
        // the slowest load, not the sum.
        //
        // `useModelStore.getState()` is gated on `declared.length > 0` so
        // tests that mock `useModelStore` as a bare hook (without a `.getState`
        // method) — which is fine when the workspace has no curated bindings —
        // continue to work unchanged. The pre-existing wiring did the same.
        const declared = workspace.curatedModels ?? [];
        if (declared.length > 0) {
          const modelStoreLoad = useModelStore.getState().load;
          const loadPromises: Promise<void>[] = [];
          for (const binding of declared) {
            const source = getModelSource(binding.modelId);
            if (!source) continue;
            loadPromises.push(modelStoreLoad(source));
          }
          if (loadPromises.length > 0) {
            // Don't surface errors here — each failed load already records its
            // error in the model-store and the UI shows it via ModelLoader.
            await Promise.allSettled(loadPromises);
          }
        }
      } finally {
        // Flip the gate even if `syncWorkspaceToEditor` or a curated load
        // threw — `restoredWorkspace` was already set above, and the persist
        // effect needs the gate to open so any genuinely loaded bundles
        // (including those that succeeded before the throw) reach IDB. Parse
        // errors live in a separate channel (`reportWorkspaceError`) and
        // don't invalidate the curated-binding snapshot. Without the
        // try/finally a parse failure during the very first restore would
        // strand the gate closed for the remainder of the session.
        setCuratedSyncedWorkspaceId(nextWorkspace.id);
      }
      return true;
    },
    [syncWorkspaceToEditor]
  );

  // Restore the most recently opened workspace on mount when its metadata and
  // saved files are still available; otherwise fall back to the start page.
  useEffect(() => {
    let cancelled = false;
    (async function bootRestore() {
      try {
        const recents = await persistence.listRecents();
        if (cancelled) return;
        if (recents.length === 0) {
          setBootState('start');
          return;
        }
        const top = recents[0]!;
        const ws = await persistence.loadWorkspace(top.id);
        if (cancelled) return;
        if (!ws) {
          setBootState('start');
          return;
        }
        setBootState('restoring');
        const restored = await restoreWorkspace(ws);
        if (!restored) {
          setBootState('start');
          return;
        }
        setBootState('restored');
      } catch (err) {
        if (cancelled) return;
        reportWorkspaceError('Workspace restore failed; showing the start page instead', err);
        setBootState('start');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportWorkspaceError, restoreWorkspace]);

  // Tag the body so the dock chrome / e2e selectors can detect that an
  // editor is mounted (T028 contract). Cleared on unmount so the next
  // test case starts clean.
  useEffect(() => {
    document.body.setAttribute('data-studio-app', 'true');
    return () => {
      document.body.removeAttribute('data-studio-app');
    };
  }, []);

  // Theme — defaults to Daikonic. Override via ?theme=<name> query param
  // or localStorage. Use ?theme=default to revert to Refactory Dark.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryTheme = params.get('theme');
    const stored = window.localStorage.getItem('rune-studio:theme');
    const theme = queryTheme ?? stored ?? 'daikonic';
    if (queryTheme) window.localStorage.setItem('rune-studio:theme', queryTheme);
    if (theme && theme !== 'default') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, []);

  // Keep filesRef in sync so the model-loading effect below can read the
  // current file list without stale-closure issues.
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Keep loadedModelsRef in sync so syncWorkspaceToEditor can read it
  // without needing useModelStore.getState() (unavailable in tests).
  const loadedModels = useModelStore((s) => s.models);
  useEffect(() => {
    loadedModelsRef.current = loadedModels;
  }, [loadedModels]);

  // Persist curated-bundle bindings whenever the active workspace has one
  // and the in-memory set changes. Without this, a refresh / switch / close
  // path rehydrates the workspace from IDB with `curatedModels: []` and the
  // explorer collapses from N curated namespaces to just the built-in 22
  // types (D1). The equality guard short-circuits the IDB write when the
  // binding identity is unchanged so a per-keystroke re-render doesn't
  // churn IndexedDB. Equality skips `loadedAt` because timestamps would
  // flap every load even when the bundle id+version is identical.
  //
  // Codex P1 (PR #220): the effect MUST wait for workspace-specific model
  // sync to complete before writing. During a switch A → B, the global
  // model-store still holds A's bundles for the brief window between
  // `setRestoredWorkspace(B)` and the completion of B's curated reloads.
  // Without `curatedSyncedWorkspaceId === restoredWorkspace.id`, the
  // first effect run after the switch would derive A's bundles, compare
  // against B's declared set, and overwrite B's record with stale A data.
  // `restoreWorkspace` flips the synced id ONLY after Promise.allSettled
  // over the declared loads, so by the time this gate opens the model-
  // store is a faithful projection of B's declared bindings.
  useEffect(() => {
    if (!restoredWorkspace) return;
    if (curatedSyncedWorkspaceId !== restoredWorkspace.id) return;
    const nextBindings = deriveCuratedBindings(loadedModels);
    const prevBindings = restoredWorkspace.curatedModels ?? [];
    if (curatedBindingsEqual(prevBindings, nextBindings)) return;
    const nextWorkspace = { ...restoredWorkspace, curatedModels: nextBindings } as WorkspaceRecord;
    void persistence.saveWorkspace(nextWorkspace).catch((err) => {
      reportWorkspaceError('Failed to save curated bundle bindings to browser storage', err);
    });
    setRestoredWorkspace(nextWorkspace);
  }, [curatedSyncedWorkspaceId, loadedModels, reportWorkspaceError, restoredWorkspace]);

  useEffect(() => {
    if (bootState === 'restored') {
      document.body.setAttribute('data-workspace-active', 'true');
      return () => {
        document.body.removeAttribute('data-workspace-active');
      };
    }
    return undefined;
  }, [bootState]);

  // Cleanup reparse timer on unmount
  useEffect(() => {
    return () => {
      if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);
    };
  }, []);

  // Initialise LSP on mount
  useEffect(() => {
    if (!config.lspEnabled) {
      setTransportState({
        mode: 'disconnected',
        status: 'disconnected'
      });
      providerRef.current = null;
      lspClientRef.current = null;
      return undefined;
    }

    // Tag the LSP Durable Object with a per-tab session id so multi-tenancy
    // works (without this, every studio tab/user routed to the same DO and
    // shared its docs:<uri> state).
    const provider = createTransportProvider({ workspaceId: getLspSessionId() });
    providerRef.current = provider;

    const unsub = provider.onStateChange((state) => {
      setTransportState(state);
    });

    const client = createLspClientService({ transportProvider: provider });
    lspClientRef.current = client;

    client.connect().catch((err) => {
      console.error('[App] LSP connect failed:', err);
    });

    return () => {
      unsub();
      client.dispose();
      provider.dispose();
    };
  }, []);

  const handleFilesLoaded = useCallback(
    async (loadedFiles: WorkspaceFile[]) => {
      let workspace = restoredWorkspace;
      if (!workspace) {
        workspace = await createWorkspaceRecord(deriveWorkspaceName(loadedFiles));
        setRestoredWorkspace(workspace);
        // Fresh workspace has no declared curated bindings, so curated
        // sync is trivially "settled" — opening the persist gate so any
        // bundles the user loads next get persisted. Without this the
        // user could load a curated bundle into a fresh workspace and
        // the bindings would never reach IDB because the gate would
        // stay closed (no restoreWorkspace call ever flipped it).
        setCuratedSyncedWorkspaceId(workspace.id);
      }

      await saveWorkspaceFiles(workspace.id, loadedFiles);
      await syncWorkspaceToEditor(loadedFiles);
    },
    [createWorkspaceRecord, restoredWorkspace, syncWorkspaceToEditor]
  );

  /**
   * Handle file content changes (e.g., from source editor edits).
   * Updates files immediately and debounce-reparses after 500ms idle.
   */
  const handleFilesChange = useCallback(
    (updatedFiles: WorkspaceFile[]) => {
      setFiles(updatedFiles);
      lspClientRef.current?.syncWorkspaceFiles(
        updatedFiles.filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly)
      );

      if (restoredWorkspace) {
        void saveWorkspaceFiles(restoredWorkspace.id, updatedFiles).catch((err) => {
          reportWorkspaceError('Failed to save workspace changes to browser storage; edits remain in memory', err);
        });
      }

      // Debounced reparse — wait for typing to settle
      if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);
      reparseTimerRef.current = setTimeout(async () => {
        try {
          const result = await parseWorkspaceFiles(updatedFiles);
          applyParseResult(result);
        } catch (error) {
          reportWorkspaceError('Failed to re-parse updated files; keeping the last valid graph', error);
        }
      }, 500);
    },
    [applyParseResult, reportWorkspaceError, restoredWorkspace]
  );

  const handleReconnect = useCallback(async () => {
    try {
      await lspClientRef.current?.reconnect();
    } catch (err) {
      console.error('[App] LSP reconnect failed:', err);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (restoredWorkspace) {
      void saveWorkspaceFiles(restoredWorkspace.id, []).catch((err) => {
        reportWorkspaceError('Failed to persist the cleared workspace state to browser storage', err);
      });
    }
    setFiles([]);
    setModels([]);
    setParsedModels([]);
    setErrors(new Map());
    // Return to the start page so the user can open or create a workspace.
    // Without this, bootState stays 'restored' and the "Workspace ready."
    // placeholder is shown with no way to load new files.
    setBootState('start');
    setRestoredWorkspace(null);
    setCuratedSyncedWorkspaceId(null);
    setWorkspaceError(null);
    setWorkspaceNotice(null);
  }, [reportWorkspaceError, restoredWorkspace]);

  /** Switch to a recent workspace from the start page list (T029). */
  const handleSwitchWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const ws = await persistence.loadWorkspace(workspaceId);
        if (!ws) {
          reportWorkspaceError('The selected workspace no longer exists in browser storage', workspaceId);
          return;
        }
        setBootState('restoring');
        const restored = await restoreWorkspace(ws);
        if (!restored) {
          setBootState('start');
          setWorkspaceError(null);
          setWorkspaceNotice(null);
          return;
        }
        setBootState('restored');
        setWorkspaceError(null);
        setWorkspaceNotice(null);
      } catch (err) {
        reportWorkspaceError('Failed to switch workspaces', err);
      }
    },
    [reportWorkspaceError, restoreWorkspace]
  );

  useEffect(() => {
    setRuneStudioTestApi((current) => ({
      ...current,
      replaceWorkspaceFiles: async (workspaceFiles: WorkspaceFile[]) => {
        if (restoredWorkspace) {
          await saveWorkspaceFiles(restoredWorkspace.id, workspaceFiles);
        }
        await syncWorkspaceToEditor(workspaceFiles);
      },
      switchWorkspace: handleSwitchWorkspace
    }));
    return () => {
      setRuneStudioTestApi((current) => {
        if (!current) {
          return current;
        }
        const next = { ...current };
        delete next.replaceWorkspaceFiles;
        delete next.switchWorkspace;
        return next;
      });
    };
  }, [handleSwitchWorkspace, restoredWorkspace, syncWorkspaceToEditor]);

  /** New-workspace affordance from the recents list — same path as FileLoader. */
  const handleCreateWorkspace = useCallback(() => {
    setBootState('start');
    setRestoredWorkspace(null);
    setCuratedSyncedWorkspaceId(null);
    setWorkspaceNotice(null);
  }, []);

  const getWorkspaceManager = useCallback(async (): Promise<WorkspaceManager> => {
    if (workspaceManagerRef.current) return workspaceManagerRef.current;
    const opfsRoot = await navigator.storage.getDirectory();
    workspaceManagerRef.current = new WorkspaceManager({
      opfsRoot,
      studioVersion: STUDIO_VERSION,
      tabId: `tab-${Date.now()}`
    });
    return workspaceManagerRef.current;
  }, []);

  const handleCreateGitBackedWorkspace = useCallback(
    async (input: { repoUrl: string; branch: string; user: string; token: string }) => {
      const wm = await getWorkspaceManager();
      const repoName =
        input.repoUrl
          .replace(/\.git$/, '')
          .split('/')
          .pop() ?? 'workspace';
      const ws = await wm.createGitBacked({
        name: repoName,
        repoUrl: input.repoUrl,
        branch: input.branch,
        user: input.user,
        token: input.token
      });
      return { id: ws.id };
    },
    [getWorkspaceManager]
  );

  const handleGitHubWorkspaceCreated = useCallback(
    async (workspaceId: string) => {
      try {
        const loadedFiles = await loadWorkspaceFiles(workspaceId);
        if (loadedFiles.length > 0) {
          const wsFiles: WorkspaceFile[] = loadedFiles.map((f) => ({
            name: f.path.split('/').pop() ?? f.path,
            path: f.path,
            content: f.content,
            dirty: false,
            readOnly: false
          }));
          handleFilesLoaded(wsFiles);
        }
      } catch (err) {
        reportWorkspaceError('Failed to load cloned workspace', err);
      }
    },
    [handleFilesLoaded, reportWorkspaceError]
  );

  /** Delete a recent workspace from the recents store (T029). */
  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        await persistence.deleteWorkspace(workspaceId);
        await deleteWorkspaceFiles(workspaceId);
        if (restoredWorkspace?.id === workspaceId) {
          setRestoredWorkspace(null);
          setCuratedSyncedWorkspaceId(null);
          setFiles([]);
          setModels([]);
          setParsedModels([]);
          setErrors(new Map());
          setBootState('start');
        }
        setWorkspaceError(null);
        setWorkspaceNotice(null);
      } catch (err) {
        reportWorkspaceError('Failed to delete the selected workspace', err);
      }
    },
    [reportWorkspaceError, restoredWorkspace]
  );

  // Merge reference model files into workspace when models change and re-parse
  // so the graph and explorer reflect the loaded reference types.
  useEffect(() => {
    const prev = filesRef.current;
    const hadModelFiles = prev.some((f) => f.path.startsWith('['));
    // Skip the no-op case: no models loaded and none to clean up.
    // When models are removed (size === 0 but hadModelFiles === true) we
    // still run so their read-only entries are stripped from the file set.
    if (loadedModels.size === 0 && !hadModelFiles) return;

    let merged = prev.filter((f) => !f.path.startsWith('['));
    for (const model of loadedModels.values()) {
      merged = mergeModelFiles(merged, model);
    }
    setFiles(merged);
    // 019: filter synthetic bundle-marker files so the LSP doesn't receive
    // placeholder entries with empty content (bundle content arrives via /api/parse).
    lspClientRef.current?.syncWorkspaceFiles(
      merged.filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly)
    );
    modelParseTokenRef.current += 1;
    const token = modelParseTokenRef.current;
    parseWorkspaceFiles(merged)
      .then((result) => {
        if (token !== modelParseTokenRef.current) return;
        applyParseResult(result);
      })
      .catch((err) => {
        reportWorkspaceError(
          'Failed to re-parse the workspace after loading reference models; keeping the last valid graph',
          err
        );
      });
  }, [applyParseResult, loadedModels, reportWorkspaceError]);

  const userFiles = files.filter((f) => !f.readOnly);
  const showEditorPage = useMemo(
    () =>
      (bootState === 'start' && !loading && userFiles.length > 0) || (bootState === 'restored' && userFiles.length > 0),
    [bootState, loading, userFiles.length]
  );

  return (
    <div className="studio-app flex flex-col h-full text-foreground bg-background">
      {/* Screen-reader + test accessible file count — always in DOM so the
       * App-restore test can confirm file loading without EditorPage mounted. */}
      {userFiles.length > 0 && (
        <span className="sr-only" role="status" aria-live="polite">
          {userFiles.length} file(s)
        </span>
      )}
      {/* Global header — hidden when EditorPage is active to avoid a
       * duplicate toolbar. The EditorPage toolbar hosts Close + workspace
       * name in that mode. */}
      {!showEditorPage && (
        <header className="glass-header flex items-center justify-between px-4 py-2 min-h-[44px]">
          <div className="studio-brand">
            <div className="studio-brand__mark">R</div>
            <span className="studio-brand__name">Rune Studio</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="studio-links" aria-label="Studio links">
              <a href={studioConfig.homeUrl}>Home</a>
              <a href={studioConfig.docsUrl}>Docs</a>
              <a href={studioConfig.githubUrl}>GitHub</a>
            </nav>
          </div>
        </header>
      )}

      <main className="flex-1 overflow-hidden relative">
        {(bootState === 'checking' || bootState === 'restoring') && (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-md"
            data-testid="boot-spinner"
          >
            <Spinner className="size-8 text-primary" />
            <p>{bootState === 'restoring' ? 'Restoring workspace…' : 'Loading…'}</p>
          </div>
        )}

        {bootState !== 'checking' && bootState !== 'restoring' && loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-md">
            <Spinner className="size-8 text-primary" />
            <p>Parsing files…</p>
          </div>
        )}

        {bootState === 'start' && !loading && userFiles.length === 0 && (
          // T057 (014/FR-028) — vertically centred at viewports ≥1280×800.
          // FileLoader handles its own centering inside; WorkspaceSwitcher
          // (recents) sits above the curated row per FR-011 / T029 with
          // `mt-8` spacing and no `border-t` divider, so the column reads
          // as one visually-balanced empty state rather than fenced-off
          // sections.
          <div className="flex flex-col items-center justify-center h-full px-8 py-12 gap-8">
            <FileLoader
              onFilesLoaded={handleFilesLoaded}
              existingFiles={files}
              createGitBackedWorkspace={handleCreateGitBackedWorkspace}
              onGitHubWorkspaceCreated={handleGitHubWorkspaceCreated}
            />
            <div className="w-full max-w-[560px] mt-8">
              <WorkspaceSwitcher
                onOpen={handleSwitchWorkspace}
                onCreate={handleCreateWorkspace}
                onDelete={handleDeleteWorkspace}
              />
            </div>
            <div className="w-full max-w-[560px]">
              <ModelLoader />
            </div>
          </div>
        )}

        {bootState === 'start' && !loading && userFiles.length > 0 && (
          <EditorPage
            models={models}
            parsedModels={parsedModels}
            deferredExports={deferredExports}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
            workspaceId={restoredWorkspace?.id ?? 'default'}
            workspaceKind={restoredWorkspace?.kind}
            workspaceName={restoredWorkspace?.name}
            fileCount={userFiles.length}
            onClose={handleReset}
            onSwitchWorkspace={handleSwitchWorkspace}
            onCreateWorkspace={handleCreateWorkspace}
          />
        )}

        {bootState === 'restored' && userFiles.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-md"
            data-testid="workspace-restored"
            aria-label={`Workspace ${restoredWorkspace?.name ?? ''} restored`}
          >
            <p className="text-2xl font-semibold text-foreground mb-1">{restoredWorkspace?.name ?? 'Workspace'}</p>
            <p>Workspace ready.</p>
          </div>
        )}

        {bootState === 'restored' && userFiles.length > 0 && (
          <EditorPage
            models={models}
            parsedModels={parsedModels}
            deferredExports={deferredExports}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
            workspaceId={restoredWorkspace?.id ?? 'default'}
            workspaceKind={restoredWorkspace?.kind}
            workspaceName={restoredWorkspace?.name}
            fileCount={userFiles.length}
            onClose={handleReset}
            onSwitchWorkspace={handleSwitchWorkspace}
            onCreateWorkspace={handleCreateWorkspace}
          />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <StudioToastProvider>
      <AppContent />
    </StudioToastProvider>
  );
}
