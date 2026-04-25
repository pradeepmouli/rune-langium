// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * In-memory R2 test double. Implements the subset of R2Bucket our
 * publisher (T026) uses: get, put (with httpMetadata), delete, list,
 * and head. Just enough to prove the contract without touching
 * Cloudflare's network.
 */

interface StoredObject {
  body: Uint8Array;
  httpEtag: string;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

export interface MockR2Bucket {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    body: Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<void>;
  delete(key: string | string[]): Promise<void>;
  head(key: string): Promise<R2ObjectLike | null>;
  /**
   * Real-R2-shape async list. Returns `{ objects: [{ key }] }`.
   * For test-only debugging the synchronous `_keys` getter is also exposed.
   */
  list(opts?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
  /** Test-only convenience — returns all keys (or those with prefix). */
  list(prefix?: string): string[];
  has(key: string): boolean;
  getText(key: string): Promise<string>;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  httpEtag: string;
  uploaded: Date;
  body: ReadableStream<Uint8Array> | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  writeHttpMetadata(headers: Headers): void;
}

export function createMockR2Bucket(): MockR2Bucket {
  const store = new Map<string, StoredObject>();

  function makeObj(key: string, raw: StoredObject): R2ObjectLike {
    const data = raw.body;
    return {
      key,
      size: raw.size,
      httpEtag: raw.httpEtag,
      uploaded: raw.uploaded,
      get body() {
        return new Blob([data]).stream();
      },
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      text: async () => new TextDecoder().decode(data),
      json: async () => JSON.parse(new TextDecoder().decode(data)),
      writeHttpMetadata(headers: Headers) {
        if (raw.httpMetadata?.contentType) {
          headers.set('Content-Type', raw.httpMetadata.contentType);
        }
      }
    };
  }

  return {
    async get(key) {
      const obj = store.get(key);
      return obj ? makeObj(key, obj) : null;
    },
    async put(key, body, options) {
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      // Minimal etag: random hex. Good enough for our contract tests.
      const etag = '"' + Math.random().toString(16).slice(2, 10) + '"';
      store.set(key, {
        body: bytes,
        httpEtag: etag,
        size: bytes.byteLength,
        uploaded: new Date(),
        httpMetadata: options?.httpMetadata
      });
    },
    async delete(key) {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) store.delete(k);
    },
    async head(key) {
      const obj = store.get(key);
      return obj ? makeObj(key, obj) : null;
    },
    // Overload: either real-R2 async `{ objects }` shape (when called with
    // `{ prefix }` or no args) OR the synchronous test-only string array
    // (when called with a string prefix).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list(arg?: any): any {
      const all = Array.from(store.keys()).sort();
      if (typeof arg === 'string') {
        return all.filter((k) => k.startsWith(arg));
      }
      const prefix: string | undefined = arg?.prefix;
      const filtered = prefix ? all.filter((k) => k.startsWith(prefix)) : all;
      return Promise.resolve({ objects: filtered.map((key) => ({ key })) });
    },
    has(key) {
      return store.has(key);
    },
    async getText(key) {
      const obj = store.get(key);
      if (!obj) throw new Error(`mock R2: missing key ${key}`);
      return new TextDecoder().decode(obj.body);
    }
  };
}
