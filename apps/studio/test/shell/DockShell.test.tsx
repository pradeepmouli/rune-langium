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

interface FakePanelSpy {
  api: { setActive: () => void; updateParameters: (parameters: unknown) => void };
  activeCalls: number;
  parameterCalls: unknown[];
  group: FakeGroupSpy;
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
  defaultTabComponent: unknown;
  onReady: ((ev: { api: FakeApi }) => void) | undefined;
}

const captured: CapturedReady = { components: {}, defaultTabComponent: undefined, onReady: undefined };
let lastApi: FakeApi | null = null;

class FakeApi {
  panels: Array<{ id: string; component: string }> = [];
  cleared = 0;
  groups = new Map<string, FakeGroupSpy>();
  panelStates = new Map<string, FakePanelSpy>();
  private layoutChangeListener: (() => void) | null = null;
  onDidLayoutChange = (listener: () => void) => {
    this.layoutChangeListener = listener;
    return {
      dispose: () => {
        if (this.layoutChangeListener === listener) {
          this.layoutChangeListener = null;
        }
      }
    };
  };
  addPanel = (opts: { id: string; component: string }) => {
    this.panels.push(opts);
    const group = makeFakeGroup();
    const panelSpy: FakePanelSpy = {
      activeCalls: 0,
      parameterCalls: [],
      api: {
        setActive: () => {
          panelSpy.activeCalls++;
        },
        updateParameters: (parameters) => {
          panelSpy.parameterCalls.push(parameters);
        }
      },
      group
    };
    this.groups.set(opts.id, group);
    this.panelStates.set(opts.id, panelSpy);
    return {
      id: opts.id,
      api: panelSpy.api,
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
    this.layoutChangeListener?.();
  };
  getPanel = (id: string) => {
    const panel = this.panelStates.get(id);
    if (!panel) {
      return undefined;
    }
    return panel;
  };
}

vi.mock('dockview-react', () => ({
  DockviewReact(props: {
    components: Record<string, unknown>;
    defaultTabComponent?: unknown;
    onReady: (ev: { api: FakeApi }) => void;
  }) {
    captured.components = props.components;
    captured.defaultTabComponent = props.defaultTabComponent;
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
import { LAYOUT_SCHEMA_VERSION, PANEL_COMPONENT_NAMES } from '../../src/shell/layout-factory.js';

beforeEach(() => {
  captured.components = {};
  captured.defaultTabComponent = undefined;
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

  it('installs a custom dockview tab renderer for the header count pills', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(captured.defaultTabComponent).toBeTypeOf('function');
  });

  it('calls onLayoutChange on initial mount with current schema version', async () => {
    const onChange = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onLayoutChange={onChange} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.version).toBe(LAYOUT_SCHEMA_VERSION);
  });

  it('exposes role=application on the shell container', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(screen.getByRole('application', { name: /studio dock shell/i })).toBeInTheDocument();
  });

  it('keeps the shell stretched in flex layouts instead of shrinking to content width', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(screen.getByRole('application', { name: /studio dock shell/i })).toHaveClass('flex-1', 'min-w-0');
  });

  it('renders utility actions in the layout toolbar', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(screen.getByTestId('toggle-utilities')).toBeInTheDocument();
    expect(screen.getByTestId('reset-layout')).toBeInTheDocument();
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

  it('does not persist an intermediate empty native layout while reset is rebuilding panels', async () => {
    const onChange = vi.fn();
    render(<DockShell studioVersion="9.9.9" workspaceId="ws-1" onLayoutChange={onChange} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));

    fireEvent.click(screen.getByTestId('reset-layout'));

    const nativeLayouts = onChange.mock.calls
      .map((call) => call[0])
      .filter((layout) => layout?.dockview?.shape === 'native');
    expect(nativeLayouts).toHaveLength(0);
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last?.dockview).toHaveProperty('columns');
  });

  it('activates a requested dockview panel when focusPanel changes', async () => {
    // workspace.inspector is no longer a dockview panel (it renders inside CenterStackPanel),
    // so focusPanel with that component is a no-op at the dockview level.
    // Use workspace.problems (a real dockview panel) to verify the mechanism still works.
    function Harness() {
      const [focusPanel, setFocusPanel] = useState<{
        component: 'workspace.problems';
        nonce: number;
      } | null>(null);

      return (
        <>
          <button type="button" onClick={() => setFocusPanel({ component: 'workspace.problems', nonce: 1 })}>
            focus problems
          </button>
          <DockShell studioVersion="0.1.0" workspaceId="ws-1" focusPanel={focusPanel} />
        </>
      );
    }

    render(<Harness />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));

    // Record the call count before clicking so we can detect the delta.
    const callsBefore = lastApi?.panelStates.get('workspace.problems')?.activeCalls ?? 0;
    fireEvent.click(screen.getByText('focus problems'));
    const callsAfter = lastApi?.panelStates.get('workspace.problems')?.activeCalls ?? 0;

    expect(callsAfter - callsBefore).toBe(1);
  });

  it('updates dockview panel parameters when the header count metadata changes', async () => {
    function Harness() {
      const [count, setCount] = useState(2);
      return (
        <>
          <button type="button" onClick={() => setCount(5)}>
            update count
          </button>
          <DockShell studioVersion="0.1.0" workspaceId="ws-1" panelTabMeta={{ 'workspace.problems': { count } }} />
        </>
      );
    }

    render(<Harness />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));

    expect(lastApi?.panelStates.get('workspace.problems')?.parameterCalls).toContainEqual({ count: 2 });

    fireEvent.click(screen.getByText('update count'));

    expect(lastApi?.panelStates.get('workspace.problems')?.parameterCalls).toContainEqual({ count: 5 });
  });

  it('skips undefined panel metadata entries when applying dockview parameters', async () => {
    render(
      <DockShell
        studioVersion="0.1.0"
        workspaceId="ws-1"
        panelTabMeta={{ 'workspace.problems': undefined, 'workspace.output': { count: 3 } }}
      />
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));

    expect(lastApi?.panelStates.get('workspace.problems')?.parameterCalls).toEqual([]);
    expect(lastApi?.panelStates.get('workspace.output')?.parameterCalls).toContainEqual({ count: 3 });
  });

  it('renders dock tabs without crashing when params are missing', async () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));

    type TabMeta = { count?: number };
    const Tab = captured.defaultTabComponent as React.FC<{
      api: {
        title?: string;
        getParameters: () => TabMeta | undefined;
        onDidParametersChange: (listener: (next: TabMeta | undefined) => void) => { dispose(): void };
      };
      params?: TabMeta;
    }>;
    const onDidParametersChange = vi.fn().mockReturnValue({ dispose: vi.fn() });

    const { container } = render(
      <Tab
        api={{
          title: 'Files',
          getParameters: () => undefined,
          onDidParametersChange
        }}
        params={undefined}
      />
    );

    expect(container.querySelector('.studio-dock-tab__label')?.textContent).toBe('Files');
    expect(screen.queryByTitle(/item/)).toBeNull();
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

    expect(screen.getByTestId('layout-reset-notice')).toHaveTextContent(/saved layout was incompatible/i);
  });

  it('updates override panel content when parent state changes', async () => {
    // FileTree is defined at this scope (not inside Harness) to avoid creating
    // a new component identity on every Harness render (react-doctor/no-nested-component-definition).
    // It closes over a ref so Harness can push label updates without remounting.
    const labelRef = { current: 'initial file tree' };
    function FileTreeUpdates() {
      return <div>{labelRef.current}</div>;
    }

    function Harness() {
      const [label, setLabel] = useState('initial file tree');
      labelRef.current = label;
      return (
        <>
          <button type="button" onClick={() => setLabel('updated file tree')}>
            update panel
          </button>
          <DockShell
            studioVersion="0.1.0"
            workspaceId="ws-1"
            panelComponents={{ 'workspace.fileTree': FileTreeUpdates }}
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

    // Defined outside Harness to avoid new component identity per render
    // (react-doctor/no-nested-component-definition).
    const remountLabelRef = { current: 'initial file tree' };
    function FileTreeNoRemount() {
      useState(() => {
        mountSpy();
        return 0;
      });
      return <div>{remountLabelRef.current}</div>;
    }

    function Harness() {
      const [label, setLabel] = useState('initial file tree');
      remountLabelRef.current = label;
      return (
        <>
          <button type="button" onClick={() => setLabel('updated file tree')}>
            update panel
          </button>
          <DockShell
            studioVersion="0.1.0"
            workspaceId="ws-1"
            panelComponents={{ 'workspace.fileTree': FileTreeNoRemount }}
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
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true }));
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
    expect(screen.getByTestId('dirty-foo.rosetta')).not.toBe(screen.getByLabelText(/Close foo\.rosetta/i));
  });
});
