// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWorkspaceFiles } from '../../src/services/workspace.js';

/** Minimal bundle-marker file that makes collectCuratedBundlesFromWorkspace find the cdm bundle. */
const CDM_BUNDLE_MARKER: Parameters<typeof parseWorkspaceFiles>[0][number] = {
  name: '.bundle-marker',
  path: 'cdm/.bundle-marker',
  content: '',
  dirty: false,
  bundleId: 'cdm',
  bundleVersion: 'latest',
  serializedModelJson: '{}'
};

describe('curated loaded-status from deferredExports', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('registers list-only deferredExports namespaces as refOnly files when the closure is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          errors: {},
          hydrationState: { documents: [] },
          deferredExports: [
            { filePath: 'cdm/cdm.base.datetime', namespace: 'cdm.base.datetime', exports: [{ type: 'Data', name: 'A' }] },
            { filePath: 'cdm/cdm.base.math', namespace: 'cdm.base.math', exports: [{ type: 'Data', name: 'B' }] }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as Response
    );

    const result = await parseWorkspaceFiles([CDM_BUNDLE_MARKER]);

    const files = result.curatedRefOnlyFiles?.['cdm'] ?? [];
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.refOnly === true)).toBe(true);
    expect(new Set(files.map((f) => f.namespace))).toEqual(new Set(['cdm.base.datetime', 'cdm.base.math']));
  });

  it('list-only guard: deferredExports entries whose filePath is NOT ${bundleId}/${namespace} are excluded from the loaded-status pass', async () => {
    // Simulates three shapes that must NOT be added by the list-only pass:
    //   1. A closure-style entry like "cdm/types/Trade.rosetta" — its filePath
    //      is NOT `${bundleId}/${namespace}` so it must be skipped.
    //   2. A user-file-shaped entry "cdm/foo.rosetta" — same reason.
    // And one that MUST be added:
    //   3. A genuine list-only entry "cdm/cdm.base.math" where
    //      filePath === `${bundleId}/${namespace}`.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          errors: {},
          hydrationState: { documents: [] },
          deferredExports: [
            // Genuine list-only entry — MUST be added
            { filePath: 'cdm/cdm.base.math', namespace: 'cdm.base.math', exports: [{ type: 'Data', name: 'B' }] },
            // Closure-style: filePath is a real .rosetta path, not the synthetic id
            { filePath: 'cdm/types/Trade.rosetta', namespace: 'cdm.trade', exports: [{ type: 'Data', name: 'Trade' }] },
            // User-file-shaped: also has a slash but not the synthetic shape
            { filePath: 'cdm/foo.rosetta', namespace: 'cdm.foo', exports: [{ type: 'Data', name: 'Foo' }] }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as Response
    );

    const result = await parseWorkspaceFiles([CDM_BUNDLE_MARKER]);

    const files = result.curatedRefOnlyFiles?.['cdm'] ?? [];
    // Only the genuine list-only entry should be present
    expect(files).toHaveLength(1);
    expect(files[0]?.namespace).toBe('cdm.base.math');
    // The closure-style and user-file-shaped entries must not appear
    expect(files.some((f) => f.namespace === 'cdm.trade')).toBe(false);
    expect(files.some((f) => f.namespace === 'cdm.foo')).toBe(false);
  });

  it('list-only → hydrated transition: second parse produces exactly one entry with serializedModelJson (no duplicate, no stale)', async () => {
    // ── Call 1: namespace not yet in closure → list-only entry ──────────────
    // Server emits a synthetic list-only deferredExports entry for the
    // namespace (filePath = bundle-prefixed synthetic path, no hydration doc).
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          errors: {},
          hydrationState: { documents: [] },
          deferredExports: [
            // Synthetic list-only path: `${bundleId}/${namespace}` (no .rosetta extension).
            { filePath: 'cdm/cdm.base.math', namespace: 'cdm.base.math', exports: [{ type: 'Data', name: 'B' }] }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as Response
    );

    const result1 = await parseWorkspaceFiles([CDM_BUNDLE_MARKER]);
    const files1 = result1.curatedRefOnlyFiles?.['cdm'] ?? [];
    expect(files1).toHaveLength(1);
    expect(files1[0]?.namespace).toBe('cdm.base.math');
    // List-only entry carries no serialized AST.
    expect(files1[0]?.serializedModelJson).toBeUndefined();

    // ── Call 2: namespace is now in the server's closure → hydrated entry ───
    // Server's "if (closure.has(ns)) continue" skips the list-only summary.
    // Instead it emits per-FILE deferredExports entries (from mergeCuratedDocIntoDeferredExports)
    // alongside the hydrationState document. The namespace lookup in workspace.ts
    // uses deferredExports to resolve the namespace for each hydrated doc.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          errors: {},
          hydrationState: {
            documents: [
              {
                uri: 'cdm/cdm.base.math',
                bundleId: 'cdm',
                serializedModel: '{"$type":"RosettaModel"}',
                exports: []
              }
            ]
          },
          // Per-file deferredExports entry (not list-only): filePath is the
          // real doc URI, namespace is populated from the parsed AST.
          deferredExports: [
            { filePath: 'cdm/cdm.base.math', namespace: 'cdm.base.math', exports: [{ type: 'Data', name: 'B' }] }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as Response
    );

    const result2 = await parseWorkspaceFiles([CDM_BUNDLE_MARKER], { hydrateNamespaces: ['cdm.base.math'] });
    const files2 = result2.curatedRefOnlyFiles?.['cdm'] ?? [];

    // Exactly one entry — the hydrated doc from hydrationState.documents wins;
    // the deferredExports loop's "seen" guard skips the same path as a duplicate.
    expect(files2).toHaveLength(1);
    expect(files2[0]?.namespace).toBe('cdm.base.math');
    // Hydrated entry carries the serialized AST from the server.
    expect(files2[0]?.serializedModelJson).toBeTruthy();
  });
});
