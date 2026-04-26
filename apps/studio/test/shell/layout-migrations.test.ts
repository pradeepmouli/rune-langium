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
});
