// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Corpus schema invariant gate.
 *
 * THE HARD INVARIANT (schema-as-validity-trigger design, Stream 3 T2):
 * generated Zod schemas must never reject real parser output. Every
 * top-level element the VE's `astToModel` adapter dehydrates from every
 * `.rosetta` file under `.resources/` must `safeParse` successfully against
 * its own `$type`'s schema (`SCHEMA_BY_TYPE`).
 *
 * A failure here is an upstream `langium-zod` bug (an overly-strict
 * refinement or a missing `.optional()`/array shape) — not something to
 * allowlist or work around in this repo.
 *
 * Per CLAUDE.md, corpus-dependent tests are guarded with
 * `describe.skipIf(!RESOURCES_EXIST)` so environments without the corpus
 * skip cleanly.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import { SCHEMA_BY_TYPE } from '../../src/schemas/schema-by-type.js';

// fileURLToPath (not `new URL(...).pathname`) — see expression-corpus-sweep.test.ts
// for why: .pathname keeps a leading `/` before a Windows drive letter.
const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

/** Recursively collect every `.rosetta` file path under `dir`. */
function collectRosettaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectRosettaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.rosetta')) {
      out.push(full);
    }
  }
  return out;
}

interface SchemaFailure {
  type: string;
  name: string;
  file: string;
  issues: Array<{ path: string; message: string }>;
}

describe.skipIf(!RESOURCES_EXIST)('corpus schema invariant (schemas never reject parser output)', () => {
  it('every dehydrated top-level corpus node safeParses against its $type schema', async () => {
    const files = collectRosettaFiles(RESOURCES_DIR);
    expect(files.length).toBeGreaterThan(100);

    const failures: SchemaFailure[] = [];
    let checkedCount = 0;
    let skippedParseErrorCount = 0;

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      // Same rationale as expression-corpus-sweep.test.ts: pathToFileURL
      // handles Windows drive letters / URI-unsafe chars correctly; only
      // used as a document-identity key here (no real disk access via URI).
      const result = await parse(content, pathToFileURL(file).toString());
      if (result.hasErrors) {
        // Not this gate's concern — parse-error corpus files are covered by
        // the CDM parse-rate conformance suite in packages/core.
        skippedParseErrorCount++;
        continue;
      }

      const { nodes } = astToModel([result.value]);
      for (const node of nodes) {
        const $type = node.data.$type;
        const schema = SCHEMA_BY_TYPE[$type];
        // Every top-level $type astToModel dehydrates MUST have a schema —
        // an absent entry is a gap in SCHEMA_BY_TYPE, not a corpus issue.
        expect(schema, `no schema registered for $type "${$type}" (node "${node.data.name}" in ${file})`).toBeDefined();

        checkedCount++;
        const result2 = schema!.safeParse(node.data);
        if (!result2.success) {
          failures.push({
            type: $type,
            name: String(node.data.name ?? 'unknown'),
            file,
            issues: result2.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
          });
        }
      }
    }

    expect(checkedCount).toBeGreaterThan(0);

    if (failures.length > 0) {
      const report = failures
        .slice(0, 30)
        .map(
          (f) =>
            `  [${f.type}] ${f.name} (${f.file}):\n${f.issues.map((i) => `    - ${i.path || '(root)'}: ${i.message}`).join('\n')}`
        )
        .join('\n');
      console.log(`\n${failures.length} corpus node(s) failed schema validation (showing first 30):\n${report}`);
    }

    // THE HARD INVARIANT: zero failures. Any failure is an upstream
    // langium-zod bug — do not allowlist.
    expect(
      failures,
      `${failures.length}/${checkedCount} corpus nodes failed safeParse against their $type schema`
    ).toHaveLength(0);
  }, 60_000);
});
