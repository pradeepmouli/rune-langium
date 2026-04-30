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
import { useState } from 'react';

interface FakeGroupSpy {
  api: { setSize: (s: { width?: number; height?: number }) => void };
  sizeCalls: Array<{ width?: number; height?: number }>;
}

function makeFakeGroup(): FakeGroupSpy {
  const spy: FakeGroupSpy = {
    sizeCalls: [],
    api: { setSize: (s) => spy.sizeCalls.push(s) }
  };
  return spy;
}

interface CapturedReady {
  components: Record<string, unknown>;
  onReady: ((ev: { api: FakeApi }) => void) | undefined;
}

const captured: CapturedReady = { components: {}, onReady: undefined };
let lastApi: FakeApi | null = null;

class FakeApi {
  panels: Array<{ id: string; component: string }> = [];
  cleared = 0;
  groups = new Map<string, FakeGroupSpy>();
  onDidLayoutChange = () => {
    return { dispose: () => {} };
  };
  addPanel = (opts: { id: string; component: string }) => {
    this.panels.push(opts);
    const group = makeFakeGroup();
    this.groups.set(opts.id, group);
    return {
      id: opts.id,
      api: { setActive: () => {} },
      group
    };
  };
  fromJSON = () => {};
  toJSON = () => {
    return { panels: this.panels.map((p) => p.id) };
  };
  clear = () => {
    this.cleared++;
    this.panels = [];
  };
  getPanel = (id: string) => {
    const panel = this.panels.find((p) => p.id === id);
    if (!panel) {
      return undefined;
    }
    return {
      api: { setActive: () => {} },
      group: this.groups.get(id)
    };
  };
}

vi.mock('dockview-react', () => ({
  DockviewReact(props: {
    components: Record<string, unknown>;
    onReady: (ev: { api: FakeApi }) => void;
  }) {
    captured.components = props.components;
    captured.onReady = props.onReady;
    setTimeout(() => {
      lastApi = new FakeApi();
      props.onReady({ api: lastApi });
    }, 0);
    return (
      <div data-testid="dockview-react-mock">
        {Object.entries(props.components).map(([name, Component]) => {
          const Panel = Component as React.FC;
          return (
            <div key={name} data-testid={`dockview-panel-${name}`}>
              <Panel />
            </div>
          );
        })}
      </div>
    );
  }
}));

import { DockShell } from '../../src/shell/DockShell.js';
import { PANEL_COMPONENT_NAMES } from '../../src/shell/layout-factory.js';

beforeEach(() => {
  captured.components = {};
  captured.onReady = undefined;
  lastApi = null;
});

describe('DockShell — dockview integration (T065)', () => {
  it('registers every locked panel name as a dockview component', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    for (const name of PANEL_COMPONENT_NAMES) {
      expect(captured.components).toHaveProperty(name);
    }
  });

  it('calls onLayoutChange on initial mount with version=2', async () => {
    const onChange = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onLayoutChange={onChange} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.version).toBe(2);
  });

  it('exposes role=application on the shell container', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(screen.getByRole('application', { name: /studio dock shell/i })).toBeInTheDocument();
  });

  it('renders layout preset controls above the dock surface', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    const header = screen.getByRole('toolbar', { name: /studio layout presets/i });
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('Navigate');
    expect(header).toHaveTextContent('Edit');
    expect(header).toHaveTextContent('Preview');
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

  it('surfaces a user-visible notice when an invalid saved factory layout is reset', () => {
    render(
      <DockShell
        studioVersion="0.1.0"
        workspaceId="ws-1"
        initialLayout={{
          version: 1,
          writtenBy: '0.0.1',
          dockview: {
            shape: 'factory',
            columns: null as never,
            bottomGroup: {
              active: 'workspace.problems',
              collapsed: false,
              tabs: [{ component: 'workspace.problems' }]
            }
          }
        }}
      />
    );

    expect(screen.getByTestId('layout-reset-notice')).toHaveTextContent(
      /saved layout was incompatible/i
    );
  });

  it('updates override panel content when parent state changes', async () => {
    function Harness() {
      const [label, setLabel] = useState('initial file tree');
      const FileTree = () => <div>{label}</div>;
      return (
        <>
          <button type="button" onClick={() => setLabel('updated file tree')}>
            update panel
          </button>
          <DockShell
            studioVersion="0.1.0"
            workspaceId="ws-1"
            panelComponents={{ 'workspace.fileTree': FileTree }}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByText('initial file tree')).toBeInTheDocument();
    fireEvent.click(screen.getByText('update panel'));
    expect(screen.getByText('updated file tree')).toBeInTheDocument();
  });

  it('does not remount override panel content when parent state changes', async () => {
    const mountSpy = vi.fn();

    function Harness() {
      const [label, setLabel] = useState('initial file tree');
      const FileTree = () => {
        useState(() => {
          mountSpy();
          return 0;
        });
        return <div>{label}</div>;
      };
      return (
        <>
          <button type="button" onClick={() => setLabel('updated file tree')}>
            update panel
          </button>
          <DockShell
            studioVersion="0.1.0"
            workspaceId="ws-1"
            panelComponents={{ 'workspace.fileTree': FileTree }}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByText('initial file tree')).toBeInTheDocument();
    expect(mountSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('update panel'));
    expect(screen.getByText('updated file tree')).toBeInTheDocument();
    expect(mountSpy).toHaveBeenCalledTimes(1);
  });

  it('collapses and restores the utility tray height when toggled', async () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    const toggle = screen.getByTestId('toggle-utilities');
    const sizeCalls = lastApi?.groups?.get('workspace.problems')?.sizeCalls ?? [];

    if (toggle.textContent?.match(/show utilities/i)) {
      fireEvent.click(toggle);
      expect(sizeCalls[sizeCalls.length - 1]).toEqual({ height: 220 });
      fireEvent.click(toggle);
      expect(sizeCalls[sizeCalls.length - 1]).toEqual({ height: 0 });
      return;
    }

    fireEvent.click(toggle);
    expect(sizeCalls[sizeCalls.length - 1]).toEqual({ height: 0 });
    fireEvent.click(toggle);
    expect(sizeCalls[sizeCalls.length - 1]).toEqual({ height: 220 });
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
