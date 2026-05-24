// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceStateContext, useWorkspace, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';

function Probe() {
  const ws = useWorkspace();
  return <span data-testid="probe">{ws.workspaceId ?? 'none'}:{ws.fileCount}</span>;
}

const value: WorkspaceState = {
  workspaceId: 'ws-1', workspaceKind: 'browser-only', workspaceName: 'P', fileCount: 2,
  files: [], models: [], parsedModels: [], deferredExports: []
};

describe('useWorkspace', () => {
  it('throws outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(/within a WorkspaceProvider/);
  });
  it('reads the provided value', () => {
    render(<WorkspaceStateContext.Provider value={value}><Probe /></WorkspaceStateContext.Provider>);
    expect(screen.getByTestId('probe').textContent).toBe('ws-1:2');
  });
});
