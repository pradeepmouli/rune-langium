/**
 * Integration test: LSP URI regression.
 *
 * Verifies that the studio's file-loading pipeline produces
 * document URIs that are compatible with Langium's service registry.
 *
 * Regression for:
 *   - Relative paths (file.name only) producing file://hostname-style URIs
 *   - Missing .rosetta extension crashing Langium with
 *     "service registry contains no services for the extension ''"
 */

import { describe, it, expect } from 'vitest';
import { pathToUri } from '../../src/utils/uri.js';

/**
 * Simulates what happens when the browser's FileList gives us files
 * via the File System Access API — webkitRelativePath or bare name.
 */
function simulateWorkspacePaths(): { name: string; path: string }[] {
  return [
    // Individual file selection (no folder) — only file.name
    { name: 'base-datetime-type.rosetta', path: 'base-datetime-type.rosetta' },
    // Folder selection — webkitRelativePath
    { name: 'base-math-type.rosetta', path: 'cdm/base-math-type.rosetta' },
    // System with absolute path (rare but possible via drag-drop)
    { name: 'model.rosetta', path: '/Users/dev/workspace/model.rosetta' }
  ];
}

describe('LSP URI regression: workspace file paths → document URIs', () => {
  const files = simulateWorkspacePaths();

  for (const file of files) {
    describe(`path: "${file.path}"`, () => {
      const uri = pathToUri(file.path);

      it('produces a valid file:// URI parseable by URL constructor', () => {
        expect(() => new URL(uri)).not.toThrow();
      });

      it('uses file: protocol with empty hostname (3-slash form)', () => {
        const url = new URL(uri);
        expect(url.protocol).toBe('file:');
        expect(url.hostname).toBe('');
      });

      it('preserves the .rosetta extension in the pathname', () => {
        const url = new URL(uri);
        expect(url.pathname).toMatch(/\.rosetta$/);
      });

      it('has a non-empty pathname', () => {
        const url = new URL(uri);
        expect(url.pathname.length).toBeGreaterThan(1);
      });

      it('can extract .rosetta extension via path splitting', () => {
        // This is how Langium extracts extension from URI
        const url = new URL(uri);
        const ext = url.pathname.split('.').pop();
        expect(ext).toBe('rosetta');
      });
    });
  }

  // ── Specific regression cases ───────────────────────────────────────

  it('bare filename does NOT produce a hostname-style URI', () => {
    // The original bug: pathToUri("model.rosetta") → "file://model.rosetta"
    // URL parses this as protocol=file, host=model.rosetta, path=""
    const uri = pathToUri('model.rosetta');
    const url = new URL(uri);
    // hostname MUST be empty — the filename must be in the path
    expect(url.hostname).toBe('');
    expect(url.pathname).toContain('model.rosetta');
  });

  it('relative path with slashes does NOT put first segment as hostname', () => {
    const uri = pathToUri('cdm/base-datetime-type.rosetta');
    const url = new URL(uri);
    expect(url.hostname).toBe('');
    expect(url.pathname).toContain('cdm/base-datetime-type.rosetta');
  });

  it('already-valid file URI passes through unchanged', () => {
    const original = 'file:///workspace/model.rosetta';
    expect(pathToUri(original)).toBe(original);
  });

  // ── Multi-file consistency ──────────────────────────────────────────

  it('all workspace paths produce unique URIs', () => {
    const uris = files.map((f) => pathToUri(f.path));
    const unique = new Set(uris);
    expect(unique.size).toBe(uris.length);
  });

  it('all workspace URIs share the file:// scheme', () => {
    for (const file of files) {
      const uri = pathToUri(file.path);
      expect(uri.startsWith('file:///')).toBe(true);
    }
  });
});
