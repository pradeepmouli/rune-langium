/**
 * IndexedDB cache layer for git-loaded Rune DSL models.
 * Uses the `idb` library for a promise-based IndexedDB API.
 * @see specs/008-core-editor-features/data-model.md — CachedModel
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { CachedModel } from '../types/model-types.js';

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

/** Retrieve a cached model by source ID. Returns null if not cached. */
export async function getCachedModel(sourceId: string): Promise<CachedModel | null> {
  const db = await getDB();
  const result = await db.get(STORE_NAME, sourceId);
  return (result as CachedModel) ?? null;
}

/** Store a model in the cache, replacing any existing entry for the same source. */
export async function setCachedModel(model: CachedModel): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, model);
}

/**
 * Check if the cached model is still fresh (same ref).
 * Returns the cached model if it matches, null otherwise.
 */
export async function getCachedModelIfFresh(
  sourceId: string,
  requestedRef: string
): Promise<CachedModel | null> {
  const cached = await getCachedModel(sourceId);
  if (cached && cached.ref === requestedRef) {
    return cached;
  }
  return null;
}

/** Clear a specific cached model, or all cached models if no ID provided. */
export async function clearCache(sourceId?: string): Promise<void> {
  const db = await getDB();
  if (sourceId) {
    await db.delete(STORE_NAME, sourceId);
  } else {
    await db.clear(STORE_NAME);
  }
}

/** List all cached model source IDs. */
export async function listCachedModels(): Promise<string[]> {
  const db = await getDB();
  return db.getAllKeys(STORE_NAME) as Promise<string[]>;
}
