// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { deleteInstance, writeInstance } from '../opfs/instances-fs.js';
import type { OpfsFs } from '../opfs/opfs-fs.js';
import type { InstanceRecord } from '@rune-langium/codegen/instances';
import { withInstrumentation } from '../services/instrumentation/core.js';

interface PersistenceContext {
  fs: OpfsFs;
  workspaceRoot: string;
}

const tails = new Map<string, Promise<void>>();

function key(context: PersistenceContext, id: string): string {
  return `${context.workspaceRoot}\u0000${id}`;
}

function enqueue(context: PersistenceContext, id: string, operation: () => Promise<void>): Promise<void> {
  const queueKey = key(context, id);
  const previous = tails.get(queueKey) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  tails.set(queueKey, current);
  void current
    .finally(() => {
      if (tails.get(queueKey) === current) tails.delete(queueKey);
    })
    .catch(() => undefined);
  return current;
}

export const persistInstance = withInstrumentation(
  function persistInstance(context: PersistenceContext | undefined, record: InstanceRecord): Promise<void> {
    if (!context) return Promise.resolve();
    return enqueue(context, record.id, () => writeInstance(context.fs, context.workspaceRoot, record));
  },
  { op: 'persistInstance' }
);

export const persistDelete = withInstrumentation(
  function persistDelete(context: PersistenceContext | undefined, id: string): Promise<void> {
    if (!context) return Promise.resolve();
    return enqueue(context, id, () => deleteInstance(context.fs, context.workspaceRoot, id));
  },
  { op: 'persistDelete' }
);

export const flushPersistedInstance = withInstrumentation(
  function flushPersistedInstance(context: PersistenceContext | undefined, id: string): Promise<void> {
    if (!context) return Promise.resolve();
    return tails.get(key(context, id)) ?? Promise.resolve();
  },
  { op: 'flushPersistedInstance' }
);

export const instancePersistenceContext = withInstrumentation(
  function instancePersistenceContext(
    fs: OpfsFs | undefined,
    workspaceRoot: string | undefined
  ): PersistenceContext | undefined {
    return fs && workspaceRoot ? { fs, workspaceRoot } : undefined;
  },
  { op: 'instancePersistenceContext' }
);
