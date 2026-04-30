// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * dockview-bridge — pins the layout-shape → dockview-API conversion.
 * Real dockview can't run in jsdom; this exercises the bridge against a
 * spy-API that records every call so we can assert the addPanel ordering,
 * group inheritance, and active-panel selection.
 */

import { describe, it, expect, vi } from 'vitest';
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
    title?: string;
    initialWidth?: number;
    position?: { referencePanel?: string; referenceGroup?: unknown; direction?: string };
  }> = [];
  activatedPanels: string[] = [];
  fromJSONCalls = 0;
  groups = new Map<string, FakeGroupSpy>();

  addPanel(opts: {
    id: string;
    component: string;
    title?: string;
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
    expect(isFactoryShape(layout.dockview)).toBe(true);
  });

  it('returns false for a native serialized layout', () => {
    expect(isFactoryShape({ shape: 'native', json: { panels: ['workspace.editor'] } })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isFactoryShape(null)).toBe(false);
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

  it('passes user-facing PANEL_TITLES on every addPanel call (FR-008)', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const titleById = new Map(api.calls.map((c) => [c.id, c.title]));
    expect(titleById.get('workspace.fileTree')).toBe('Files');
    expect(titleById.get('workspace.editor')).toBe('Source');
    expect(titleById.get('workspace.inspector')).toBe('Structure');
    expect(titleById.get('workspace.problems')).toBe('Problems');
    expect(titleById.get('workspace.output')).toBe('Messages');
    expect(titleById.get('workspace.visualPreview')).toBe('Visualize');
    expect(titleById.get('workspace.formPreview')).toBe('Form');
    expect(titleById.get('workspace.codePreview')).toBe('Code');
    // Every call must carry a title — no internal workspace.* leaks.
    for (const call of api.calls) {
      expect(call.title).toBeTruthy();
      expect(call.title).not.toMatch(/^workspace\./);
    }
  });
  it('positions each subsequent column to the right of the previous', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const editor = api.calls.find((c) => c.id === 'workspace.editor');
    expect(editor?.position?.direction).toBe('right');
    expect(editor?.position?.referencePanel).toBe('workspace.fileTree');
    const inspector = api.calls.find((c) => c.id === 'workspace.inspector');
    expect(inspector?.position?.direction).toBe('within');
    const visualize = api.calls.find((c) => c.id === 'workspace.visualPreview');
    expect(visualize?.position?.direction).toBe('right');
    expect(visualize?.position?.referencePanel).toBe('workspace.editor');
    const preview = api.calls.find((c) => c.id === 'workspace.formPreview');
    expect(preview?.position?.direction).toBe('right');
    expect(preview?.position?.referencePanel).toBe('workspace.visualPreview');
  });

  it('positions the first bottom tab below the editor and the rest within the same group', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const bottomCalls = api.calls.filter((c) =>
      ['workspace.problems', 'workspace.output'].includes(c.id)
    );
    expect(bottomCalls[0]?.position?.direction).toBe('below');
    expect(bottomCalls[1]?.position?.direction).toBe('within');
  });

  it('activates the configured default bottom tab', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    expect(api.activatedPanels).toContain('workspace.problems');
  });

  it('collapses the bottom utilities at viewport ≤ 1280px (FR-024)', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1280 });
    const api = new FakeDockviewApi();
    applyLayout(api as never, layout);
    const firstBottom = api.groups.get('workspace.problems');
    expect(firstBottom?.sizeCalls).toEqual([{ height: 0 }]);
  });
});

describe('applyLayout — native shape', () => {
  it('routes through api.fromJSON', () => {
    const native = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: { shape: 'native' as const, json: { panels: ['workspace.editor'] } }
    };
    const api = new FakeDockviewApi();
    applyLayout(api as never, native);
    expect(api.fromJSONCalls).toBe(1);
    expect(api.calls).toHaveLength(0);
  });

  it('logs and falls back to factory layout when api.fromJSON throws', () => {
    const native = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: { shape: 'native' as const, json: { broken: true } }
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = new FakeDockviewApi();
    api.fromJSON = () => {
      throw new Error('incompatible_layout_v3');
    };
    applyLayout(api as never, native);
    // Error was surfaced
    expect(errSpy).toHaveBeenCalledOnce();
    const arg0 = errSpy.mock.calls[0]?.[0];
    expect(String(arg0)).toContain('api.fromJSON rejected');
    // Fallback factory layout was applied (4 top-level columns + utility tabs).
    expect(api.calls.length).toBeGreaterThanOrEqual(7);
    errSpy.mockRestore();
  });
});

describe('serializeLayout', () => {
  it('returns a tagged native payload', () => {
    const api = new FakeDockviewApi();
    api.addPanel({ id: 'workspace.editor', component: 'workspace.editor' });
    const out = serializeLayout(api as never);
    expect(out.shape).toBe('native');
    if (out.shape === 'native') {
      expect((out.json as { panels: string[] }).panels).toEqual(['workspace.editor']);
    }
  });
});
