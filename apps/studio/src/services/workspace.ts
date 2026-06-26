// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Workspace service — manages multi-file loading, dirty tracking,
 * and cross-file resolution for the studio app (T083, T098, T100, T102).
 */

import { parse, parseWorkspace, createRuneDslServices, type RosettaModel } from '@rune-langium/core';
import { EmptyFileSystem } from 'langium';
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
import { CURATED_MODEL_IDS } from '@rune-langium/curated-schema';
import type { CachedFile } from '../types/model-types.js';
import type {
  WorkerRequest,
  ParseResponse,
  ParseWorkspaceResponse,
  LinkDocumentRequest,
  LinkDocumentResponse,
  HydrateRequest,
  HydrateResponse
} from '../workers/parser-worker.js';
import { isParseResponse, isParseWorkspaceResponse, isLinkDocumentResponse } from '../workers/parser-worker.js';
import { useCodegenStore } from '../store/codegen-store.js';
import { useOutputStore, fmtLine } from '../store/output-store.js';

/** Known curated bundle ids — guards deferredExports filePath prefixes so user
 *  files that happen to live under `${bundleId}/...` aren't mis-grouped. */
const CURATED_BUNDLE_IDS = new Set<string>(CURATED_MODEL_IDS);

export interface WorkspaceFile {
  name: string;
  path: string;
  content: string;
  dirty: boolean;
  /** When true, the file is a system/built-in file and cannot be edited. */
  readOnly?: boolean;
  /** Optional precomputed serialized Langium model JSON used by the parser worker. */
  serializedModelJson?: CuratedSerializedDocument['modelJson'];
  /**
   * Optional exports manifest for deferred deserialization (ADR 007 Phase 4).
   * When present alongside serializedModelJson, the parser worker registers
   * these symbols in the IndexManager without deserializing the full AST.
   */
  exports?: Array<{ type: string; name: string; path: string }>;
  /**
   * The curated bundle id this file belongs to (e.g. "cdm", "fpml").
   * Set by mergeModelFiles from LoadedModel.source.id. Used by
   * collectCuratedBundlesFromWorkspace to build the curatedBundles list for
   * the /api/parse router. Absent on user-authored files.
   */
  bundleId?: string;
  /**
   * The curated bundle version (commitHash / date stamp) for this file,
   * e.g. "2026-04-25". Set by mergeModelFiles from LoadedModel.commitHash.
   * Used alongside bundleId to form { id, version } entries for /api/parse.
   */
  bundleVersion?: string;
  /**
   * Reference-only file from a curated bundle: present in the file list so
   * counts + namespace listings reflect the bundle contents, but the source
   * text is not available client-side (the curated artifact is pre-parsed
   * and doesn't carry raw source). Distinct from `readOnly` (which only
   * forbids edits): a refOnly file has no source to display. UI handlers:
   * - SourceView click is a no-op (don't switch active source view).
   * - Inspector renders a "Reference Only" pill + disables editing.
   */
  refOnly?: boolean;
}

export interface WorkspaceLoadProgress {
  phase: 'reading' | 'syncing' | 'complete';
  loaded: number;
  total: number;
}

export interface WorkspaceState {
  files: WorkspaceFile[];
  models: RosettaModel[];
  parsedModels: ParsedWorkspaceModel[];
  errors: Map<string, string[]>;
  loading: boolean;
}

export interface ParsedWorkspaceModel {
  filePath: string;
  model: RosettaModel;
}

export type ParseMode = 'worker' | 'router' | 'main-thread-fallback';

export interface ParseFileResult {
  model: RosettaModel | null;
  errors: string[];
  parseMode: ParseMode;
  fallbackMessage?: string;
}

export interface ParseWorkspaceFilesResult {
  models: RosettaModel[];
  parsedModels: ParsedWorkspaceModel[];
  errors: Map<string, string[]>;
  parseMode: ParseMode;
  fallbackMessage?: string;
  /**
   * When the routed parse path succeeds, this carries the curated docs
   * grouped by bundleId so callers can populate LoadedModel.files in the
   * model-store with reference-only entries (path + serialized model,
   * empty content). Drives the studio file count + curated file picker.
   * Absent for main-thread fallback parses (curated source is unknown
   * client-side in that path).
   */
  curatedRefOnlyFiles?: Record<string, CachedFile[]>;
  deferredExports?: Array<{
    filePath: string;
    namespace: string;
    exports: Array<{ type: string; name: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Worker-based parsing (T098) — fallback to main thread if worker fails
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
let requestId = 0;
let workerInitError: Error | null = null;
const WORKER_FALLBACK_MESSAGE =
  'Parser worker unavailable — using in-browser parsing, which may feel slower on large workspaces.';

/** Used when the /api/parse router fails (network error, 5xx, etc.).  The
 *  parser worker is not involved in the workspace parse path; only the
 *  server-side Pages Function is unavailable. */
const ROUTER_FALLBACK_MESSAGE =
  'Server-side parsing unavailable — using in-browser parsing, which may feel slower on large workspaces.';

function formatWorkerFallbackMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${WORKER_FALLBACK_MESSAGE} (${detail})`;
}

function formatRouterFallbackMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${ROUTER_FALLBACK_MESSAGE} (${detail})`;
}

async function parseWorkspaceFilesOnMainThread(
  files: WorkspaceFile[],
  options: {
    parseMode: Extract<ParseMode, 'main-thread-fallback'>;
    fallbackMessage?: string;
  }
): Promise<ParseWorkspaceFilesResult> {
  // Defensive guard (layer 2): only pass files whose URI the in-browser Langium
  // can actually parse. The service registry is keyed on extension, and only
  // ".rosetta" is registered.  This single-condition filter is intentionally
  // coarse: curated entries (serializedModelJson set) are already stripped by
  // the router-failure catch before this function is called (layer 1), but
  // bundle-marker files (path ends with /.bundle-marker, yielding an empty
  // extension) are caught here.  The `.rosetta` suffix check is the safety net
  // for any other extensionless or non-rosetta URI that reaches this layer.
  const parseable = files.filter((f) => f.path.toLowerCase().endsWith('.rosetta'));

  const results = await parseWorkspace(
    parseable.map((file) => ({
      uri: file.path,
      content: file.content
    }))
  );
  const models: RosettaModel[] = [];
  const parsedModels: ParsedWorkspaceModel[] = [];
  const errors = new Map<string, string[]>();

  // Index results against `parseable` (NOT the original `files`) so indices align.
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const file = parseable[i]!;
    if (result.value) {
      models.push(result.value);
      parsedModels.push({ filePath: file.path, model: result.value });
    }
    const fileErrors = result.parserErrors.map((err) => err.message);
    if (fileErrors.length > 0) {
      errors.set(file.path, fileErrors);
    }
  }

  return {
    models,
    parsedModels,
    errors,
    parseMode: options.parseMode,
    fallbackMessage: options.fallbackMessage
  };
}

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/parser-worker.ts', import.meta.url), {
      type: 'module'
    });
    workerInitError = null;
    return worker;
  } catch (error) {
    // Worker not available (e.g., in test env or SSR)
    workerInitError = error instanceof Error ? error : new Error(String(error));
    return null;
  }
}

function resetWorkerState(nextError: Error): void {
  if (worker) {
    worker.terminate();
  }
  worker = null;
  workerInitError = nextError;
}

function workerRequest(msg: Extract<WorkerRequest, { type: 'parse' }>): Promise<ParseResponse>;
function workerRequest(msg: Extract<WorkerRequest, { type: 'parseWorkspace' }>): Promise<ParseWorkspaceResponse>;
function workerRequest(msg: LinkDocumentRequest): Promise<LinkDocumentResponse>;
function workerRequest(msg: HydrateRequest): Promise<HydrateResponse>;
function workerRequest(
  msg: WorkerRequest
): Promise<ParseResponse | ParseWorkspaceResponse | LinkDocumentResponse | HydrateResponse> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      reject(workerInitError ?? new Error('Worker not available'));
      return;
    }

    const id = msg.id;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const clearPendingTimeout = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };
    const cleanupListeners = () => {
      w.removeEventListener('error', errorHandler);
      w.removeEventListener('messageerror', messageErrorHandler);
      w.removeEventListener('message', handler);
    };
    const handler = (e: MessageEvent) => {
      if (e.data?.id === id) {
        clearPendingTimeout();
        cleanupListeners();
        if (msg.type === 'parse') {
          if (!isParseResponse(e.data)) {
            const error = new Error('Worker returned an invalid parse response');
            resetWorkerState(error);
            reject(error);
            return;
          }
          resolve(e.data);
          return;
        }
        if (msg.type === 'linkDocument') {
          if (!isLinkDocumentResponse(e.data)) {
            const error = new Error('Worker returned an invalid linkDocument response');
            resetWorkerState(error);
            reject(error);
            return;
          }
          resolve(e.data);
          return;
        }
        if (msg.type === 'hydrate') {
          // HydrateResponse: { type: 'hydrateResult', id, ok, error? }
          const data = e.data as HydrateResponse;
          if (data.type !== 'hydrateResult') {
            const error = new Error('Worker returned an invalid hydrate response');
            resetWorkerState(error);
            reject(error);
            return;
          }
          resolve(data);
          return;
        }
        if (!isParseWorkspaceResponse(e.data)) {
          const error = new Error('Worker returned an invalid workspace parse response');
          resetWorkerState(error);
          reject(error);
          return;
        }
        resolve(e.data);
      }
    };
    const errorHandler = (event: ErrorEvent) => {
      clearPendingTimeout();
      cleanupListeners();
      const error = new Error(event.message || 'Worker error');
      resetWorkerState(error);
      reject(error);
    };
    const messageErrorHandler = () => {
      clearPendingTimeout();
      cleanupListeners();
      const error = new Error('Worker message could not be deserialized');
      resetWorkerState(error);
      reject(error);
    };
    w.addEventListener('message', handler);
    w.addEventListener('error', errorHandler);
    w.addEventListener('messageerror', messageErrorHandler);
    try {
      w.postMessage(msg);
    } catch (error) {
      clearPendingTimeout();
      cleanupListeners();
      const workerError =
        error instanceof Error ? error : new Error(error ? String(error) : 'Worker postMessage failed');
      resetWorkerState(workerError);
      reject(workerError);
      return;
    }

    // Timeout after 30s
    timeoutId = setTimeout(() => {
      cleanupListeners();
      const error = new Error('Worker timeout');
      resetWorkerState(error);
      reject(error);
    }, 30000);
  });
}

/**
 * Parse a single .rosetta file and return the model.
 * Tries the web worker first; falls back to main-thread parsing.
 */
export async function parseFile(content: string, uri?: string): Promise<ParseFileResult> {
  // Try worker first (T098)
  try {
    const id = String(++requestId);
    const response = await workerRequest({
      type: 'parse',
      id,
      content,
      uri
    });
    return { model: response.model, errors: response.errors, parseMode: 'worker' };
  } catch (error) {
    // Fallback to main thread
    console.warn('[workspace] parseFile worker fallback:', error);
    useOutputStore.getState().addLine(fmtLine('parse', 'worker unavailable, using main thread'), 'warn');
  }

  // Main-thread fallback
  try {
    const result = await parse(content, uri);
    const errors: string[] = [];
    if (result.parserErrors && result.parserErrors.length > 0) {
      for (const err of result.parserErrors) {
        errors.push(err.message);
      }
    }
    return {
      model: result.value,
      errors,
      parseMode: 'main-thread-fallback',
      fallbackMessage: WORKER_FALLBACK_MESSAGE
    };
  } catch (e) {
    return {
      model: null,
      errors: [(e as Error).message],
      parseMode: 'main-thread-fallback',
      fallbackMessage: formatWorkerFallbackMessage(e)
    };
  }
}

/**
 * Walks the workspace's WorkspaceFile[] and collects unique curated bundle
 * metadata from files that carry bundleId + bundleVersion (set by
 * mergeModelFiles from LoadedModel.source.id and LoadedModel.commitHash).
 *
 * Returns deduped { id, version } entries suitable for the /api/parse
 * curatedBundles field (server fetches the corpus server-to-server).
 *
 * Design note: We read bundleId/bundleVersion from WorkspaceFile rather than
 * the model-store Zustand state so that parseWorkspaceFiles remains a pure
 * function that doesn't depend on the store. mergeModelFiles populates these
 * fields whenever it merges corpus files into the workspace.
 */
export function collectCuratedBundlesFromWorkspace(
  files: ReadonlyArray<WorkspaceFile>
): Array<{ id: string; version: string }> {
  const seen = new Map<string, string>(); // id → version
  for (const file of files) {
    if (file.bundleId && file.bundleVersion && !seen.has(file.bundleId)) {
      seen.set(file.bundleId, file.bundleVersion);
    }
  }
  return Array.from(seen.entries()).map(([id, version]) => ({ id, version }));
}

/**
 * Parse all files in the workspace and return models.
 *
 * Primary path (019 Phase 0): delegates to the /api/parse Pages Function via
 * `parseWorkspaceViaRouter`. Curated corpus files (readOnly, serializedModelJson
 * set) are NOT sent as file content — instead their bundle id+version are
 * collected and sent as `curatedBundles` so the server can fetch them
 * server-to-server. Only user-authored files (no serializedModelJson) are POSTed
 * as raw content.
 *
 * Fallback: if the router call fails (network error, 5xx, ok:false), the
 * function falls back to main-thread parsing via
 * `parseWorkspaceFilesOnMainThread` with the FULL WorkspaceFile[] (including
 * curated bundle entries) so the corpus isn't dropped on transient Pages
 * Function failures. The old browser-worker `parseWorkspace` path (T098)
 * is invoked through `parseWorkspaceFilesOnMainThread` and remains the
 * fallback-only code path.
 */
export async function parseWorkspaceFiles(
  files: WorkspaceFile[],
  options: { hydrateNamespaces?: string[] } = {}
): Promise<ParseWorkspaceFilesResult> {
  const wantsHydration = (options.hydrateNamespaces?.length ?? 0) > 0;
  if (files.length === 0 && !wantsHydration) {
    return { models: [], parsedModels: [], errors: new Map(), parseMode: 'router' };
  }

  // User files go as raw content; curated files become bundle metadata only
  // (via collectCuratedBundlesFromWorkspace below). A user file is one WITHOUT a
  // `bundleId` — that's the canonical marker every curated file carries. The
  // older `!serializedModelJson` proxy missed list-only deferredExports
  // namespaces (bundleId + refOnly, but NO serializedModelJson): those leaked
  // through and got POSTed to /api/parse as bogus files named
  // `[bundleId]/<namespace>`, which Langium rejects with "no services for the
  // extension '.'" → 500, collapsing the curated catalog to the user closure.
  const userFiles = files
    .filter((f) => !f.bundleId && !f.serializedModelJson && !f.refOnly)
    .map((f) => ({ name: f.path, content: f.content }));
  const curatedBundles = collectCuratedBundlesFromWorkspace(files);

  try {
    const response = await parseWorkspaceViaRouter(userFiles, {
      curatedBundles,
      hydrateNamespaces: options.hydrateNamespaces
    });
    const errMap = new Map<string, string[]>();
    for (const [k, v] of Object.entries(response.errors)) {
      errMap.set(k, v);
    }
    return {
      models: response.models,
      parsedModels: response.parsedModels,
      errors: errMap,
      parseMode: 'router',
      deferredExports: response.deferredExports,
      curatedRefOnlyFiles: response.curatedRefOnlyFiles
    };
  } catch (error) {
    // Router failed (network error, Pages Function unavailable, etc.) — fall back
    // to synchronous main-thread parsing so the editor stays functional.
    console.warn('[workspace] parseWorkspaceFiles via router failed:', error);
    useOutputStore
      .getState()
      .addLine(
        fmtLine(
          'parse',
          'router unavailable, falling back to browser parse',
          error instanceof Error ? error.message : String(error)
        ),
        'warn'
      );
    // Layer 1 filter: only hand user-authored .rosetta files to the in-browser
    // Langium parser.  Two conditions are checked:
    //   1. `!f.serializedModelJson` — excludes curated entries (which may have a
    //      .rosetta path such as "[cdm]/types/Trade.rosetta" but are pre-parsed
    //      server-side and must not be re-parsed in-browser).
    //   2. `f.path.toLowerCase().endsWith('.rosetta')` — excludes bundle-marker
    //      files (e.g. "[cdm]/.bundle-marker") whose extensionless URI causes
    //      Langium's getServices() to throw "no services for the extension ''".
    // Together these mirror the router path's `userFiles` filter so the fallback
    // never dead-ends on mixed workspaces.
    const parseableFiles = files.filter((f) => !f.serializedModelJson && f.path.toLowerCase().endsWith('.rosetta'));
    return parseWorkspaceFilesOnMainThread(parseableFiles, {
      parseMode: 'main-thread-fallback',
      fallbackMessage: formatRouterFallbackMessage(error)
    });
  }
}

export function _resetParserWorkerForTests(): void {
  if (worker) {
    worker.terminate();
  }
  worker = null;
  requestId = 0;
  workerInitError = null;
}

// ---------------------------------------------------------------------------
// Server-side parse routing (019 Phase 0) — POST /api/parse with hydration
// ---------------------------------------------------------------------------

/**
 * Route a parseWorkspace request through the /api/parse Pages Function.
 *
 * 1. POSTs the file list to /api/parse (with optional curatedBundles metadata
 *    so the server can fetch corpus documents server-to-server).
 * 2. On success, hydrates the browser worker with the returned hydration state
 *    so subsequent linkDocument requests work without re-parsing locally.
 * 3. Throws on any failure (non-2xx, network error, or ok:false). The caller
 *    (`parseWorkspaceFiles`) is responsible for falling back to the main-
 *    thread parser with the FULL WorkspaceFile[] — including curated bundle
 *    serialized models that were filtered out before this call. Doing the
 *    fallback in-place here would silently drop the corpus, since this
 *    function only receives user files + bundle metadata.
 */
export async function parseWorkspaceViaRouter(
  files: Array<{ name: string; content: string }>,
  options: { curatedBundles?: Array<{ id: string; version: string }>; hydrateNamespaces?: string[] } = {}
): Promise<ParseWorkspaceResponse> {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files,
      curatedBundles: options.curatedBundles ?? [],
      hydrateNamespaces: options.hydrateNamespaces ?? []
    })
  });
  if (!response.ok) {
    throw new Error(`/api/parse HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    ok: boolean;
    models: ParseWorkspaceResponse['models'];
    deferredExports: ParseWorkspaceResponse['deferredExports'];
    errors: ParseWorkspaceResponse['errors'];
    hydrationState: { documents: HydrateRequest['documents'] };
    dependencyGraph?: Record<string, string[]>;
  };

  if (!data.ok) {
    // Same reason as above: bubble up to the outer fallback with the full
    // workspace inputs rather than reparsing only user files in-place.
    throw new Error('/api/parse returned ok:false');
  }

  // Publish the cross-namespace dep graph (spec §5.2) into the codegen store
  // so the Download config modal can drive its auto-select cascade. Absent /
  // fail-soft responses leave it `{}` (modal shows no cascade hints).
  useCodegenStore.getState().setDependencyGraph(data.dependencyGraph ?? {});

  // Deserialize ONLY the user-document hydration entries into RosettaModel
  // instances for the graph view. Curated corpus documents stay in
  // hydrationState so the worker hydrate path can register their exports
  // for cross-reference resolution, but we deliberately keep them out of
  // `models[]` / `parsedModels[]` — pushing them through here defeats the
  // lazy/deferred-corpus design (the whole reason curated docs serialize to
  // JSON in the first place) and reintroduces multi-megabyte main-thread
  // deserialization on every debounced edit parse.
  const userFileNames = new Set(files.map((f) => f.name));
  const services = createRuneDslServices(EmptyFileSystem).RuneDsl;
  const models: RosettaModel[] = [];
  const parsedModels: Array<{ filePath: string; model: RosettaModel }> = [];
  // Build a quick lookup: filePath → namespace from the response's
  // deferredExports so curated entries get a real namespace rather than
  // an empty string (Copilot review: CachedFile.namespace is declared
  // non-optional). User-file entries are handled in the same loop.
  const namespaceByFilePath = new Map<string, string>();
  for (const d of data.deferredExports ?? []) {
    namespaceByFilePath.set(d.filePath, d.namespace);
  }
  // Collect curated docs as refOnly CachedFile entries grouped by bundleId.
  // The server stamps each hydration doc with an explicit `bundleId` field
  // (apps/studio/functions/api/parse.ts) so we don't infer bundle
  // membership from the URI prefix — the previous prefix inference
  // false-positive'd for user files under `${bundleId}/path` (Codex P2
  // review of PR #163).
  const curatedRefOnlyFiles: Record<string, CachedFile[]> = {};
  for (const doc of data.hydrationState.documents) {
    // doc.uri is the bare filePath emitted by /api/parse + curated-fetch
    // (no `file://` prefix). The legacy `file:///` strip is retained for
    // backwards compatibility with any in-flight payloads.
    const filePath = doc.uri.replace(/^file:\/\/\//, '');
    if (userFileNames.has(filePath)) {
      try {
        const model = services.serializer.JsonSerializer.deserialize<RosettaModel>(doc.serializedModel);
        models.push(model);
        parsedModels.push({ filePath, model });
      } catch (err) {
        console.warn('[workspace] failed to deserialize hydration model for', doc.uri, err);
      }
      continue;
    }
    // Not a user file. Use the explicit bundleId stamped by the server;
    // if it's missing (e.g. older deployments mid-rollout) we skip the
    // entry rather than guess from the URI — silently grouping under
    // the wrong key was the original Codex bug.
    const bundleId = doc.bundleId;
    if (!bundleId) continue;
    // Strip the `${bundleId}/` prefix from the uri so the path within
    // the bundle is preserved without the redundant id prefix on disk.
    const pathInBundle = filePath.startsWith(`${bundleId}/`) ? filePath.slice(bundleId.length + 1) : filePath;
    const entry: CachedFile = {
      path: pathInBundle,
      content: '',
      namespace: namespaceByFilePath.get(filePath) ?? '',
      serializedModelJson: doc.serializedModel as CachedFile['serializedModelJson'],
      exports: doc.exports,
      refOnly: true
    };
    (curatedRefOnlyFiles[bundleId] ??= []).push(entry);
  }

  // ── Restore "loaded" status for bundles outside the import closure ──────────
  // The manifest fast-path hydrates ONLY the user's import closure into
  // hydrationState, so a curated bundle that no user file imports yields zero
  // hydrationState docs → zero curatedRefOnlyFiles → LoadedModel.files stays []
  // → ModelLoader's 30s hydration timeout fires → "load failed". deferredExports
  // lists EVERY namespace in each loaded bundle; register the list-only ones
  // (those not already added from the closure above) as refOnly entries so the
  // bundle reads as loaded. They carry no serializedModelJson — their ASTs
  // hydrate on demand when the namespace is browsed.
  const seenPathByBundle = new Map<string, Set<string>>();
  for (const [bid, entries] of Object.entries(curatedRefOnlyFiles)) {
    seenPathByBundle.set(bid, new Set(entries.map((e) => e.path)));
  }
  for (const d of data.deferredExports ?? []) {
    const slash = d.filePath.indexOf('/');
    if (slash < 0) continue; // user-file entry: no bundle prefix
    const bundleId = d.filePath.slice(0, slash);
    if (!CURATED_BUNDLE_IDS.has(bundleId)) continue;
    const pathInBundle = d.filePath.slice(slash + 1);
    // Only list-only manifest namespaces belong here — their filePath is the
    // synthetic `${bundleId}/${namespace}`. Closure docs (already added above)
    // and user files under a `${bundleId}/...` path have a different shape and
    // must be skipped, avoiding the `${bundleId}/...` false-positive class.
    if (d.filePath !== `${bundleId}/${d.namespace}`) continue;
    const seen = seenPathByBundle.get(bundleId) ?? new Set<string>();
    if (seen.has(pathInBundle)) continue; // already added from the closure
    seen.add(pathInBundle);
    seenPathByBundle.set(bundleId, seen);
    (curatedRefOnlyFiles[bundleId] ??= []).push({
      path: pathInBundle,
      content: '',
      namespace: d.namespace,
      // CachedFile.exports needs {type,name,path}; deferredExports omits path
      // (no AST yet). Path is only used to locate a node once hydrated.
      exports: (d.exports ?? []).map((e) => ({ ...e, path: '' })),
      refOnly: true
    });
  }

  // Hydrate the browser worker with ALL server-parsed documents + exports
  // (user AND curated) so subsequent linkDocument calls can resolve cross-
  // references. Two failure modes are distinguished:
  //
  //   1. Worker REACHABLE but reports `ok: false` — a real hydration
  //      failure. linkDocument lookups would silently miss the affected
  //      docs. Throw so parseWorkspaceFiles' outer catch reparses the
  //      workspace through the main-thread fallback (Codex review P2).
  //   2. Worker UNREACHABLE (e.g. running in jsdom without a real Worker,
  //      worker crashed, postMessage timeout) — log + accept the degraded
  //      state. linkDocument will fail downstream but the graph still
  //      renders from the deserialized models above. Throwing here would
  //      regress test envs that don't ship the parser worker.
  try {
    const hydrateResponse = (await workerRequest({
      type: 'hydrate',
      id: `hydrate:${Date.now()}`,
      documents: data.hydrationState.documents
    })) as HydrateResponse;
    if (hydrateResponse.type === 'hydrateResult' && !hydrateResponse.ok) {
      throw new Error(`worker hydration failed: ${hydrateResponse.error ?? 'unknown'}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('worker hydration failed')) {
      // Case 1 — worker explicitly rejected. Bubble up.
      throw err;
    }
    // Case 2 — worker unreachable. Log and continue with deserialized models.
    console.warn('[workspace] browser worker unreachable during hydrate; cross-ref resolution may be degraded:', msg);
  }

  return {
    type: 'parseWorkspaceResult',
    id: `routed:${Date.now()}`,
    models,
    parsedModels,
    deferredExports: data.deferredExports,
    errors: data.errors,
    curatedRefOnlyFiles
  };
}

/**
 * Trigger on-demand cross-reference linking for a single document (ADR 007 Phase 2).
 * Returns any corpus models that were lazily deserialized during linking so the
 * caller can merge them into the graph store.
 */
export async function linkDocument(
  uri: string
): Promise<{ linked: boolean; errors: string[]; newModels: RosettaModel[] }> {
  try {
    const id = String(++requestId);
    const response = await workerRequest({
      type: 'linkDocument',
      id,
      uri
    });
    if (isLinkDocumentResponse(response)) {
      return { linked: response.linked, errors: response.errors, newModels: response.newModels };
    }
    return { linked: false, errors: ['Unexpected response'], newModels: [] };
  } catch (error) {
    console.warn('[workspace] linkDocument failed:', error);
    useOutputStore
      .getState()
      .addLine(fmtLine('parse', 'link failed', error instanceof Error ? error.message : String(error)), 'error');
    return { linked: false, errors: [(error as Error).message], newModels: [] };
  }
}

/**
 * Read files from a FileList (from file input or drag-and-drop).
 * Reads in chunks of 10 to keep the UI responsive for large folders.
 * Calls onProgress between chunks when provided.
 */
export async function readFileList(
  fileList: FileList,
  onProgress?: (progress: WorkspaceLoadProgress) => void
): Promise<WorkspaceFile[]> {
  const results: WorkspaceFile[] = [];

  // Collect rosetta file indices first
  const indices: number[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file && file.name.endsWith('.rosetta')) {
      indices.push(i);
    }
  }

  const total = indices.length;
  const CHUNK_SIZE = 10;

  for (let chunk = 0; chunk < indices.length; chunk += CHUNK_SIZE) {
    const end = Math.min(chunk + CHUNK_SIZE, indices.length);
    for (let j = chunk; j < end; j++) {
      const file = fileList[indices[j]!]!;
      const content = await file.text();
      results.push({
        name: file.name,
        path: file.webkitRelativePath || file.name,
        content,
        dirty: false
      });
    }
    onProgress?.({ phase: 'reading', loaded: results.length, total });

    // Yield to the UI thread between chunks
    if (end < indices.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * Update a file's content and mark it dirty.
 */
export function updateFileContent(files: WorkspaceFile[], path: string, newContent: string): WorkspaceFile[] {
  return files.map((f) => (f.path === path ? { ...f, content: newContent, dirty: true } : f));
}

/**
 * Create a new workspace file.
 */
export function createWorkspaceFile(name: string, content: string): WorkspaceFile {
  return {
    name,
    path: name,
    content,
    dirty: true
  };
}

/**
 * Default starter template for a blank Rune file — a minimal `namespace`
 * declaration plus a commented stub so the editor/graph has something to
 * render without being completely empty.
 */
const BLANK_TEMPLATE = `namespace example

// Start typing — autocomplete, validation, and the graph update as you go.
//
// type Party:
//   name string (1..1)
`;

/**
 * Create a blank untitled workspace file for the "New" start-page option.
 *
 * Picks the next available `untitled[-N].rosetta` name that doesn't collide
 * with an existing user file. Read-only model files are ignored since they
 * live under a `[model-id]/` prefix and never shadow user-editable paths.
 */
export function createBlankWorkspaceFile(existingFiles: ReadonlyArray<WorkspaceFile>): WorkspaceFile {
  const userPaths = new Set(existingFiles.filter((f) => !f.readOnly).map((f) => f.path));
  let candidate = 'untitled.rosetta';
  let n = 2;
  while (userPaths.has(candidate)) {
    candidate = `untitled-${n}.rosetta`;
    n += 1;
  }
  return createWorkspaceFile(candidate, BLANK_TEMPLATE);
}

// ---------------------------------------------------------------------------
// Model file merging (T008) — integrate loaded reference models
// ---------------------------------------------------------------------------

import type { LoadedModel } from '../types/model-types.js';

/**
 * Merge loaded model files into the workspace as read-only entries.
 * Model files are prefixed with the model source ID to avoid path collisions.
 * Existing user files are preserved; model files are appended.
 *
 * 019 Phase 0: When a curated bundle was loaded via the server-side parse
 * path (Task 0.5a), `model.files` will be empty. In that case a synthetic
 * bundle-marker entry is inserted so that collectCuratedBundlesFromWorkspace
 * can still find the bundle id+version to include in /api/parse requests.
 * The marker is excluded from /api/parse's `userFiles` filter (via the
 * truthy `serializedModelJson`) and from LSP sync in App.tsx (filtered by
 * BUNDLE_MARKER_SUFFIX). Callers that iterate over model files for display
 * (e.g. namespace explorer) should filter out bundle-marker paths.
 */
export const BUNDLE_MARKER_SUFFIX = '/.bundle-marker';

export function mergeModelFiles(currentFiles: WorkspaceFile[], model: LoadedModel): WorkspaceFile[] {
  // Remove any previous files from this model source
  const userFiles = currentFiles.filter((f) => !f.path.startsWith(`[${model.source.id}]/`));

  // Convert model files to read-only workspace files.
  // bundleId and bundleVersion are propagated from the LoadedModel so that
  // parseWorkspaceFiles / collectCuratedBundlesFromWorkspace can build the
  // curatedBundles list for /api/parse without touching the model-store.
  const modelFiles: WorkspaceFile[] = model.files.map((f: CachedFile) => ({
    name: f.path.split('/').pop() ?? f.path,
    path: `[${model.source.id}]/${f.path}`,
    content: f.content,
    dirty: false,
    readOnly: true,
    serializedModelJson: f.serializedModelJson,
    exports: f.exports,
    bundleId: model.source.id,
    bundleVersion: model.commitHash,
    refOnly: f.refOnly
  }));

  // 019 Phase 0: when no files were extracted (server-side parse path),
  // insert a synthetic bundle-marker so collectCuratedBundlesFromWorkspace
  // can find the bundle id+version without the corpus files being present.
  // The marker has a truthy serializedModelJson so parseWorkspaceFiles
  // excludes it from the userFiles sent to the server. App.tsx filters it
  // from syncWorkspaceFiles via BUNDLE_MARKER_SUFFIX to avoid LSP noise.
  if (modelFiles.length === 0) {
    modelFiles.push({
      name: '.bundle-marker',
      path: `[${model.source.id}]${BUNDLE_MARKER_SUFFIX}`,
      content: '',
      dirty: false,
      readOnly: true,
      // Non-empty string → excluded from userFiles by `!f.serializedModelJson` filter.
      serializedModelJson: '{}' as CuratedSerializedDocument['modelJson'],
      bundleId: model.source.id,
      bundleVersion: model.commitHash
    });
  }

  return [...userFiles, ...modelFiles];
}

/**
 * Remove all files from a specific model source.
 */
export function removeModelFiles(currentFiles: WorkspaceFile[], sourceId: string): WorkspaceFile[] {
  return currentFiles.filter((f) => !f.path.startsWith(`[${sourceId}]/`));
}

// ---------------------------------------------------------------------------
// External file change detection (T102)
// ---------------------------------------------------------------------------

export type FileChangeAction = 'keep' | 'reload';

export interface FileChangeEvent {
  path: string;
  newContent: string;
}

/**
 * Detect external file changes by re-reading the FileList and comparing
 * against the current workspace state. Returns a list of changed files.
 */
export async function detectExternalChanges(
  currentFiles: WorkspaceFile[],
  newFileList: FileList
): Promise<FileChangeEvent[]> {
  const changes: FileChangeEvent[] = [];
  const newFiles = await readFileList(newFileList);

  for (const newFile of newFiles) {
    const existing = currentFiles.find((f) => f.path === newFile.path);
    if (existing && existing.content !== newFile.content) {
      changes.push({ path: newFile.path, newContent: newFile.content });
    }
  }

  return changes;
}

/**
 * Apply file change decisions to the workspace.
 */
export function applyFileChanges(
  files: WorkspaceFile[],
  changes: FileChangeEvent[],
  decisions: Map<string, FileChangeAction>
): WorkspaceFile[] {
  return files.map((f) => {
    const decision = decisions.get(f.path);
    if (decision === 'reload') {
      const change = changes.find((c) => c.path === f.path);
      if (change) {
        return { ...f, content: change.newContent, dirty: false };
      }
    }
    return f;
  });
}

/**
 * Error raised by downloadTargetViaRouter so callers can read the
 * per-diagnostic detail of an /api/codegen failure without re-parsing
 * the response. Mirrors the function's JSON envelope (spec §7.6).
 */
export class CodegenDownloadError extends Error {
  readonly status: number;
  readonly diagnostics: ReadonlyArray<{ severity: string; code: string; message: string }>;
  constructor(
    message: string,
    status: number,
    diagnostics: ReadonlyArray<{ severity: string; code: string; message: string }> = []
  ) {
    super(message);
    this.name = 'CodegenDownloadError';
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

/**
 * Sanitize a filename so it's safe to assign to `<a download="...">`.
 * Strips control chars (incl. CR/LF, which could enable header-style
 * injection on rare browsers), reduces path-separator characters to
 * the basename, and removes any embedded quotes. Falls back to the
 * caller's default when the result is empty.
 *
 * Defense-in-depth: the server we control returns well-formed
 * filenames, but a malicious or compromised response shouldn't be
 * able to coerce the browser into saving with a path-traversal name.
 */
function sanitizeDownloadFilename(raw: string, fallback: string): string {
  // Take the basename: drop everything up to and including the last
  // slash or backslash. Handles posix, windows, and mixed separators.
  const basename = raw.replace(/^.*[/\\]/, '');
  // Strip control characters (including CR/LF) and quotes.
  // eslint-disable-next-line no-control-regex
  const cleaned = basename.replace(/[\x00-\x1f"]/g, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Pull the `filename="..."` value from a Content-Disposition header.
 * Falls back to the given default when the header is missing or
 * malformed. Always passes the extracted value through
 * `sanitizeDownloadFilename` so a hostile server response can't inject
 * control chars or path components into the browser's save dialog
 * (Copilot review on PR #165).
 */
function parseContentDispositionFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  // Matches filename="value" (preferred) or unquoted filename=value.
  const match = /filename\*?=("([^"]+)"|([^;]+))/i.exec(header);
  if (!match) return fallback;
  const raw = (match[2] ?? match[3] ?? '').trim();
  return sanitizeDownloadFilename(raw, fallback);
}

/**
 * Trigger a browser save for `blob` using the document API. Creates a
 * temporary anchor with an object URL, clicks it, then revokes the URL.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * POST workspace files to /api/codegen and trigger a browser save for
 * the response artifact (single file for whole-model and one-namespace
 * generations; zip for multi-namespace per-namespace generations).
 *
 * Spec §7.6. Companion server lives at apps/studio/functions/api/codegen.ts.
 *
 * Throws CodegenDownloadError on any non-2xx response with the parsed
 * diagnostics envelope; throws a plain Error on network failure.
 *
 * 018 Phase 0 Task 0.12.
 */
export async function downloadTargetViaRouter(
  files: Array<{ path: string; content: string }>,
  target: string,
  options: Record<string, unknown> = {},
  curatedBundles: ReadonlyArray<{ id: string; version: string }> = [],
  namespaces: ReadonlyArray<string> = []
): Promise<void> {
  const body: Record<string, unknown> = { files, target, options };
  if (curatedBundles.length > 0) {
    body.curatedBundles = curatedBundles;
  }
  // §5.3 — forward the modal's dependency-closed namespace subset. Empty =
  // no filter (emit everything), matching the server's interpretation.
  if (namespaces.length > 0) {
    body.namespaces = namespaces;
  }
  const response = await fetch('/api/codegen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let envelope: { ok?: boolean; error?: string; diagnostics?: unknown } = {};
    try {
      envelope = (await response.json()) as typeof envelope;
    } catch {
      // Non-JSON response (e.g. 502 from the edge before reaching the
      // function). Keep the empty envelope; the status code alone is
      // enough information for the user.
    }
    const diags = Array.isArray(envelope.diagnostics)
      ? (envelope.diagnostics as ReadonlyArray<{ severity: string; code: string; message: string }>)
      : [];
    throw new CodegenDownloadError(envelope.error ?? `/api/codegen HTTP ${response.status}`, response.status, diags);
  }

  const blob = await response.blob();
  const filename = parseContentDispositionFilename(response.headers.get('Content-Disposition'), `${target}-output`);
  triggerBlobDownload(blob, filename);
}
