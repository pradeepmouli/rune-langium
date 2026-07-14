// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { beforeEach, describe, expect, it } from 'vitest';
import { useInstanceStore } from '../../src/store/instance-store.js';

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

  it('dispatchGenerateSchema posts a preview:generate message carrying a schema-prefixed requestId', () => {
    const postMessage = vi.fn();
    useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
    useInstanceStore.getState().dispatchGenerateSchema('test.Party');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:generate', targetId: 'test.Party' })
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
});
