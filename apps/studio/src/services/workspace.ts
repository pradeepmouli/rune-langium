// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Workspace service — manages multi-file loading, dirty tracking,
 * and cross-file resolution for the studio app (T083, T098, T100, T102).
 */

import { parse, parseWorkspace, createRuneDslServices, type RosettaModel } from '@rune-langium/core';
import { EmptyFileSystem } from 'langium';
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
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
  'Parser worker unavailable — using main-thread parsing, which may feel slower on large workspaces.';

function formatWorkerFallbackMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${WORKER_FALLBACK_MESSAGE} (${detail})`;
}

async function parseWorkspaceFilesOnMainThread(
  files: WorkspaceFile[],
  options: {
    parseMode: Extract<ParseMode, 'main-thread-fallback'>;
    fallbackMessage?: string;
  }
): Promise<ParseWorkspaceFilesResult> {
  const results = await parseWorkspace(
    files.map((file) => ({
      uri: file.path,
      content: file.content
    }))
  );
  const models: RosettaModel[] = [];
  const parsedModels: ParsedWorkspaceModel[] = [];
  const errors = new Map<string, string[]>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const file = files[i]!;
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
function collectCuratedBundlesFromWorkspace(files: WorkspaceFile[]): Array<{ id: string; version: string }> {
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
 * Fallback: if the router call fails (network error, 5xx, etc.), the function
 * falls back to main-thread parsing via `parseWorkspaceFilesOnMainThread`.
 * The old browser-worker path (T098) is no longer the primary; it remains
 * available via `_defaultBrowserParse` / `setBrowserParseImpl` for testing.
 */
export async function parseWorkspaceFiles(files: WorkspaceFile[]): Promise<ParseWorkspaceFilesResult> {
  if (files.length === 0) {
    return { models: [], parsedModels: [], errors: new Map(), parseMode: 'router' };
  }

  // User files go as raw content; curated/read-only files become bundle metadata.
  const userFiles = files.filter((f) => !f.serializedModelJson).map((f) => ({ name: f.path, content: f.content }));
  const curatedBundles = collectCuratedBundlesFromWorkspace(files);

  try {
    const response = await parseWorkspaceViaRouter(userFiles, { curatedBundles });
    const errMap = new Map<string, string[]>();
    for (const [k, v] of Object.entries(response.errors)) {
      errMap.set(k, v);
    }
    return {
      models: response.models,
      parsedModels: response.parsedModels,
      errors: errMap,
      parseMode: 'router',
      deferredExports: response.deferredExports
    };
  } catch (error) {
    // Router failed (network error, Pages Function unavailable, etc.) — fall back
    // to synchronous main-thread parsing so the editor stays functional.
    console.warn('[workspace] parseWorkspaceFiles via router failed:', error);
    return parseWorkspaceFilesOnMainThread(files, {
      parseMode: 'main-thread-fallback',
      fallbackMessage: formatWorkerFallbackMessage(error)
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
 * Default browser-worker parse implementation.
 * Exported so tests can save and restore the original impl after injection.
 */
export async function _defaultBrowserParse(
  files: Array<{ name: string; content: string }>
): Promise<ParseWorkspaceResponse> {
  return workerRequest({
    type: 'parseWorkspace',
    id: `ws:${Date.now()}`,
    files
  });
}

// Module-level injection point; starts pointing at the default impl.
let browserParseImpl: (files: Array<{ name: string; content: string }>) => Promise<ParseWorkspaceResponse> =
  _defaultBrowserParse;

/**
 * Test-only: replace the browser-worker parse implementation with a spy/stub.
 * Call with `_defaultBrowserParse` in afterEach to restore.
 */
export function setBrowserParseImpl(
  impl: (files: Array<{ name: string; content: string }>) => Promise<ParseWorkspaceResponse>
): void {
  browserParseImpl = impl;
}

/**
 * Route a parseWorkspace request through the /api/parse Pages Function.
 *
 * 1. POSTs the file list to /api/parse (with optional curatedBundles metadata
 *    so the server can fetch corpus documents server-to-server).
 * 2. On success, hydrates the browser worker with the returned hydration state
 *    so subsequent linkDocument requests work without re-parsing locally.
 * 3. Falls back to the browser worker on any failure (non-2xx, network error, or
 *    when the server response signals ok:false).
 */
export async function parseWorkspaceViaRouter(
  files: Array<{ name: string; content: string }>,
  options: { curatedBundles?: Array<{ id: string; version: string }> } = {}
): Promise<ParseWorkspaceResponse> {
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, curatedBundles: options.curatedBundles ?? [] })
    });
    if (!response.ok) {
      return browserParseImpl(files);
    }
    const data = (await response.json()) as {
      ok: boolean;
      models: ParseWorkspaceResponse['models'];
      deferredExports: ParseWorkspaceResponse['deferredExports'];
      errors: ParseWorkspaceResponse['errors'];
      hydrationState: { documents: HydrateRequest['documents'] };
    };

    if (!data.ok) {
      return browserParseImpl(files);
    }

    // Deserialize hydration documents into RosettaModel instances for downstream
    // consumers (e.g. the visual editor's graph view). The server cannot send
    // Langium ASTs directly (circular $container refs break JSON), but the
    // hydration state includes serializedModel JSON strings that Langium's
    // JsonSerializer can round-trip back to full AST nodes.
    // This step is done before hydrating the worker so that model data is
    // always returned even if the worker is unavailable (e.g. in tests).
    const services = createRuneDslServices(EmptyFileSystem).RuneDsl;
    const models: RosettaModel[] = [];
    const parsedModels: Array<{ filePath: string; model: RosettaModel }> = [];
    for (const doc of data.hydrationState.documents) {
      try {
        const model = services.serializer.JsonSerializer.deserialize<RosettaModel>(doc.serializedModel);
        models.push(model);
        // Derive filePath from the URI (strip "file:///").
        const filePath = doc.uri.replace(/^file:\/\/\//, '');
        parsedModels.push({ filePath, model });
      } catch (err) {
        console.warn('[workspace] failed to deserialize hydration model for', doc.uri, err);
      }
    }

    // Hydrate the browser worker with the server-parsed documents + exports so
    // that subsequent linkDocument calls can resolve cross-references.
    // A hydration failure is non-fatal: the graph view will still render from
    // the deserialized models above; only cross-ref resolution will be degraded.
    try {
      await workerRequest({
        type: 'hydrate',
        id: `hydrate:${Date.now()}`,
        documents: data.hydrationState.documents
      });
    } catch (err) {
      console.warn('[workspace] browser worker hydration failed (cross-ref resolution may be degraded):', err);
    }

    return {
      type: 'parseWorkspaceResult',
      id: `routed:${Date.now()}`,
      models,
      parsedModels,
      deferredExports: data.deferredExports,
      errors: data.errors
    };
  } catch {
    return browserParseImpl(files);
  }
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

import type { CachedFile, LoadedModel } from '../types/model-types.js';

/**
 * Merge loaded model files into the workspace as read-only entries.
 * Model files are prefixed with the model source ID to avoid path collisions.
 * Existing user files are preserved; model files are appended.
 */
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
    bundleVersion: model.commitHash
  }));

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
