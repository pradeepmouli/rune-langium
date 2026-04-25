// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T061 — layout-factory contract tests.
 * Asserts the v1 panel set, layout shape, and the small-viewport defaults.
 */

import { describe, it, expect } from 'vitest';
import { buildDefaultLayout, PANEL_COMPONENT_NAMES } from '../../src/shell/layout-factory.js';

describe('buildDefaultLayout (T061)', () => {
  it('emits all six locked component names', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 });
    const names = collectComponentNames(layout.dockview);
    expect([...names].sort()).toEqual([...PANEL_COMPONENT_NAMES].sort());
  });

  it('layout.version starts at 1', () => {
    expect(buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1920 }).version).toBe(1);
  });

  it('inspector and bottom panel start collapsed at viewport ≤ 1280px (FR-024)', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1280 });
    const collapsed = collectCollapsed(layout.dockview);
    expect(collapsed).toContain('workspace.inspector');
    expect(collapsed).toContain('workspace.problems');
    expect(collapsed).toContain('workspace.output');
    expect(collapsed).toContain('workspace.visualPreview');
  });

  it('inspector starts expanded above 1280px', () => {
    const layout = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1440 });
    const collapsed = collectCollapsed(layout.dockview);
    expect(collapsed).not.toContain('workspace.inspector');
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
