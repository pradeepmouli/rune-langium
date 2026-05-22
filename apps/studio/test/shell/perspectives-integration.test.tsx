// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../../src/shell/ActivityBar.js';
import { PerspectiveHost } from '../../src/shell/perspectives/PerspectiveHost.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

// Mock the four screens to isolate the rail↔host wiring (each has its own tests).
vi.mock('../../src/shell/perspectives/screens/WorkspacesPerspective.js', () => ({
  WorkspacesPerspective: () => <div data-testid="workspaces-perspective" />
}));
vi.mock('../../src/shell/perspectives/screens/SettingsPerspective.js', () => ({
  SettingsPerspective: () => <div data-testid="settings-perspective" />
}));
vi.mock('../../src/shell/perspectives/screens/GitSyncPerspective.js', () => ({
  GitSyncPerspective: () => <div data-testid="git-perspective" />
}));
vi.mock('../../src/shell/perspectives/screens/ExportPerspective.js', () => ({
  ExportPerspective: () => <div data-testid="export-perspective" />
}));

let exploreMounts = 0;
function ExploreProbe() {
  useEffect(() => {
    exploreMounts += 1;
  }, []);
  return <div data-testid="explore-probe" />;
}

function Shell({ hasWorkspace }: { hasWorkspace: boolean }) {
  return (
    <>
      <ActivityBar hasWorkspace={hasWorkspace} />
      <PerspectiveHost hasWorkspace={hasWorkspace} explore={<ExploreProbe />} />
    </>
  );
}

describe('perspectives rail↔host integration', () => {
  beforeEach(() => {
    exploreMounts = 0;
    usePerspectiveStore.setState({ activePerspective: 'explore' });
  });

  it('rail click swaps the content region', () => {
    render(<Shell hasWorkspace />);
    expect(screen.getByTestId('explore-probe')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rail-git'));
    expect(screen.getByTestId('git-perspective')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rail-settings'));
    expect(screen.getByTestId('settings-perspective')).toBeTruthy();
  });

  it('keeps Explore mounted (never remounts) across rail switches', () => {
    render(<Shell hasWorkspace />);
    expect(exploreMounts).toBe(1);
    fireEvent.click(screen.getByTestId('rail-git'));
    fireEvent.click(screen.getByTestId('rail-export'));
    fireEvent.click(screen.getByTestId('rail-explore'));
    expect(exploreMounts).toBe(1); // definitive keep-alive across multiple switches
  });

  it('disables git/export in the rail without a workspace; workspaces is the entry', () => {
    usePerspectiveStore.setState({ activePerspective: 'workspaces' });
    render(<Shell hasWorkspace={false} />);
    expect((screen.getByTestId('rail-git') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('rail-export') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('rail-explore') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('workspaces-perspective')).toBeTruthy();
  });
});
