// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

class FakeApi {
  panels: Array<{ api: { component: string } }> = [];
  clear = vi.fn(() => {
    this.panels = [];
  });
  fromJSON = vi.fn((json: { component?: string }) => {
    if (json.component) this.panels = [{ api: { component: json.component } }];
  });
  toJSON = vi.fn(() => ({ component: 'editor' }));
  onDidLayoutChange = vi.fn(() => ({ dispose: disposeListener }));
}

const disposeListener = vi.fn();
let api: FakeApi;

vi.mock('dockview-react', () => ({
  DockviewReact(props: { components: Record<string, ComponentType>; onReady(event: { api: FakeApi }): void }) {
    api = new FakeApi();
    props.onReady({ api });
    return (
      <div data-testid="dockview-react-mock">
        {Object.entries(props.components).map(([name, Panel]) => (
          <Panel key={name} />
        ))}
      </div>
    );
  }
}));

import { resetWorkbench, WorkbenchHost } from '../../src/shell/WorkbenchHost.js';
import type { WorkbenchDefinition } from '../../src/shell/workbench-types.js';

function EditorPanel() {
  return <div data-testid="editor-panel">editor</div>;
}

function definition(buildDefault = vi.fn()): WorkbenchDefinition {
  return {
    id: 'prototype',
    panels: { editor: EditorPanel },
    titles: { editor: 'Editor' },
    buildDefault
  };
}

afterEach(() => {
  disposeListener.mockClear();
});

describe('WorkbenchHost', () => {
  it('mounts stable domain panels through the definition context', () => {
    render(
      <WorkbenchHost
        definition={definition()}
        initialNativeLayout={{ component: 'editor' }}
        onNativeLayoutChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('editor-panel')).toHaveTextContent('editor');
  });

  it('rejects unknown and empty restored layouts, then rebuilds only this host', () => {
    const buildDefault = vi.fn();
    render(
      <WorkbenchHost
        definition={definition(buildDefault)}
        initialNativeLayout={{ component: 'unknown' }}
        onNativeLayoutChange={vi.fn()}
      />
    );
    expect(api.clear).toHaveBeenCalledOnce();
    expect(buildDefault).toHaveBeenCalledOnce();
  });

  it('rebuilds when a native layout restores no panels', () => {
    const buildDefault = vi.fn();
    render(
      <WorkbenchHost definition={definition(buildDefault)} initialNativeLayout={{}} onNativeLayoutChange={vi.fn()} />
    );
    expect(api.clear).toHaveBeenCalledOnce();
    expect(buildDefault).toHaveBeenCalledOnce();
  });

  it('disposes the layout listener on unmount', () => {
    const { unmount } = render(<WorkbenchHost definition={definition()} onNativeLayoutChange={vi.fn()} />);
    unmount();
    expect(disposeListener).toHaveBeenCalled();
  });

  it('resets the supplied host without touching another definition', () => {
    const buildDefault = vi.fn();
    const otherDefault = vi.fn();
    const current = definition(buildDefault);
    resetWorkbench(api as never, current, 960);
    expect(api.clear).toHaveBeenCalledOnce();
    expect(buildDefault).toHaveBeenCalledWith(api, 960);
    expect(otherDefault).not.toHaveBeenCalled();
  });
});
