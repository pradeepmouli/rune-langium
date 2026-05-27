// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T063 — layout-migrations contract tests.
 * Asserts unknown component names are sanitised, version-bumped layouts
 * route through the correct transformer, and a missing layout is rebuilt
 * from defaults.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeLayout } from '../../src/shell/layout-migrations.js';
import { buildDefaultLayout, LAYOUT_SCHEMA_VERSION } from '../../src/shell/layout-factory.js';

afterEach(() => vi.restoreAllMocks());

describe('sanitizeLayout (T063)', () => {
  it('rebuilds when the input is missing or malformed', () => {
    const out = sanitizeLayout(null, { studioVersion: '0.1.0', viewportWidth: 1440 });
    expect(out.version).toBe(LAYOUT_SCHEMA_VERSION);
    const dockview = out.dockview;
    if (!dockview || dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }
    expect(dockview.columns).toHaveLength(3);
    expect(dockview.columns[0]).toMatchObject({
      component: 'workspace.fileTree'
    });
    expect(dockview.bottomGroup.tabs.map((tab) => tab.component)).toEqual([
      'workspace.problems',
      'workspace.output'
    ]);
  });

  it('drops unknown component names with a console warning, keeping the known ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = buildDefaultLayout({ studioVersion: '0.0.5', viewportWidth: 1440 });
    stale.version = 1;
    if (!stale.dockview || stale.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }
    stale.dockview.columns[2].tabs = [
      { component: 'workspace.formPreview' },
      { component: 'workspace.GHOST' as never }
    ];
    const out = sanitizeLayout(stale, { studioVersion: '0.2.0', viewportWidth: 1440 });
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('workspace.GHOST');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('rebuilds entirely when the layout version is greater than current', () => {
    const futureLayout = {
      version: 99,
      writtenBy: 'future',
      dockview: { something: 'unknown' }
    };
    const out = sanitizeLayout(futureLayout, { studioVersion: '0.2.0', viewportWidth: 1440 });
    expect(out.version).toBe(LAYOUT_SCHEMA_VERSION);
    expect(out.writtenBy).toBe('0.2.0');
  });

  it('preserves the input when every component name is known and version matches', () => {
    const valid = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1440 });
    const out = sanitizeLayout(valid, { studioVersion: '0.1.0', viewportWidth: 1440 });
    expect(out.dockview).toEqual(valid.dockview);
  });

  it('upgrades a compatible older layout record to the current schema version', () => {
    const older = buildDefaultLayout({ studioVersion: '0.1.0', viewportWidth: 1440 });
    older.version = 1;

    const out = sanitizeLayout(older, { studioVersion: '0.2.0', viewportWidth: 1440 });

    expect(out.version).toBe(LAYOUT_SCHEMA_VERSION);
    expect(out.dockview).toEqual(older.dockview);
  });

  it('normalizes invalid active tabs back to surviving tabs (v3 ExplorerColumn shape)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // v3 factory layout: columns[0] is an ExplorerColumn (single `component`, no top/bottom).
    const stale = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: {
        shape: 'factory',
        columns: [
          { component: 'workspace.fileTree' },
          {
            active: 'workspace.visualPreview',
            tabs: [{ component: 'workspace.editor' }, { component: 'workspace.inspector' }]
          },
          {
            active: 'workspace.output',
            tabs: [{ component: 'workspace.formPreview' }, { component: 'workspace.codePreview' }]
          }
        ],
        bottomGroup: {
          active: 'workspace.editor',
          collapsed: false,
          tabs: [{ component: 'workspace.problems' }, { component: 'workspace.output' }]
        }
      }
    };

    const out = sanitizeLayout(stale, { studioVersion: '0.2.0', viewportWidth: 1440 });
    if (!out.dockview || out.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }

    expect(out.dockview.columns[1].active).toBe('workspace.editor');
    expect(out.dockview.columns[2].active).toBe('workspace.formPreview');
    expect(out.dockview.bottomGroup.active).toBe('workspace.problems');
    expect(warnSpy).toHaveBeenCalledWith(
      '[layout-migrations] normalized invalid active tabs in saved layout'
    );
  });

  it('migrates old NavigationColumn (top/bottom) layout to v3 ExplorerColumn', () => {
    // Pre-v3 layouts used NavigationColumn with top/bottom — these are
    // migrated inline to the v3 ExplorerColumn shape (no rebuild needed).
    const oldShape = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: {
        shape: 'factory',
        columns: [
          {
            top: { component: 'workspace.fileTree' },
            bottom: { component: 'workspace.visualPreview' },
            size: 260
          },
          {
            active: 'workspace.editor',
            tabs: [{ component: 'workspace.editor' }, { component: 'workspace.inspector' }]
          },
          {
            active: 'workspace.formPreview',
            tabs: [{ component: 'workspace.formPreview' }, { component: 'workspace.codePreview' }]
          }
        ],
        bottomGroup: {
          active: 'workspace.problems',
          collapsed: false,
          tabs: [{ component: 'workspace.problems' }, { component: 'workspace.output' }]
        }
      }
    };

    const out = sanitizeLayout(oldShape, { studioVersion: '0.2.0', viewportWidth: 1440 });
    if (!out.dockview || out.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }

    // Migrated to v3 ExplorerColumn, preserving original size.
    expect(out.dockview.columns[0]).toMatchObject({ component: 'workspace.fileTree', size: 260 });
    expect(out.dockview.columns).toHaveLength(3);
  });

  it('rebuilds malformed factory layouts instead of throwing during active-tab normalization', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const malformed = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: {
        shape: 'factory',
        columns: [
          {
            top: null,
            bottom: { component: 'workspace.visualPreview' }
          },
          { active: 'workspace.editor', tabs: [{ component: 'workspace.editor' }] }
        ],
        bottomGroup: {
          active: 'workspace.problems',
          collapsed: false,
          tabs: [{ component: 'workspace.problems' }]
        }
      }
    };

    const out = sanitizeLayout(malformed, { studioVersion: '0.2.0', viewportWidth: 1440 });
    if (!out.dockview || out.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }

    expect(out.writtenBy).toBe('0.2.0');
    expect(out.dockview.columns).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledWith(
      '[layout-migrations] reset invalid saved layout to defaults'
    );
  });

  it('rebuilds when dropping obsolete tabs leaves a required factory group empty', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: {
        shape: 'factory',
        columns: [
          {
            top: { component: 'workspace.fileTree' },
            bottom: { component: 'workspace.visualPreview' }
          },
          {
            active: 'workspace.editor',
            tabs: [{ component: 'workspace.editor' }, { component: 'workspace.inspector' }]
          },
          {
            active: 'workspace.formPreview',
            tabs: [{ component: 'workspace.legacyFormPreview' }]
          }
        ],
        bottomGroup: {
          active: 'workspace.problems',
          collapsed: false,
          tabs: [{ component: 'workspace.problems' }, { component: 'workspace.output' }]
        }
      }
    };

    const out = sanitizeLayout(stale, { studioVersion: '0.2.0', viewportWidth: 1440 });
    if (!out.dockview || out.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }

    expect(out.dockview.columns).toHaveLength(3);
    expect(out.dockview.columns[2].active).toBe('workspace.formPreview');
    expect(warnSpy).toHaveBeenCalledWith(
      '[layout-migrations] reset invalid saved layout to defaults'
    );
  });

  it('rebuilds empty native layouts instead of passing a blank shell through to dockview', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = {
      version: LAYOUT_SCHEMA_VERSION,
      writtenBy: '0.2.0',
      dockview: {
        shape: 'native',
        json: {
          grid: {
            root: { type: 'group', data: 'group-1' },
            height: 900,
            width: 1440,
            orientation: 'horizontal'
          },
          panels: {}
        }
      }
    };

    const out = sanitizeLayout(stale, { studioVersion: '0.2.0', viewportWidth: 1440 });
    if (!out.dockview || out.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }

    expect(out.dockview.columns).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledWith(
      '[layout-migrations] reset invalid saved layout to defaults'
    );
  });

  it('rebuilds native layouts that reference unknown content components', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = {
      version: LAYOUT_SCHEMA_VERSION,
      writtenBy: '0.2.0',
      dockview: {
        shape: 'native',
        json: {
          grid: {
            root: { type: 'group', data: 'group-1' },
            height: 900,
            width: 1440,
            orientation: 'horizontal'
          },
          panels: {
            'ghost-panel': {
              id: 'ghost-panel',
              contentComponent: 'workspace.ghost'
            }
          }
        }
      }
    };

    const out = sanitizeLayout(stale, { studioVersion: '0.2.0', viewportWidth: 1440 });
    if (!out.dockview || out.dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }

    expect(out.dockview.columns).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledWith(
      '[layout-migrations] reset invalid saved layout to defaults'
    );
  });
});
