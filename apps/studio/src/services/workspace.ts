/**
 * Workspace service — manages multi-file loading, dirty tracking,
 * and cross-file resolution for the studio app (T083, T098, T100, T102).
 */

import { parse } from '@rune-langium/core';
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
export async function parseFile(content: string): Promise<{ model: unknown; errors: string[] }> {
  // Try worker first (T098)
  try {
    const id = String(++requestId);
    const response = await workerRequest<ParseResponse>({
      type: 'parse',
      id,
      content
    });
    return { model: response.model, errors: response.errors };
  } catch {
    // Fallback to main thread
  }

  // Main-thread fallback
  try {
    const result = await parse(content);
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
  const models: unknown[] = [];
  const errors = new Map<string, string[]>();

  for (const file of files) {
    const result = await parseFile(file.content);
    if (result.model) {
      models.push(result.model);
    }
    if (result.errors.length > 0) {
      errors.set(file.path, result.errors);
    }
  }

  return { models, errors };
}

/**
 * Read files from a FileList (from file input or drag-and-drop).
 */
export async function readFileList(fileList: FileList): Promise<WorkspaceFile[]> {
  const results: WorkspaceFile[] = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file || !file.name.endsWith('.rosetta')) continue;

    const content = await file.text();
    results.push({
      name: file.name,
      path: file.webkitRelativePath || file.name,
      content,
      dirty: false
    });
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
