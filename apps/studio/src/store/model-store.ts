// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Zustand store for managing loaded reference models.
 * Supports multiple simultaneous models with progress tracking.
 * @see specs/008-core-editor-features/contracts/model-loader-api.md
 */

import { create } from 'zustand';
import type { ModelSource, LoadProgress, LoadedModel, ModelLoadErrorCode, CachedFile } from '../types/model-types.js';
import { loadModel } from '../services/model-loader.js';
import { getModelSource } from '../services/model-registry.js';
import { clearCache } from '../services/model-cache.js';
import { createTelemetryClient, type TelemetryClient } from '../services/telemetry.js';
import { config } from '../config.js';
import { CURATED_MODEL_IDS, type CuratedModelId } from '@rune-langium/curated-schema';
import { usePreviewStore } from './preview-store.js';
import { useCodegenStore } from './codegen-store.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface ModelLoadingState {
  source: ModelSource;
  progress: LoadProgress | null;
  abortController: AbortController;
}

interface ModelStoreState {
  /** Currently loaded models keyed by source ID. */
  models: Map<string, LoadedModel>;
  /** In-progress loading operations keyed by source ID. */
  loading: Map<string, ModelLoadingState>;
  /**
   * Errors from the most recent load attempt keyed by source ID.
   * `source` is retained so Retry can re-run loads for custom-URL sources
   * that aren't in the curated registry (FR-002 retry path).
   */
  errors: Map<string, { code: ModelLoadErrorCode; message: string; source: ModelSource }>;
}

interface ModelStoreActions {
  /** Start loading a model from a source. */
  load(source: ModelSource): Promise<void>;
  /** Cancel an in-progress load. */
  cancel(sourceId: string): void;
  /** Remove a loaded model from the store. */
  unload(sourceId: string): void;
  /** Clear the cached data for a model (or all models). */
  clearModelCache(sourceId?: string): Promise<void>;
  /** Clear error for a source. */
  dismissError(sourceId: string): void;
  /**
   * Update a loaded model's `files` array. Used post-/api/parse to surface
   * refOnly curated documents into `LoadedModel.files` so the ModelLoader
   * count + curated file picker reflect bundle contents — buildArchiveLoader
   * leaves files empty since the parsed payload only arrives via the routed
   * parse response.
   */
  setCuratedFiles(sourceId: string, files: CachedFile[]): void;
}

type ModelStore = ModelStoreState & ModelStoreActions;

// ────────────────────────────────────────────────────────────────────────────
// Curated metadata bridge (019 Phase 0)
//
// When a curated `ModelSource` has `archiveUrl` set, the store records
// bundle metadata ({ id, version }) WITHOUT fetching the archive. The actual
// corpus content is fetched server-to-server by /api/parse (Task 0.5a).
// The bridge is dependency-injected so tests can override the telemetry
// client without pulling in the real implementation.
//
// DEPRECATED 019: The previous archive-fetch path (loadCuratedModelImpl,
// OpfsFs OPFS walk, extractTarGz) has been removed. See git history for
// the pre-019 implementation.
// ────────────────────────────────────────────────────────────────────────────

interface ModelStoreDeps {
  telemetry: Pick<TelemetryClient, 'emit'>;
}

let deps: ModelStoreDeps = {
  telemetry: createTelemetryClient({
    endpoint: config.telemetryEndpoint,
    enabled: config.telemetryEnabled && !config.devMode,
    studioVersion: '0.1.0',
    uaClass: 'browser'
  })
};

/**
 * Override the model-store's dependencies. Intended for tests; in
 * production the defaults pull the real telemetry client.
 */
export function setModelStoreDeps(next: Partial<ModelStoreDeps>): void {
  deps = { ...deps, ...next };
}

const VALID_CURATED_IDS = new Set<string>(CURATED_MODEL_IDS);

/**
 * Build the `archiveLoader` callback the model-loader DI hook expects.
 * Returns `undefined` when no curated archive URL is set on the source
 * (non-curated sources are rejected by model-loader with NETWORK error).
 *
 * 019 Phase 0: The loader no longer fetches the .tar.gz archive or writes
 * to OPFS. It records { id, version: 'latest' } as bundle metadata only.
 * The corpus content is fetched server-to-server by /api/parse (Task 0.5a).
 * The files[] on the returned LoadedModel are intentionally empty; workspace.ts
 * mergeModelFiles inserts a synthetic bundle-marker so that
 * collectCuratedBundlesFromWorkspace can find the bundle id+version.
 */
function buildArchiveLoader():
  | ((
      source: ModelSource,
      opts: { signal?: AbortSignal; onProgress?: (p: LoadProgress) => void }
    ) => Promise<LoadedModel>)
  | undefined {
  return async (source, opts) => {
    if (!source.archiveUrl) {
      throw new Error(`buildArchiveLoader called without archiveUrl on ${source.id}`);
    }
    if (!VALID_CURATED_IDS.has(source.id)) {
      throw new Error(`source.id "${source.id}" is not a known curated model`);
    }

    opts.onProgress?.({ phase: 'fetching', current: 1, total: 1 });

    // 019 Phase 0: bundle content is fetched server-to-server by /api/parse.
    // We record metadata only — no archive download, no OPFS write.
    // The 'latest' version sentinel is understood by fetchCuratedBundle()
    // in functions/lib/curated-fetch.ts (which fetches the live latest archive).
    void deps.telemetry
      .emit({ event: 'curated_load_attempt', modelId: source.id as CuratedModelId })
      .catch(() => undefined);

    return {
      source,
      commitHash: 'latest',
      files: [],
      loadedAt: Date.now()
    };
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

export const useModelStore = create<ModelStore>((set, get) => ({
  models: new Map(),
  loading: new Map(),
  errors: new Map(),

  async load(source: ModelSource) {
    const { loading, errors } = get();

    // Don't start a duplicate load
    if (loading.has(source.id)) return;

    const abortController = new AbortController();

    // Clear any previous error
    const newErrors = new Map(errors);
    newErrors.delete(source.id);

    const newLoading = new Map(loading);
    newLoading.set(source.id, {
      source,
      progress: null,
      abortController
    });

    set({ loading: newLoading, errors: newErrors });

    try {
      const archiveLoader = source.archiveUrl ? buildArchiveLoader() : undefined;

      const model = await loadModel(source, {
        signal: abortController.signal,
        onProgress: (progress) => {
          const currentLoading = get().loading;
          const entry = currentLoading.get(source.id);
          if (entry) {
            const updated = new Map(currentLoading);
            updated.set(source.id, { ...entry, progress });
            set({ loading: updated });
          }
        },
        archiveLoader
      });

      // Success — add to loaded models, remove from loading
      const currentModels = new Map(get().models);
      currentModels.set(source.id, model);
      const currentLoading = new Map(get().loading);
      currentLoading.delete(source.id);

      set({ models: currentModels, loading: currentLoading });

      // Auto-load declared dependencies that aren't already loaded or loading.
      if (source.depends?.length) {
        for (const depId of source.depends) {
          if (get().models.has(depId) || get().loading.has(depId)) continue;
          const dep = getModelSource(depId);
          if (dep) void get().load(dep);
        }
      }
    } catch (e) {
      const currentLoading = new Map(get().loading);
      currentLoading.delete(source.id);

      const currentErrors = new Map(get().errors);
      const err = e as { code?: ModelLoadErrorCode; category?: string; message?: string };
      // CuratedLoadError exposes `.category` (FR-002 enum); ModelLoadError
      // uses `.code`. Either is forwarded into the store as the `code`
      // field — ModelLoader.tsx normalises via ErrorCategorySchema.
      currentErrors.set(source.id, {
        code: (err.code ?? err.category ?? 'NETWORK') as ModelLoadErrorCode,
        message: err.message ?? 'Unknown error',
        source
      });

      set({ loading: currentLoading, errors: currentErrors });
    }
  },

  cancel(sourceId: string) {
    const { loading } = get();
    const entry = loading.get(sourceId);
    if (entry) {
      entry.abortController.abort();
      const newLoading = new Map(loading);
      newLoading.delete(sourceId);
      set({ loading: newLoading });
    }
  },

  unload(sourceId: string) {
    const { models } = get();
    const newModels = new Map(models);
    newModels.delete(sourceId);
    set({ models: newModels });
    if (newModels.size === 0) {
      usePreviewStore.getState().resetPreviewState();
      useCodegenStore.getState().resetCodegenState();
    }
  },

  async clearModelCache(sourceId?: string) {
    await clearCache(sourceId);
  },

  dismissError(sourceId: string) {
    const { errors } = get();
    const newErrors = new Map(errors);
    newErrors.delete(sourceId);
    set({ errors: newErrors });
  },

  setCuratedFiles(sourceId: string, files: CachedFile[]) {
    const { models } = get();
    const existing = models.get(sourceId);
    if (!existing) return;
    // Cheap idempotence — skip the set when nothing meaningful changes.
    // parseWorkspaceFiles fires on every debounced edit; without a guard
    // every keystroke would re-publish identical files and re-trigger
    // downstream effects (model-watching useEffect → re-merge → another
    // /api/parse round-trip → loop). The check compares path + the
    // identity of `serializedModelJson` so a reparse with the same paths
    // but updated AST content (e.g. bundle version bump) re-publishes
    // and downstream consumers see fresh exports (Copilot review of
    // PR #163: shallow path-only check let stale exports survive).
    if (
      existing.files.length === files.length &&
      existing.files.every((f, i) => {
        const next = files[i];
        return next !== undefined && f.path === next.path && f.serializedModelJson === next.serializedModelJson;
      })
    ) {
      return;
    }
    // Defect A safety net: refuse to wipe a non-empty curated file list
    // with an empty one. The prod-smoke 2026-05-20 report described the
    // 4768-type explorer collapsing back to 22 base types during an edit
    // session — a partial /api/parse response (transient server error,
    // mid-flight reparse, race between the model-watching effect and the
    // debounced reparse) could surface `files: []` for a bundle that's
    // still very much loaded. The atomic re-merge in App.tsx's
    // model-watching useEffect re-emits the full bundle on the next pass,
    // so silently dropping the wipe is the correct conservative behaviour.
    // Callers that legitimately want to clear a curated bundle should
    // route through `unload(sourceId)` instead.
    if (files.length === 0 && existing.files.length > 0) {
      return;
    }
    const updated = new Map(models);
    updated.set(sourceId, { ...existing, files });
    set({ models: updated });
  }
}));

// ────────────────────────────────────────────────────────────────────────────
// Selectors
// ────────────────────────────────────────────────────────────────────────────

/** Get all loaded models as a flat array. */
export function selectLoadedModels(state: ModelStoreState): LoadedModel[] {
  return Array.from(state.models.values());
}

/** T012: Detect namespace conflicts across loaded models. */
export interface NamespaceConflict {
  namespace: string;
  sources: string[];
}

export function selectNamespaceConflicts(state: ModelStoreState): NamespaceConflict[] {
  const nsToSources = new Map<string, string[]>();
  for (const model of state.models.values()) {
    for (const file of model.files) {
      if (!file.namespace) continue;
      const sources = nsToSources.get(file.namespace) ?? [];
      if (!sources.includes(model.source.id)) {
        sources.push(model.source.id);
      }
      nsToSources.set(file.namespace, sources);
    }
  }
  const conflicts: NamespaceConflict[] = [];
  for (const [namespace, sources] of nsToSources) {
    if (sources.length > 1) {
      conflicts.push({ namespace, sources });
    }
  }
  return conflicts;
}

/** Check if any model is currently loading. */
export function selectIsAnyLoading(state: ModelStoreState): boolean {
  return state.loading.size > 0;
}

/** Get progress for a specific loading model. */
export function selectLoadProgress(state: ModelStoreState, sourceId: string): LoadProgress | null {
  return state.loading.get(sourceId)?.progress ?? null;
}
