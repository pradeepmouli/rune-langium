// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression tests for fix/parse-fallback-and-503.
 *
 * Verifies that when /api/parse fails the fallback path in parseWorkspaceFiles
 * only feeds user-authored .rosetta files to parseWorkspaceFilesOnMainThread.
 * Curated entries (serializedModelJson set) and bundle-marker files (path ends
 * with /.bundle-marker) must be stripped before reaching parseWorkspace, because
 * Langium's service registry is keyed on extension and only ".rosetta" is
 * registered — passing other URIs causes getServices() to throw
 * "no services for the extension ''".
 *
 * Strategy: mock `parseWorkspace` from @rune-langium/core so that:
 *   - calls with a .rosetta URI resolve with a minimal stub result
 *   - calls with a non-.rosetta URI throw — mirroring real Langium behaviour
 * This proves the filter prevents the throw without spinning up the full
 * Langium service registry.
 *
 * vi.mock() is hoisted to the top of the module by Vitest, so it is
 * placed at file scope here (in its own file) to avoid affecting other
 * test files in the suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseWorkspaceFiles, _resetParserWorkerForTests } from '../../src/services/workspace.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

// Mock parseWorkspace so non-.rosetta URIs simulate the real Langium error.
// vi.mock is hoisted — this runs before any imports are evaluated.
vi.mock('@rune-langium/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rune-langium/core')>();
  return {
    ...actual,
    parseWorkspace: vi.fn(async (docs: Array<{ uri: string; content: string }>) => {
      return docs.map((doc) => {
        if (!doc.uri.toLowerCase().endsWith('.rosetta')) {
          // Mirror what Langium's getServices() throws for unknown extensions.
          const ext = doc.uri.includes('.') ? doc.uri.split('.').pop() ?? '' : '';
          throw new Error(
            `The service registry contains no services for the extension '${ext}'`
          );
        }
        return {
          value: {
            $type: 'RosettaModel',
            elements: [],
            namespaceDecl: { name: 'test' }
          },
          parserErrors: [],
          lexerErrors: []
        };
      });
    })
  };
});

describe('parseWorkspaceFiles — fallback only parses user .rosetta files', () => {
  beforeEach(() => {
    // Force the router to fail so the catch-block fallback path is exercised.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('router down')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    _resetParserWorkerForTests();
  });

  it('resolves (does not throw) when the file list includes curated and bundle-marker entries', async () => {
    const files: WorkspaceFile[] = [
      // User-authored .rosetta file — should be parsed and appear in results.
      {
        name: 'user.rosetta',
        path: 'user.rosetta',
        content: 'namespace t\ntype Foo:',
        dirty: false
      },
      // Curated entry — serializedModelJson is set; path does NOT end with .rosetta
      // when the curated path prefix is stripped.  Excluded by both layers of the fix.
      {
        name: 'Trade.rosetta',
        path: '[cdm]/types/Trade.rosetta',
        content: 'namespace cdm',
        dirty: false,
        readOnly: true,
        serializedModelJson: '{"$type":"RosettaModel","elements":[]}'
      },
      // Bundle-marker entry — path ends with /.bundle-marker (no .rosetta extension).
      // Its serializedModelJson is also set, so both filter layers block it.
      {
        name: '.bundle-marker',
        path: '[cdm]/.bundle-marker',
        content: '',
        dirty: false,
        readOnly: true,
        serializedModelJson: '{}'
      }
    ];

    // Before the fix: parseWorkspace received all three URIs.  The non-.rosetta ones
    // caused the mock (and real Langium) to throw, which rejected the whole fallback
    // and left the editor with "keeping the last valid graph".
    // After the fix: only `user.rosetta` reaches parseWorkspace — resolves cleanly.
    const result = await parseWorkspaceFiles(files);

    // Confirms the fallback path was taken (router threw).
    expect(result.parseMode).toBe('main-thread-fallback');
    expect(result.fallbackMessage).toContain('router down');

    // Only the user .rosetta file should appear in parsedModels.
    expect(result.parsedModels).toHaveLength(1);
    expect(result.parsedModels[0]!.filePath).toBe('user.rosetta');

    // The curated and bundle-marker files must NOT appear in the output.
    const paths = result.parsedModels.map((m) => m.filePath);
    expect(paths).not.toContain('[cdm]/types/Trade.rosetta');
    expect(paths).not.toContain('[cdm]/.bundle-marker');
  });

  it('returns an empty result (not an error) when the only files are curated/marker entries', async () => {
    // Edge case: workspace has ONLY curated files (e.g. loaded a bundle with no user file yet).
    // The fallback must still resolve (empty models, not throw).
    const files: WorkspaceFile[] = [
      {
        name: '.bundle-marker',
        path: '[fpml]/.bundle-marker',
        content: '',
        dirty: false,
        readOnly: true,
        serializedModelJson: '{}'
      }
    ];

    const result = await parseWorkspaceFiles(files);

    expect(result.parseMode).toBe('main-thread-fallback');
    expect(result.models).toHaveLength(0);
    expect(result.parsedModels).toHaveLength(0);
    expect(result.errors.size).toBe(0);
  });
});
