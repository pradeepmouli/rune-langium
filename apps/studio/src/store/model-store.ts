// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Zustand store for managing loaded reference models.
 * Supports multiple simultaneous models with progress tracking.
 * @see specs/008-core-editor-features/contracts/model-loader-api.md
 */

import { create } from 'zustand';
import type {
  ModelSource,
  LoadProgress,
  LoadedModel,
  ModelLoadErrorCode
} from '../types/model-types.js';
import { loadModel } from '../services/model-loader.js';
import { clearCache } from '../services/model-cache.js';

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
}

type ModelStore = ModelStoreState & ModelStoreActions;

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
        }
      });

      // Success — add to loaded models, remove from loading
      const currentModels = new Map(get().models);
      currentModels.set(source.id, model);
      const currentLoading = new Map(get().loading);
      currentLoading.delete(source.id);

      set({ models: currentModels, loading: currentLoading });
    } catch (e) {
      const currentLoading = new Map(get().loading);
      currentLoading.delete(source.id);

      const currentErrors = new Map(get().errors);
      const err = e as { code?: ModelLoadErrorCode; message?: string };
      currentErrors.set(source.id, {
        code: err.code ?? 'NETWORK',
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
  },

  async clearModelCache(sourceId?: string) {
    await clearCache(sourceId);
  },

  dismissError(sourceId: string) {
    const { errors } = get();
    const newErrors = new Map(errors);
    newErrors.delete(sourceId);
    set({ errors: newErrors });
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
