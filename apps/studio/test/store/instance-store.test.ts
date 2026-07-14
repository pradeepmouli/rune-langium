// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { beforeEach, describe, expect, it } from 'vitest';
import { useInstanceStore } from '../../src/store/instance-store.js';
import { OpfsFs } from '../../src/opfs/opfs-fs.js';
import { readInstance, writeInstance } from '../../src/opfs/instances-fs.js';
import { createOpfsRoot } from '../setup/opfs-mock.js';

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('instance-store', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {} });
  });

  it('createInstance adds a record keyed by id, with provenance defaulting to manual authoring', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    const record = useInstanceStore.getState().instances[id];
    expect(record?.name).toBe('My Party');
    expect(record?.typeFqn).toBe('test.Party');
    expect(record?.data).toEqual({});
  });

  it('updateInstanceData replaces the record data with the full given object and bumps modifiedAt', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    const before = useInstanceStore.getState().instances[id]!.modifiedAt;
    useInstanceStore.getState().updateInstanceData(id, { name: 'Acme' });
    const after = useInstanceStore.getState().instances[id]!;
    expect(after.data).toEqual({ name: 'Acme' });
    expect(after.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it('deleteInstance removes the record', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().removeInstance(id);
    expect(useInstanceStore.getState().instances[id]).toBeUndefined();
  });

  it('dispatchValidate posts an instance:validate message carrying a requestId the store can map back to the instance', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().dispatchValidate(id);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'instance:validate', typeFqn: 'test.Party' })
    );
  });

  it('receiveValidateResult resolves the requestId back to the originating instance id', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.getState().dispatchValidate(id);
    const requestId = postMessage.mock.calls[0]![0].requestId as string;

    useInstanceStore.getState().receiveValidateResult(requestId, [{ path: 'name', message: 'required' }]);
    expect(useInstanceStore.getState().validationErrors[id]).toEqual([{ path: 'name', message: 'required' }]);
  });

  it('drops an out-of-order validate response whose requestId is not the LATEST issued for that instance (finding #9)', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');

    useInstanceStore.getState().dispatchValidate(id);
    const firstRequestId = postMessage.mock.calls[0]![0].requestId as string;
    useInstanceStore.getState().dispatchValidate(id);
    const secondRequestId = postMessage.mock.calls[1]![0].requestId as string;

    // The newer request's response arrives first (fast); the older, now-stale
    // request's response arrives after it (out of order) — it must NOT
    // overwrite the newer diagnostics.
    useInstanceStore.getState().receiveValidateResult(secondRequestId, [{ path: 'name', message: 'fresh' }]);
    useInstanceStore.getState().receiveValidateResult(firstRequestId, [{ path: 'name', message: 'stale' }]);

    expect(useInstanceStore.getState().validationErrors[id]).toEqual([{ path: 'name', message: 'fresh' }]);
  });

  it('dispatchGenerateSchema posts an instance:generateSchema message on its own channel (not preview:generate — finding #6/#7)', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    useInstanceStore.getState().dispatchGenerateSchema('test.Party');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'instance:generateSchema', typeFqn: 'test.Party' })
    );
    const requestId = postMessage.mock.calls[0]![0].requestId as string;
    expect(requestId.startsWith('schema:')).toBe(true);
  });

  it('receiveSchemaResult resolves a pending schema request and populates the schemas map', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    useInstanceStore.getState().dispatchGenerateSchema('test.Party');
    const requestId = postMessage.mock.calls[0]![0].requestId as string;

    const schema = { schemaVersion: 1, targetId: 'test.Party', title: 'Party', status: 'ready', fields: [] } as never;
    const handled = useInstanceStore.getState().receiveSchemaResult(requestId, schema);

    expect(handled).toBe(true);
    expect(useInstanceStore.getState().schemas.get('test.Party')).toEqual(schema);
  });

  it('receiveSchemaResult returns false and leaves schemas untouched for a requestId it does not own', () => {
    // Distinct targetId from other cases in this file, so a prior test's
    // legitimately-populated cache entry can't make this assertion pass
    // for the wrong reason.
    const schema = {
      schemaVersion: 1,
      targetId: 'test.UnrelatedNotOwned',
      title: 'Unrelated',
      status: 'ready',
      fields: []
    } as never;
    const handled = useInstanceStore.getState().receiveSchemaResult('preview:test.Other:1', schema);

    expect(handled).toBe(false);
    expect(useInstanceStore.getState().schemas.has('test.UnrelatedNotOwned')).toBe(false);
  });

  it('receiveSchemaStale records a per-typeFqn schema error for a pending schema request (finding #7)', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    useInstanceStore.getState().dispatchGenerateSchema('test.Unsupported');
    const requestId = postMessage.mock.calls[0]![0].requestId as string;

    const handled = useInstanceStore
      .getState()
      .receiveSchemaStale(requestId, 'unsupported-target', 'No form preview schema is available for test.Unsupported.');

    expect(handled).toBe(true);
    expect(useInstanceStore.getState().schemaErrors.get('test.Unsupported')).toEqual({
      reason: 'unsupported-target',
      message: 'No form preview schema is available for test.Unsupported.'
    });
  });

  it('receiveSchemaStale returns false for a requestId it does not own', () => {
    const handled = useInstanceStore.getState().receiveSchemaStale('schema:test.Other:99', 'no-files', 'x');
    expect(handled).toBe(false);
  });

  it('receiveSchemaStale invalidates a previously-cached schema for the same typeFqn (Codex round-2 finding #3)', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);

    // Seed a successful cached schema first.
    useInstanceStore.getState().dispatchGenerateSchema('test.Stale');
    const okRequestId = postMessage.mock.calls[0]![0].requestId as string;
    const schema = {
      schemaVersion: 1,
      targetId: 'test.Stale',
      title: 'Stale',
      status: 'ready',
      fields: []
    } as never;
    useInstanceStore.getState().receiveSchemaResult(okRequestId, schema);
    expect(useInstanceStore.getState().schemas.get('test.Stale')).toEqual(schema);

    // A later fetch for the SAME typeFqn comes back stale (e.g. the type was
    // removed/broken by a model edit) — the stale cached schema must not
    // survive, or InstanceFormPanel will keep rendering it forever.
    useInstanceStore.getState().dispatchGenerateSchema('test.Stale');
    const staleRequestId = postMessage.mock.calls[1]![0].requestId as string;
    useInstanceStore.getState().receiveSchemaStale(staleRequestId, 'parse-error', 'boom');

    expect(useInstanceStore.getState().schemas.get('test.Stale')).toBeUndefined();
    expect(useInstanceStore.getState().schemaErrors.get('test.Stale')).toEqual({
      reason: 'parse-error',
      message: 'boom'
    });
  });

  it('receiveSchemaResult clears a prior schemaError for the same typeFqn once a fresh schema arrives', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    useInstanceStore.getState().dispatchGenerateSchema('test.Recovered');
    const staleRequestId = postMessage.mock.calls[0]![0].requestId as string;
    useInstanceStore.getState().receiveSchemaStale(staleRequestId, 'parse-error', 'boom');
    expect(useInstanceStore.getState().schemaErrors.has('test.Recovered')).toBe(true);

    useInstanceStore.getState().dispatchGenerateSchema('test.Recovered');
    const okRequestId = postMessage.mock.calls[1]![0].requestId as string;
    const schema = {
      schemaVersion: 1,
      targetId: 'test.Recovered',
      title: 'Recovered',
      status: 'ready',
      fields: []
    } as never;
    useInstanceStore.getState().receiveSchemaResult(okRequestId, schema);

    expect(useInstanceStore.getState().schemaErrors.has('test.Recovered')).toBe(false);
  });
});

describe('instance-store — OPFS persistence (finding #1)', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, validationErrors: {}, schemas: new Map(), schemaErrors: new Map() });
  });

  it('createInstance persists the new record to OPFS', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    useInstanceStore.getState().setOpfsContext(fs, '/ws1');
    await flush();

    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    await flush();

    const persisted = await readInstance(fs, '/ws1', id);
    expect(persisted.name).toBe('My Party');
    expect(persisted.typeFqn).toBe('test.Party');
  });

  it('updateInstanceData persists the updated record to OPFS on every edit', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    useInstanceStore.getState().setOpfsContext(fs, '/ws1');
    await flush();

    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    await flush();
    useInstanceStore.getState().updateInstanceData(id, { name: 'Acme' });
    await flush();

    const persisted = await readInstance(fs, '/ws1', id);
    expect(persisted.data).toEqual({ name: 'Acme' });
  });

  it('removeInstance deletes the persisted record from OPFS', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    useInstanceStore.getState().setOpfsContext(fs, '/ws1');
    await flush();

    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    await flush();
    useInstanceStore.getState().removeInstance(id);
    await flush();

    await expect(readInstance(fs, '/ws1', id)).rejects.toThrow();
  });

  it('setOpfsContext loads previously-persisted instances back into the store on workspace open', async () => {
    const fs = new OpfsFs(createOpfsRoot() as never);
    await writeInstance(fs, '/ws1', {
      id: '01J000000000000000000001',
      name: 'Restored Party',
      typeFqn: 'test.Party',
      data: { name: 'Acme' },
      createdAt: 1000,
      modifiedAt: 1000
    });

    useInstanceStore.getState().setOpfsContext(fs, '/ws1');
    await flush();

    expect(useInstanceStore.getState().instances['01J000000000000000000001']).toMatchObject({
      name: 'Restored Party',
      typeFqn: 'test.Party'
    });
  });

  it('setOpfsContext on a workspace switch clears the PREVIOUS workspace instances instead of merging them', async () => {
    const fsA = new OpfsFs(createOpfsRoot() as never);
    useInstanceStore.getState().setOpfsContext(fsA, '/ws-a');
    await flush();
    useInstanceStore.getState().createInstance('test.Party', 'In A');
    await flush();
    expect(Object.keys(useInstanceStore.getState().instances)).toHaveLength(1);

    const fsB = new OpfsFs(createOpfsRoot() as never);
    useInstanceStore.getState().setOpfsContext(fsB, '/ws-b');
    await flush();

    expect(Object.keys(useInstanceStore.getState().instances)).toHaveLength(0);
  });

  it('gracefully no-ops (does not throw) when no OpfsFs context has been set yet', () => {
    expect(() => useInstanceStore.getState().createInstance('test.Party', 'My Party')).not.toThrow();
  });
});
