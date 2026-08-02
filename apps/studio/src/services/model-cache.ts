// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * IndexedDB cache layer for git-loaded Rune DSL models.
 * Uses the `idb` library for a promise-based IndexedDB API.
 * @see specs/008-core-editor-features/data-model.md — CachedModel
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { CachedModel } from '../types/model-types.js';
import { withInstrumentation, Capture } from './instrumentation/core.js';

const DB_NAME = 'rune-model-cache';
const DB_VERSION = 1;
const STORE_NAME = 'models';

type ModelCacheDB = IDBPDatabase;

async function getDB(): Promise<ModelCacheDB> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sourceId' });
      }
    }
  });
}

// `sourceId` is either a curated model id or an already-hashed custom-URL
// id (model-loader.ts mints `custom-${hashUrl(repoUrl)}`) — safe either
// way. The returned CachedModel carries raw .rosetta file contents — never
// captured.
export const getCachedModel = withInstrumentation(
  async function getCachedModel(sourceId: string): Promise<CachedModel | null> {
    const db = await getDB();
    const result = await db.get(STORE_NAME, sourceId);
    return (result as CachedModel) ?? null;
  },
  {
    op: 'getCachedModel',
    capture: Capture.Input,
    sanitize: (value, which) => (which === 'input' ? { sourceId: (value as [string])[0] } : undefined)
  }
);

// `model.files` carries raw .rosetta content — only the safe id is captured.
export const setCachedModel = withInstrumentation(
  async function setCachedModel(model: CachedModel): Promise<void> {
    const db = await getDB();
    await db.put(STORE_NAME, model);
  },
  {
    op: 'setCachedModel',
    capture: Capture.Input,
    sanitize: (value, which) => (which === 'input' ? { sourceId: (value as [CachedModel])[0].sourceId } : undefined)
  }
);

export const getCachedModelIfFresh = withInstrumentation(
  async function getCachedModelIfFresh(sourceId: string, requestedRef: string): Promise<CachedModel | null> {
    const cached = await getCachedModel(sourceId);
    if (cached && cached.ref === requestedRef) {
      return cached;
    }
    return null;
  },
  {
    op: 'getCachedModelIfFresh',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [sourceId, requestedRef] = value as [string, string];
      return { sourceId, requestedRef };
    }
  }
);

export const clearCache = withInstrumentation(
  async function clearCache(sourceId?: string): Promise<void> {
    const db = await getDB();
    if (sourceId) {
      await db.delete(STORE_NAME, sourceId);
    } else {
      await db.clear(STORE_NAME);
    }
  },
  {
    op: 'clearCache',
    capture: Capture.Input,
    sanitize: (value, which) => (which === 'input' ? { sourceId: (value as [string | undefined])[0] } : undefined)
  }
);
