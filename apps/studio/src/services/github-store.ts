// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { openDB, type IDBPDatabase } from 'idb';

export interface GitHubIdentity { login: string; avatarUrl: string; }
interface GlobalGitHubRecord { token: string; identity?: GitHubIdentity; }

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

export async function saveGlobalGitHub(token: string, identity?: GitHubIdentity): Promise<void> {
  const record: GlobalGitHubRecord = { token, ...(identity ? { identity } : {}) };
  await (await db()).put(STORE, record, KEY);
}
export async function loadGlobalGitHub(): Promise<GlobalGitHubRecord | null> {
  return (await (await db()).get(STORE, KEY)) ?? null;
}
export async function loadGlobalGitHubToken(): Promise<string | null> {
  return (await loadGlobalGitHub())?.token ?? null;
}
export async function clearGlobalGitHub(): Promise<void> {
  await (await db()).delete(STORE, KEY);
}
/** Test-only: drop the cached connection so a fresh DB handle is opened. */
export async function _resetGitHubStoreForTests(): Promise<void> {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
}
