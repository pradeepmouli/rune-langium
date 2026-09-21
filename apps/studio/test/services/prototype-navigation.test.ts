// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/shell/workbench-settings.js', () => ({
  readWorkbenchSettings: vi.fn(async (_workspaceId: string, _key: string, fallback: unknown) => fallback),
  writeWorkbenchSettings: vi.fn(async () => undefined)
}));
import { requestPrototype, usePrototypeNavigationStore } from '../../src/services/prototype-navigation.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';
import { usePrototypeViewStore } from '../../src/store/prototype-view-store.js';
import { useInstanceStore } from '../../src/store/instance-store.js';

describe('prototype navigation', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, saveStates: {}, recordRevisions: {} });
    usePrototypeViewStore.setState({
      workspaceId: 'one',
      state: {
        selectedId: null,
        query: '',
        typeFqn: null,
        inspectorTab: 'form',
        graphVisible: false,
        compactPane: 'inspector'
      }
    });
    usePrototypeNavigationStore.setState({ pending: null });
  });

  it('opens an existing instance without creating a duplicate', () => {
    const existingId = useInstanceStore.getState().createInstance('test.Party', 'Existing');
    const before = Object.keys(useInstanceStore.getState().instances).length;
    requestPrototype({ kind: 'open', instanceId: existingId });

    expect(Object.keys(useInstanceStore.getState().instances)).toHaveLength(before);
    expect(usePerspectiveStore.getState().activePerspective).toBe('prototype');
    expect(usePrototypeViewStore.getState().state.selectedId).toBe(existingId);
  });

  it('does not consume a create intent after a workspace switch', () => {
    requestPrototype({ kind: 'create', seed: { typeFqn: 'test.Party', data: { name: 'Alice' } } });
    expect(usePrototypeNavigationStore.getState().consume('two')).toBeNull();
    expect(usePrototypeNavigationStore.getState().consume('one')).toMatchObject({ kind: 'create' });
  });
});
