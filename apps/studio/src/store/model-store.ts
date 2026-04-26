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
  ModelLoadErrorCode,
  CachedFile
} from '../types/model-types.js';
import { loadModel } from '../services/model-loader.js';
import { clearCache } from '../services/model-cache.js';
import { loadCuratedModel, type LoadCuratedInput } from '../services/curated-loader.js';
import { OpfsFs } from '../opfs/opfs-fs.js';
import { createTelemetryClient, type TelemetryClient } from '../services/telemetry.js';
import { config } from '../config.js';
import { CURATED_MODEL_IDS } from '@rune-langium/curated-schema';

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
// Curated archive bridge (014/T014)
//
// When a curated `ModelSource` has `archiveUrl` set, route through the
// curated-mirror path (FR-001) instead of the legacy isomorphic-git proxy
// (FR-019). The bridge is dependency-injected so tests can mock the OPFS
// root, the telemetry client, and the loader itself.
// ────────────────────────────────────────────────────────────────────────────

interface ModelStoreDeps {
  /** Lazy OPFS root accessor — `navigator.storage.getDirectory()` by default. */
  getOpfsRoot: () => Promise<FileSystemDirectoryHandle>;
  telemetry: Pick<TelemetryClient, 'emit'>;
  /** Override the curated loader (tests inject a mock). */
  loadCuratedModelImpl: typeof loadCuratedModel;
}

let deps: ModelStoreDeps = {
  getOpfsRoot: async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      throw new Error('OPFS is not available in this environment');
    }
    return navigator.storage.getDirectory();
  },
  telemetry: createTelemetryClient({
    endpoint: config.telemetryEndpoint,
    enabled: !config.devMode,
    studioVersion: '0.1.0',
    uaClass: 'browser'
  }),
  loadCuratedModelImpl: loadCuratedModel
};

/**
 * Override the model-store's curated dependencies. Intended for tests; in
 * production the defaults pull the real OPFS root and telemetry client.
 */
export function setModelStoreDeps(next: Partial<ModelStoreDeps>): void {
  deps = { ...deps, ...next };
}

const VALID_CURATED_IDS = new Set<string>(CURATED_MODEL_IDS);

/**
 * Build the `archiveLoader` callback the model-loader DI hook expects.
 * Returns `undefined` when no curated archive URL is set on the source —
 * that way the legacy git path stays in scope for custom-URL flows.
 */
function buildArchiveLoader(
  workspaceId: string
):
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

    const root = await deps.getOpfsRoot();
    const fs = new OpfsFs(root);
    const writeRoot = `/${workspaceId}/files/${source.id}`;

    // The curated-mirror Worker is hosted at `${origin}/curated/...`; we hit
    // the same origin in production so a same-site fetch handles CORS via
    // the deployed Worker. (If `archiveUrl` ever points elsewhere, the
    // mirror-base derivation has to track that — for now the single-mirror
    // assumption is exactly what 012's deploy laid down.)
    const archive = source.archiveUrl;
    const mirrorBase = archive.replace(/\/[^/]+\/latest\.tar\.gz$/, '');

    // Bridge curated-loader's progress callback (path, sizeBytes) to the
    // model-loader's LoadProgress shape.
    let written = 0;
    const onProgress: LoadCuratedInput['onProgress'] = (_path, _size) => {
      written += 1;
      opts.onProgress?.({ phase: 'parsing', current: written, total: written });
    };

    opts.onProgress?.({ phase: 'fetching', current: 0, total: 1 });
    const result = await deps.loadCuratedModelImpl({
      modelId: source.id as LoadCuratedInput['modelId'],
      mirrorBase,
      fs,
      writeRoot,
      telemetry: deps.telemetry,
      signal: opts.signal,
      onProgress
    });
    opts.onProgress?.({ phase: 'fetching', current: 1, total: 1 });

    // Walk OPFS and harvest .rosetta files into the LoadedModel shape that
    // the App-side merge code expects.
    const files = await collectRosettaFiles(fs, writeRoot);
    if (files.length === 0) {
      throw new Error(`curated archive ${source.id}@${result.version} contained no .rosetta files`);
    }

    return {
      source,
      commitHash: result.version,
      files,
      loadedAt: Date.now()
    };
  };
}

async function collectRosettaFiles(fs: OpfsFs, root: string): Promise<CachedFile[]> {
  const out: CachedFile[] = [];
  await walk(fs, root, '', out);
  return out;
}

async function walk(fs: OpfsFs, root: string, rel: string, out: CachedFile[]): Promise<void> {
  const dirPath = rel ? `${root}/${rel}` : root;
  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry}` : entry;
    const childPath = `${root}/${childRel}`;
    let stat;
    try {
      stat = await fs.stat(childPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      await walk(fs, root, childRel, out);
    } else if (entry.endsWith('.rosetta')) {
      const content = (await fs.readFile(childPath, 'utf8')) as string;
      out.push({
        path: childRel,
        content,
        namespace: extractNamespace(content)
      });
    }
  }
}

function extractNamespace(content: string): string {
  const m = content.match(/^\s*namespace\s+([\w.]+)/m);
  return m?.[1] ?? '';
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-session workspace id used as the OPFS scope for curated unpacks.
 * `WorkspaceManager`-shaped restore is C4's job; for the curated load path
 * we just need a stable directory — Phase 5's restore work will replace
 * this with the actual active workspace id.
 */
const CURATED_SESSION_WS_ID = 'curated-session';

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
      const archiveLoader = source.archiveUrl
        ? buildArchiveLoader(CURATED_SESSION_WS_ID)
        : undefined;

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
    } catch (e) {
      const currentLoading = new Map(get().loading);
      currentLoading.delete(source.id);

      const currentErrors = new Map(get().errors);
      const err = e as { code?: ModelLoadErrorCode; category?: string; message?: string };
      // CuratedLoadError exposes `.category` (FR-002 enum); legacy git path
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
