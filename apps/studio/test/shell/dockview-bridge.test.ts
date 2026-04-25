// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * dockview-bridge — pins the layout-shape → dockview-API conversion.
 * Real dockview can't run in jsdom; this exercises the bridge against a
 * spy-API that records every call so we can assert the addPanel ordering,
 * group inheritance, and active-panel selection.
 */

import { describe, it, expect } from 'vitest';
import { applyLayout, isFactoryShape, serializeLayout } from '../../src/shell/dockview-bridge.js';
import { buildDefaultLayout } from '../../src/shell/layout-factory.js';

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

class FakeDockviewApi {
  calls: Array<{
    id: string;
    component: string;
    initialWidth?: number;
    position?: { referencePanel?: string; referenceGroup?: unknown; direction?: string };
  }> = [];
  activatedPanels: string[] = [];
  fromJSONCalls = 0;
  groups = new Map<string, FakeGroupSpy>();

  addPanel(opts: {
    id: string;
    component: string;
    initialWidth?: number;
    position?: { referencePanel?: string; referenceGroup?: unknown; direction?: string };
  }) {
    this.calls.push(opts);
    const group = makeFakeGroup();
    this.groups.set(opts.id, group);
    return {
      id: opts.id,
      api: { setActive: () => this.activatedPanels.push(opts.id) },
      group
    };
  }
  getPanel(id: string) {
    if (!this.calls.some((c) => c.id === id)) return undefined;
    return { api: { setActive: () => this.activatedPanels.push(id) } };
  }
  fromJSON() {
    this.fromJSONCalls++;
  }
  toJSON() {
    return { panels: this.calls.map((c) => c.id) };
  }
}

describe('isFactoryShape', () => {
  it('returns true for a freshly built layout', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    expect(isFactoryShape(layout)).toBe(true);
  });

  it('returns false for a dockview-native serialized layout', () => {
    const layout = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: { panels: ['workspace.editor'] } // dockview-native shape
    } as const;
    expect(isFactoryShape(layout as never)).toBe(false);
  });
});

describe('applyLayout — factory shape', () => {
  it('issues addPanel calls in column order, then bottom-group tabs', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const ids = api.calls.map((c) => c.id);
    // First three are columns left-to-right; remaining three are bottom tabs.
    expect(ids.slice(0, 3)).toEqual([
      'workspace.fileTree',
      'workspace.editor',
      'workspace.inspector'
    ]);
    expect(ids.slice(3)).toEqual(
      expect.arrayContaining(['workspace.problems', 'workspace.output', 'workspace.visualPreview'])
    );
  });

  it('positions each subsequent column to the right of the previous', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const editor = api.calls.find((c) => c.id === 'workspace.editor');
    expect(editor?.position?.direction).toBe('right');
    expect(editor?.position?.referencePanel).toBe('workspace.fileTree');
    const inspector = api.calls.find((c) => c.id === 'workspace.inspector');
    expect(inspector?.position?.direction).toBe('right');
  });

  it('positions the first bottom tab below the editor and the rest within the same group', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const bottomCalls = api.calls.filter((c) =>
      ['workspace.problems', 'workspace.output', 'workspace.visualPreview'].includes(c.id)
    );
    expect(bottomCalls[0]?.position?.direction).toBe('below');
    expect(bottomCalls[1]?.position?.direction).toBe('within');
    expect(bottomCalls[2]?.position?.direction).toBe('within');
  });

  it('activates the configured default bottom tab', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    expect(api.activatedPanels).toContain('workspace.problems');
  });

  it('collapses the inspector + bottom group at viewport ≤ 1280px (FR-024)', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1280 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const inspectorGroup = api.groups.get('workspace.inspector');
    const firstBottom = api.groups.get('workspace.problems');
    expect(inspectorGroup?.sizeCalls).toEqual([{ width: 0 }]);
    expect(firstBottom?.sizeCalls).toEqual([{ height: 0 }]);
  });
});

describe('applyLayout — dockview-native shape', () => {
  it('routes through api.fromJSON', () => {
    const native = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: { panels: ['workspace.editor'] }
    } as const;
    const api = new FakeDockviewApi();
    applyLayout(api as never, native as never);
    expect(api.fromJSONCalls).toBe(1);
    expect(api.calls).toHaveLength(0);
  });
});

describe('serializeLayout', () => {
  it('round-trips through api.toJSON()', () => {
    const api = new FakeDockviewApi();
    api.addPanel({ id: 'workspace.editor', component: 'workspace.editor' });
    const out = serializeLayout(api as never) as { panels: string[] };
    expect(out.panels).toEqual(['workspace.editor']);
  });
});
