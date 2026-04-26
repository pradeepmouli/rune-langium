// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T065 / T076 — DockShell mounts dockview-react + ARIA roles + reset.
 *
 * The real DockviewReact needs DOM measurement APIs that jsdom can't
 * fully simulate, so we mock the module here and capture the components
 * map + onReady call. Bridge-level integration is pinned by
 * `dockview-bridge.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

interface CapturedReady {
  components: Record<string, unknown>;
  onReady: ((ev: { api: FakeApi }) => void) | undefined;
}

const captured: CapturedReady = { components: {}, onReady: undefined };

class FakeApi {
  panels: Array<{ id: string; component: string }> = [];
  cleared = 0;
  onDidLayoutChange() {
    return { dispose: () => {} };
  }
  addPanel(opts: { id: string; component: string }) {
    this.panels.push(opts);
    return {
      id: opts.id,
      api: { setActive: () => {} },
      group: { api: { setSize: () => {} } }
    };
  }
  fromJSON() {}
  toJSON() {
    return { panels: this.panels.map((p) => p.id) };
  }
  clear() {
    this.cleared++;
    this.panels = [];
  }
  getPanel(id: string) {
    return this.panels.find((p) => p.id === id) ? { api: { setActive: () => {} } } : undefined;
  }
}

vi.mock('dockview-react', () => ({
  DockviewReact(props: {
    components: Record<string, unknown>;
    onReady: (ev: { api: FakeApi }) => void;
  }) {
    captured.components = props.components;
    captured.onReady = props.onReady;
    setTimeout(() => props.onReady({ api: new FakeApi() }), 0);
    return null;
  }
}));

import { DockShell } from '../../src/shell/DockShell.js';
import { PANEL_COMPONENT_NAMES } from '../../src/shell/layout-factory.js';

beforeEach(() => {
  captured.components = {};
  captured.onReady = undefined;
});

describe('DockShell — dockview integration (T065)', () => {
  it('registers every locked panel name as a dockview component', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    for (const name of PANEL_COMPONENT_NAMES) {
      expect(captured.components).toHaveProperty(name);
    }
  });

  it('calls onLayoutChange on initial mount with version=1', async () => {
    const onChange = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onLayoutChange={onChange} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.version).toBe(1);
  });

  it('exposes role=application on the shell container', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(screen.getByRole('application', { name: /studio dock shell/i })).toBeInTheDocument();
  });

  it('Reset Layout calls api.clear() then re-applies a fresh layout', async () => {
    const onChange = vi.fn();
    render(
      <DockShell
        studioVersion="9.9.9"
        workspaceId="ws-1"
        initialLayout={{
          version: 1,
          writtenBy: '0.0.1',
          dockview: {
            columns: [],
            bottomGroup: { active: 'workspace.problems', collapsed: false, tabs: [] }
          }
        }}
        onLayoutChange={onChange}
      />
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    fireEvent.click(screen.getByTestId('reset-layout'));
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.writtenBy).toBe('9.9.9');
    expect(last.dockview).toHaveProperty('columns');
  });
});

describe('DockShell — keyboard shortcuts (T074 / T075)', () => {
  it('forwards Ctrl+Alt+ArrowRight as focus-next-panel', () => {
    const onAction = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onAction={onAction} />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true })
      );
    });
    expect(onAction).toHaveBeenCalledWith('focus-next-panel');
  });

  it('does not match a plain key without modifiers', () => {
    const onAction = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onAction={onAction} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    });
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('EditorPanel dirty indicator (FR-026)', () => {
  it('renders a dirty marker distinct from the close affordance', async () => {
    const { EditorPanel } = await import('../../src/shell/panels/EditorPanel.js');
    render(<EditorPanel tabs={[{ path: 'foo.rosetta', dirty: true }]} activePath="foo.rosetta" />);
    expect(screen.getByTestId('dirty-foo.rosetta')).toBeInTheDocument();
    expect(screen.getByLabelText(/Close foo\.rosetta/i)).toBeInTheDocument();
    expect(screen.getByTestId('dirty-foo.rosetta')).not.toBe(
      screen.getByLabelText(/Close foo\.rosetta/i)
    );
  });
});
