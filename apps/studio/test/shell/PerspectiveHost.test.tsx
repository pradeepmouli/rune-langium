// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, act } from '@testing-library/react';
import { PerspectiveHost } from '../../src/shell/perspectives/PerspectiveHost.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

let exploreMountCount = 0;
function ExploreProbe() {
  useEffect(() => {
    exploreMountCount += 1;
  }, []);
  return <div data-testid="explore-probe" />;
}

describe('PerspectiveHost', () => {
  beforeEach(() => {
    exploreMountCount = 0;
    usePerspectiveStore.setState({ activePerspective: 'explore' });
  });

  it('keeps Explore mounted (never remounts) across a switch away and back', () => {
    render(<PerspectiveHost explore={<ExploreProbe />} hasWorkspace />);
    const slot = () => screen.getByTestId('explore-probe').closest('[data-perspective-slot="explore"]') as HTMLElement;
    expect(exploreMountCount).toBe(1);
    expect(slot().style.display).not.toBe('none'); // visible when active

    act(() => usePerspectiveStore.getState().setActivePerspective('settings'));
    // Explore probe still in the DOM (kept alive), just hidden — NOT remounted
    expect(exploreMountCount).toBe(1);
    expect(screen.getByTestId('explore-probe')).toBeTruthy();
    expect(slot().style.display).toBe('none');
    expect(screen.getByTestId('settings-perspective')).toBeTruthy(); // the active screen renders

    act(() => usePerspectiveStore.getState().setActivePerspective('explore'));
    expect(exploreMountCount).toBe(1); // STILL 1 — definitive: no remount
    expect(slot().style.display).not.toBe('none');
  });

  it('git/export require a workspace (not rendered without one)', () => {
    usePerspectiveStore.setState({ activePerspective: 'git' });
    render(<PerspectiveHost explore={<ExploreProbe />} hasWorkspace={false} />);
    expect(screen.queryByTestId('git-perspective')).toBeNull();
  });
});
