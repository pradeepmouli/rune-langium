// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, expect, it } from 'vitest';
import { useExportNavigationStore } from '../../src/services/export-navigation.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

beforeEach(() => {
  useExportNavigationStore.setState({ pending: undefined });
  usePerspectiveStore.setState({ activePerspective: 'explore' });
});

it('switches to Export with an immutable workspace-scoped declaration selection', () => {
  const selection = { namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] };
  useExportNavigationStore.getState().openExport('workspace-a', selection);
  selection.declarations[0]!.name = 'Changed';

  expect(usePerspectiveStore.getState().activePerspective).toBe('export');
  expect(useExportNavigationStore.getState().consume('workspace-b')).toBeUndefined();
  expect(useExportNavigationStore.getState().consume('workspace-a')?.selection).toEqual({
    namespaces: [],
    declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }]
  });
});
