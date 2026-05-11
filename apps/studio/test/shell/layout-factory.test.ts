// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T061 — layout-factory contract tests.
 * Asserts the layout shape and the small-viewport defaults.
 */

import { describe, it, expect } from 'vitest';
import { buildDefaultLayout, LAYOUT_SCHEMA_VERSION, PANEL_COMPONENT_NAMES } from '../../src/shell/layout-factory.js';

describe('buildDefaultLayout (T061)', () => {
  it('emits the layout component names present in the factory shape', () => {
    // workspace.editor and workspace.inspector are rendered inside CenterStackPanel,
    // not as separate dockview tabs — so they do not appear in the layout object.
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const names = collectComponentNames(layout.dockview);
    const expectedInLayout = PANEL_COMPONENT_NAMES.filter(
      (n) => n !== 'workspace.editor' && n !== 'workspace.inspector'
    );
    expect([...names].sort()).toEqual([...expectedInLayout].sort());
  });

  it('groups Navigate, Edit, Preview, and Utilities surfaces by default', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1440 });
    if (!layout.dockview || layout.dockview.shape !== 'factory') {
      throw new Error('factory shape expected');
    }

    expect(collectColumnComponents(layout.dockview.columns[0])).toEqual(['workspace.fileTree']);
    // Center column is a single-tab group; source and inspector render inside CenterStackPanel
    expect(collectColumnComponents(layout.dockview.columns[1])).toEqual(['workspace.visualPreview']);
    expect(collectColumnComponents(layout.dockview.columns[2])).toEqual([
      'workspace.formPreview',
      'workspace.codePreview'
    ]);
    expect(layout.dockview.bottomGroup.tabs.map((tab) => tab.component)).toEqual([
      'workspace.problems',
      'workspace.output'
    ]);
  });

  it('layout.version equals LAYOUT_SCHEMA_VERSION', () => {
    expect(buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 }).version).toBe(LAYOUT_SCHEMA_VERSION);
  });

  it('preview starts reachable above 1280px', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1440 });
    const collapsed = collectCollapsed(layout.dockview);
    expect(collapsed).not.toContain('workspace.formPreview');
  });

  it('writtenBy reflects the studio version', () => {
    const layout = buildDefaultLayout({ studioVersion: '9.9.9', viewportWidth: 1920 });
    expect(layout.writtenBy).toBe('9.9.9');
  });
});

// ---------- helpers ----------

function collectComponentNames(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  const obj = node as Record<string, unknown>;
  if (typeof obj['component'] === 'string') out.add(obj['component'] as string);
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((x) => collectComponentNames(x, out));
    else if (v && typeof v === 'object') collectComponentNames(v, out);
  }
  return out;
}

function collectCollapsed(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  const obj = node as Record<string, unknown>;
  if (obj['collapsed'] === true && typeof obj['component'] === 'string') {
    out.push(obj['component'] as string);
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((x) => collectCollapsed(x, out));
    else if (v && typeof v === 'object') collectCollapsed(v, out);
  }
  return out;
}

function collectColumnComponents(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as { component?: string; tabs?: Array<{ component: string }> };
  if (obj.tabs) return obj.tabs.map((tab) => tab.component);
  return obj.component ? [obj.component] : [];
}

function _collectStackComponents(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as {
    top?: { component?: string };
    bottom?: { component?: string };
  };
  return [obj.top?.component, obj.bottom?.component].filter((value): value is string => !!value);
}
