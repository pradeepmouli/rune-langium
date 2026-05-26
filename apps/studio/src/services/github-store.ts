// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { openDB, type IDBPDatabase } from 'idb';

export interface GithubIdentity { login: string; avatarUrl: string; }
interface GlobalGithubRecord { token: string; identity?: GithubIdentity; }

const DB_NAME = 'rune-studio-github';
const DB_VERSION = 1;
const STORE = 'connection';
const KEY = 'global';

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      }
    });
  }
  return dbPromise;
}

export async function saveGlobalGithub(token: string, identity?: GithubIdentity): Promise<void> {
  const record: GlobalGithubRecord = { token, ...(identity ? { identity } : {}) };
  await (await db()).put(STORE, record, KEY);
}
export async function loadGlobalGithub(): Promise<GlobalGithubRecord | null> {
  return (await (await db()).get(STORE, KEY)) ?? null;
}
export async function loadGlobalGithubToken(): Promise<string | null> {
  return (await loadGlobalGithub())?.token ?? null;
}
export async function clearGlobalGithub(): Promise<void> {
  await (await db()).delete(STORE, KEY);
}
/** Test-only: drop the cached connection so a fresh DB handle is opened. */
export async function _resetGithubStoreForTests(): Promise<void> {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
}
