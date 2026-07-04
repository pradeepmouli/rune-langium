// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Corpus round-trip parity for the schema-driven render gate (Stream 3 T3,
 * final requirement: "serialize outputs for the corpus remain byte-identical
 * pre/post gate").
 *
 * T2's corpus-schema-invariant test already proves every dehydrated corpus
 * node safeParses against its own $type schema — by construction, the gate
 * introduced in cst-reuse-renderer.ts can therefore never fall back for a
 * real corpus node (a fallback only fires on safeParse failure). This test
 * makes that a live, executable guarantee rather than an inference: force
 * EVERY top-level node in the FULL corpus to fully regenerate (bypassing
 * CST reuse via forceDirtyNodeIds, so the gate + the structural renderer
 * actually run) and assert zero "schema validation failed" warnings fire.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import { renderNamespace } from '../../src/serialize/cst-reuse-renderer.js';
import { buildDirtyIndex } from '../../src/serialize/dirty-paths.js';
import type { Patches } from 'mutative';

const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

function collectRosettaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRosettaFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.rosetta')) out.push(full);
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.skipIf(!RESOURCES_EXIST)('corpus render-gate parity (zero schema-gate fallbacks on real corpus files)', () => {
  it('force-regenerating every top-level node in the corpus triggers zero schema-gate fallback warnings', async () => {
    const files = collectRosettaFiles(RESOURCES_DIR);
    expect(files.length).toBeGreaterThan(100);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let filesChecked = 0;
    let nodesForced = 0;

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const result = await parse(content, pathToFileURL(file).toString());
      if (result.hasErrors) continue;

      const { nodes } = astToModel([result.value]);
      if (nodes.length === 0) continue;
      filesChecked++;
      nodesForced += nodes.length;

      // Force every node to fully regenerate — bypasses CST reuse so the
      // schema gate + renderNode actually execute for each one.
      const forceDirtyNodeIds = new Set(nodes.map((n) => n.id));
      const out = renderNamespace({
        nodes,
        originalSource: content,
        dirty: buildDirtyIndex([] as unknown as Patches),
        forceDirtyNodeIds
      });
      expect(out).toBeTruthy();
    }

    expect(filesChecked).toBeGreaterThan(0);
    expect(nodesForced).toBeGreaterThan(0);

    const schemaFallbackWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('[cst-reuse] schema validation failed')
    );
    expect(
      schemaFallbackWarnings,
      `expected zero schema-gate fallbacks across ${nodesForced} forced-regenerate corpus nodes (${filesChecked} files) — any warning here means a real corpus node failed its own schema mid-render, contradicting T2's exhaustive safeParse sweep`
    ).toHaveLength(0);
  }, 60_000);
});
