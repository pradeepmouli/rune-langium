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

afterEach(() => vi.restoreAllMocks());

describe('sanitizeLayout (T063)', () => {
  it('rebuilds when the input is missing or malformed', () => {
    const out = sanitizeLayout(null, { studioVersion: '0.1.0', viewportWidth: 1440 });
    expect(out.version).toBe(1);
    const dockview = out.dockview;
    if (!dockview || dockview.shape !== 'factory') {
      throw new Error('factory layout expected');
    }
    expect(dockview.columns).toHaveLength(4);
    expect(dockview.columns[2]).toMatchObject({ component: 'workspace.visualPreview' });
    expect(dockview.bottomGroup.tabs.map((tab) => tab.component)).toEqual([
      'workspace.problems',
      'workspace.output'
    ]);
  });

  it('drops unknown component names with a console warning, keeping the known ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stale = {
      version: 1,
      writtenBy: '0.0.5',
      dockview: {
        columns: [
          { component: 'workspace.fileTree' },
          { component: 'workspace.editor' },
          { component: 'workspace.GHOST' }
        ],
        bottomGroup: {
          active: 'workspace.problems',
          collapsed: false,
          tabs: [{ component: 'workspace.problems' }]
        }
      }
    };
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
    expect(out.version).toBe(1);
    expect(out.writtenBy).toBe('0.2.0');
  });

  it('preserves the input when every component name is known and version matches', () => {
    const valid = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: {
        columns: [
          { component: 'workspace.fileTree' },
          { component: 'workspace.editor' },
          { component: 'workspace.inspector' }
        ],
        bottomGroup: {
          active: 'workspace.problems',
          collapsed: false,
          tabs: [{ component: 'workspace.problems' }]
        }
      }
    };
    const out = sanitizeLayout(valid, { studioVersion: '0.1.0', viewportWidth: 1440 });
    expect(out.dockview).toEqual(valid.dockview);
  });

  it('normalizes invalid active tabs back to surviving tabs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
          { component: 'workspace.visualPreview' },
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
    expect(out.dockview.columns[3].active).toBe('workspace.formPreview');
    expect(out.dockview.bottomGroup.active).toBe('workspace.problems');
    expect(warnSpy).toHaveBeenCalledWith(
      '[layout-migrations] normalized invalid active tabs in saved layout'
    );
  });

  it('rebuilds malformed factory layouts instead of throwing during active-tab normalization', () => {
    const malformed = {
      version: 1,
      writtenBy: '0.1.0',
      dockview: {
        shape: 'factory',
        columns: [
          { component: 'workspace.fileTree' },
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
    expect(out.dockview.columns).toHaveLength(4);
  });
});
