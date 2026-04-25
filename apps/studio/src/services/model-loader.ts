// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Git-based model loader using isomorphic-git.
 * Clones public repositories, discovers .rosetta files, and yields progress.
 * @see specs/008-core-editor-features/contracts/model-loader-api.md
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import type {
  ModelSource,
  CachedModel,
  CachedFile,
  LoadProgress,
  LoadedModel
} from '../types/model-types.js';
import { ModelLoadError } from '../types/model-types.js';
import { getCachedModel, getCachedModelIfFresh, setCachedModel } from './model-cache.js';

const CORS_PROXY = 'https://cors.isomorphic-git.org';

interface LoadOptions {
  signal?: AbortSignal;
  useCache?: boolean;
  onProgress?: (progress: LoadProgress) => void;
  /**
   * When `source.archiveUrl` is set (curated entries on the deployed CF
   * site), the caller can supply a curated-archive loader to short-circuit
   * the slow git-clone path. Feature 012 (FR-006). The loader is dependency-
   * injected so this module stays decoupled from OPFS imports — the actual
   * implementation lives in `./curated-loader.ts` and is wired by the
   * component layer (ModelLoader.tsx).
   */
  archiveLoader?: (
    source: ModelSource,
    opts: { signal?: AbortSignal; onProgress?: (p: LoadProgress) => void }
  ) => Promise<LoadedModel>;
}

/**
 * Load a Rune DSL model.
 *
 * - If `source.archiveUrl` is set AND `options.archiveLoader` is supplied,
 *   route to the curated-archive (CF R2) path. This is the fast, reliable
 *   path for deployed Studio (feature 012, FR-006).
 * - Otherwise fall through to the git-clone path (existing behaviour;
 *   covers user-supplied custom URLs per FR-007).
 *
 * The progress + cancellation surface is identical across both paths.
 */
export async function loadModel(
  source: ModelSource,
  options: LoadOptions = {}
): Promise<LoadedModel> {
  const { signal, useCache = true, onProgress, archiveLoader } = options;

  if (source.archiveUrl && archiveLoader) {
    if (signal?.aborted) throw new ModelLoadError('CANCELLED', 'Load cancelled');
    return archiveLoader(source, { signal, onProgress });
  }

  // Check cancellation
  if (signal?.aborted) {
    throw new ModelLoadError('CANCELLED', 'Load cancelled');
  }

  // Check cache first
  if (useCache) {
    const cached = await getCachedModelIfFresh(source.id, source.ref);
    if (cached) {
      return {
        source,
        commitHash: cached.commitHash,
        files: cached.files,
        loadedAt: Date.now()
      };
    }
  }

  // T011: Offline fallback — if offline, try cached model (even stale ref)
  if (!navigator.onLine) {
    const cachedAny = await getCachedModel(source.id);
    if (cachedAny) {
      return {
        source,
        commitHash: cachedAny.commitHash,
        files: cachedAny.files,
        loadedAt: Date.now()
      };
    }
    throw new ModelLoadError(
      'NETWORK',
      `Offline and no cached version of ${source.name} available. Connect to the internet for initial download.`
    );
  }

  // Create an in-memory filesystem for this clone
  const fs = new LightningFS(`model-${source.id}`, { wipe: true });

  const dir = `/${source.id}`;

  try {
    // Phase 1: Fetch/clone the repository
    onProgress?.({ phase: 'fetching', current: 0, total: 1 });

    if (signal?.aborted) throw new ModelLoadError('CANCELLED', 'Load cancelled');

    await git.clone({
      fs,
      http,
      dir,
      corsProxy: CORS_PROXY,
      url: source.repoUrl,
      ref: source.ref,
      singleBranch: true,
      depth: 1,
      noCheckout: false,
      onProgress: (evt) => {
        onProgress?.({
          phase: 'fetching',
          current: evt.loaded ?? 0,
          total: evt.total ?? 1
        });
      }
    });

    if (signal?.aborted) throw new ModelLoadError('CANCELLED', 'Load cancelled');

    // Get the commit hash
    const commitHash = await git.resolveRef({ fs, dir, ref: 'HEAD' });

    onProgress?.({ phase: 'fetching', current: 1, total: 1 });

    // Phase 2: Discover .rosetta files
    onProgress?.({ phase: 'discovering', current: 0, total: 1 });

    const rosettaFiles = await discoverRosettaFiles(fs, dir, source.paths);

    if (rosettaFiles.length === 0) {
      throw new ModelLoadError('NO_FILES', `No .rosetta files found in ${source.name}`);
    }

    if (signal?.aborted) throw new ModelLoadError('CANCELLED', 'Load cancelled');

    onProgress?.({
      phase: 'discovering',
      current: rosettaFiles.length,
      total: rosettaFiles.length
    });

    // Phase 3: Read file contents
    const files: CachedFile[] = [];
    const total = rosettaFiles.length;

    for (let i = 0; i < rosettaFiles.length; i++) {
      if (signal?.aborted) throw new ModelLoadError('CANCELLED', 'Load cancelled');

      const filePath = rosettaFiles[i]!;
      const content = new TextDecoder().decode(
        (await fs.promises.readFile(`${dir}/${filePath}`)) as Uint8Array
      );
      const namespace = extractNamespace(content);

      files.push({ path: filePath, content, namespace });

      if (i % 10 === 0 || i === total - 1) {
        onProgress?.({ phase: 'parsing', current: i + 1, total });
      }
    }

    // Cache the result
    const cachedModel: CachedModel = {
      sourceId: source.id,
      ref: source.ref,
      commitHash,
      files,
      fetchedAt: Date.now(),
      totalFiles: files.length
    };
    await setCachedModel(cachedModel);

    return {
      source,
      commitHash,
      files,
      loadedAt: Date.now()
    };
  } catch (e) {
    if (e instanceof ModelLoadError) throw e;

    const msg = (e as Error).message ?? String(e);

    if (msg.includes('404') || msg.includes('not found')) {
      throw new ModelLoadError(
        'NOT_FOUND',
        `Repository or ref not found: ${source.repoUrl}@${source.ref}`
      );
    }
    // Anything else maps to NETWORK — we can't reliably distinguish
    // network errors from programming bugs by string-matching the message,
    // so prefer the user-actionable category and let the underlying msg
    // through for diagnostics.
    throw new ModelLoadError('NETWORK', `Failed to load ${source.name}: ${msg}`);
  }
}

/**
 * Recursively discover .rosetta files matching the source's path patterns.
 * Supports simple glob patterns with ** and *.
 */
async function discoverRosettaFiles(
  fs: LightningFS,
  baseDir: string,
  patterns: string[]
): Promise<string[]> {
  const allFiles = await walkDirectory(fs, baseDir, '');
  const rosettaFiles = allFiles.filter((f) => f.endsWith('.rosetta'));

  if (patterns.length === 0 || patterns.includes('**/*.rosetta')) {
    return rosettaFiles;
  }

  return rosettaFiles.filter((filePath) =>
    patterns.some((pattern) => matchGlob(filePath, pattern))
  );
}

/** Recursively walk a directory tree and collect all file paths. */
async function walkDirectory(
  fs: LightningFS,
  baseDir: string,
  relativePath: string
): Promise<string[]> {
  const fullPath = relativePath ? `${baseDir}/${relativePath}` : baseDir;
  const entries = (await fs.promises.readdir(fullPath)) as string[];
  const results: string[] = [];

  for (const entry of entries) {
    if (entry === '.git') continue;

    const entryRelative = relativePath ? `${relativePath}/${entry}` : entry;
    const entryFull = `${baseDir}/${entryRelative}`;

    try {
      const stat = await fs.promises.stat(entryFull);
      if (stat.isDirectory()) {
        results.push(...(await walkDirectory(fs, baseDir, entryRelative)));
      } else {
        results.push(entryRelative);
      }
    } catch {
      // Skip entries that can't be stat'd
    }
  }

  return results;
}

/** Simple glob matching for patterns like "src/main/rosetta/**\/*.rosetta". */
function matchGlob(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp(`^${regex}$`).test(filePath);
}

/** Extract the namespace declaration from a .rosetta file. */
function extractNamespace(content: string): string {
  const match = content.match(/^\s*namespace\s+([\w.]+)/m);
  return match?.[1] ?? '';
}
