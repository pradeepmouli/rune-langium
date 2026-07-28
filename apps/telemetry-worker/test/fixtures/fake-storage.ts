// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Minimal in-memory fake mirroring DurableObjectStorage's get/put/list
 * surface (the only methods counters.ts's TelemetryAggregator uses).
 * Shared by ingest.test.ts (wrapped into a fake DO namespace) and
 * counters.test.ts (wrapped into a bare DurableObjectState) so the fake's
 * shape only needs updating in one place if the DO storage contract changes.
 */

export interface FakeStorage {
  store: Map<string, unknown>;
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  put(key: string, value: unknown): Promise<void>;
  list<T = unknown>(opts?: { prefix?: string }): Promise<Map<string, T>>;
}

export function makeStorage(): FakeStorage {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async put(arg1: string | Record<string, unknown>, arg2?: unknown): Promise<void> {
      if (typeof arg1 === 'string') {
        store.set(arg1, arg2);
      } else {
        for (const [k, v] of Object.entries(arg1)) store.set(k, v);
      }
    },
    async list<T>(opts?: { prefix?: string }): Promise<Map<string, T>> {
      const out = new Map<string, T>();
      for (const [k, v] of store.entries()) {
        if (!opts?.prefix || k.startsWith(opts.prefix)) out.set(k, v as T);
      }
      return out;
    }
  };
}
