// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Workspace service — manages multi-file loading, dirty tracking,
 * and cross-file resolution for the studio app (T083, T098, T100, T102).
 */

import { parse, parseWorkspace } from '@rune-langium/core';
import type {
  WorkerRequest,
  ParseResponse,
  ParseWorkspaceResponse
} from '../workers/parser-worker.js';

export interface WorkspaceFile {
  name: string;
  path: string;
  content: string;
  dirty: boolean;
  /** When true, the file is a system/built-in file and cannot be edited. */
  readOnly?: boolean;
}

export interface WorkspaceLoadProgress {
  phase: 'reading' | 'syncing' | 'complete';
  loaded: number;
  total: number;
}

export interface WorkspaceState {
  files: WorkspaceFile[];
  models: unknown[];
  errors: Map<string, string[]>;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Worker-based parsing (T098) — fallback to main thread if worker fails
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
let requestId = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/parser-worker.ts', import.meta.url), {
      type: 'module'
    });
    return worker;
  } catch {
    // Worker not available (e.g., in test env or SSR)
    return null;
  }
}

function workerRequest<T extends ParseResponse | ParseWorkspaceResponse>(
  msg: WorkerRequest
): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      reject(new Error('Worker not available'));
      return;
    }

    const id = msg.id;
    const handler = (e: MessageEvent) => {
      if (e.data?.id === id) {
        w.removeEventListener('message', handler);
        resolve(e.data as T);
      }
    };
    w.addEventListener('message', handler);
    w.postMessage(msg);

    // Timeout after 30s
    setTimeout(() => {
      w.removeEventListener('message', handler);
      reject(new Error('Worker timeout'));
    }, 30000);
  });
}

/**
 * Parse a single .rosetta file and return the model.
 * Tries the web worker first; falls back to main-thread parsing.
 */
export async function parseFile(
  content: string,
  uri?: string
): Promise<{ model: unknown; errors: string[] }> {
  // Try worker first (T098)
  try {
    const id = String(++requestId);
    const response = await workerRequest<ParseResponse>({
      type: 'parse',
      id,
      content,
      uri
    });
    return { model: response.model, errors: response.errors };
  } catch {
    // Fallback to main thread
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
    return { model: result.value, errors };
  } catch (e) {
    return {
      model: null,
      errors: [(e as Error).message]
    };
  }
}

/**
 * Parse all files in the workspace and return models.
 * Tries the web worker first; falls back to main-thread parsing.
 * Supports cross-file resolution via sequential parsing (T100).
 */
export async function parseWorkspaceFiles(
  files: WorkspaceFile[]
): Promise<{ models: unknown[]; errors: Map<string, string[]> }> {
  if (files.length === 0) {
    return { models: [], errors: new Map() };
  }

  // Try worker batch parse first (T098)
  try {
    const id = String(++requestId);
    const response = await workerRequest<ParseWorkspaceResponse>({
      type: 'parseWorkspace',
      id,
      files: files.map((f) => ({ name: f.path, content: f.content }))
    });
    const errMap = new Map<string, string[]>();
    for (const [k, v] of Object.entries(response.errors)) {
      errMap.set(k, v);
    }
    return { models: response.models, errors: errMap };
  } catch {
    // Fallback to main thread
  }

  // Main-thread fallback
  const results = await parseWorkspace(
    files.map((file) => ({
      uri: file.path,
      content: file.content
    }))
  );
  const models: unknown[] = [];
  const errors = new Map<string, string[]>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const file = files[i]!;
    if (result.value) {
      models.push(result.value);
    }
    const fileErrors = result.parserErrors.map((err) => err.message);
    if (fileErrors.length > 0) {
      errors.set(file.path, fileErrors);
    }
  }

  return { models, errors };
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
export function updateFileContent(
  files: WorkspaceFile[],
  path: string,
  newContent: string
): WorkspaceFile[] {
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
export function createBlankWorkspaceFile(
  existingFiles: ReadonlyArray<WorkspaceFile>
): WorkspaceFile {
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
export function mergeModelFiles(
  currentFiles: WorkspaceFile[],
  model: LoadedModel
): WorkspaceFile[] {
  // Remove any previous files from this model source
  const userFiles = currentFiles.filter((f) => !f.path.startsWith(`[${model.source.id}]/`));

  // Convert model files to read-only workspace files
  const modelFiles: WorkspaceFile[] = model.files.map((f: CachedFile) => ({
    name: f.path.split('/').pop() ?? f.path,
    path: `[${model.source.id}]/${f.path}`,
    content: f.content,
    dirty: false,
    readOnly: true
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
