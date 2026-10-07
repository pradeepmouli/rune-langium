// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { LspModelUpdate } from '@rune-langium/lsp-server';

const META_PREFIX = 'model-meta:';
const CHUNK_PREFIX = 'models:';
const CHUNK_SIZE = 16_000;
interface ModelRecord {
  generation: string;
  count: number;
}
const chunkKey = (uri: string, generation: string, index: number) => `${CHUNK_PREFIX}${uri}:${generation}:${index}`;

async function* modelRecords(storage: DurableObjectStorage): AsyncGenerator<[string, ModelRecord]> {
  let startAfter: string | undefined;
  while (true) {
    const page = await storage.list<ModelRecord>({ prefix: META_PREFIX, limit: 128, startAfter });
    if (!page.size) return;
    for (const entry of page) yield entry;
    if (page.size < 128) return;
    startAfter = [...page.keys()].at(-1);
  }
}

/** Publish the pointer only after every chunk is durable (128KiB value limit). */
export async function persistLspModels(storage: DurableObjectStorage, update: LspModelUpdate): Promise<void> {
  if (update.document) {
    const { uri, modelJson } = update.document;
    const old = await storage.get<ModelRecord>(META_PREFIX + uri);
    const generation = crypto.randomUUID();
    const count = Math.ceil(modelJson.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await storage.put(chunkKey(uri, generation, i), modelJson.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await storage.put(META_PREFIX + uri, { generation, count });
    if (old) for (let i = 0; i < old.count; i++) await storage.delete(chunkKey(uri, old.generation, i));
  }
  if (update.retain) {
    const retained = new Set(update.retain);
    for await (const [key, record] of modelRecords(storage)) {
      const uri = key.slice(META_PREFIX.length);
      if (retained.has(uri)) continue;
      await storage.delete(key);
      for (let i = 0; i < record.count; i++) await storage.delete(chunkKey(uri, record.generation, i));
    }
  }
}

/** Stream one model at a time so cold wake never duplicates the full JSON corpus. */
export async function replayLspModels(
  storage: DurableObjectStorage,
  sync: (update: LspModelUpdate) => Promise<void>
): Promise<void> {
  const uris: string[] = [];
  for await (const [key, record] of modelRecords(storage)) {
    const uri = key.slice(META_PREFIX.length);
    const chunks: string[] = [];
    for (let i = 0; i < record.count; i++) {
      const chunk = await storage.get<string>(chunkKey(uri, record.generation, i));
      if (chunk === undefined) throw new Error('Incomplete persisted LSP model');
      chunks.push(chunk);
    }
    await sync({ document: { uri, modelJson: chunks.join('') } });
    uris.push(uri);
  }
  if (uris.length) await sync({ retain: uris });
}

export async function purgeLspModels(storage: DurableObjectStorage): Promise<void> {
  for (const prefix of [META_PREFIX, CHUNK_PREFIX]) {
    while (true) {
      const keys = [...(await storage.list({ prefix, limit: 128 })).keys()];
      if (!keys.length) break;
      await storage.delete(keys);
    }
  }
}
