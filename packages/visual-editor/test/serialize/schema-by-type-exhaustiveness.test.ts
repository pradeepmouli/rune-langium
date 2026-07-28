// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Exhaustiveness guard for `SCHEMA_BY_TYPE` (schema-as-validity-trigger
 * design, Stream 3 T3).
 *
 * `cst-reuse-renderer`'s schema gate looks up `SCHEMA_BY_TYPE[node.$type]`
 * for every `$type` render-core's `renderNode` dispatcher structurally
 * renders (`rosetta-render-core.ts`'s `switch`). If a renderer-handled
 * `$type` were ever added to that switch without a matching `SCHEMA_BY_TYPE`
 * entry, the gate would silently treat every node of that type as
 * schema-unregistered — this test fails loudly instead by reading the
 * renderer's actual dispatch cases from source (not a hand-copied list,
 * which could drift silently) and diffing them against the registry's keys.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { SCHEMA_BY_TYPE, RENDERER_HANDLED_TYPES } from '../../src/schemas/schema-by-type.js';

const RENDER_CORE_SOURCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../codegen/src/emit/rosetta/rosetta-render-core.ts'
);

/** Extract every `case '<$type>':` inside `renderNode`'s dispatch switch. */
function extractRendererDispatchTypes(): string[] {
  const src = readFileSync(RENDER_CORE_SOURCE, 'utf-8');
  const start = src.indexOf('export function renderNode(');
  expect(start, 'renderNode export not found in rosetta-render-core.ts — has it moved?').toBeGreaterThan(-1);
  const switchStart = src.indexOf('switch (', start);
  const switchEnd = src.indexOf('\n}', switchStart);
  const switchBody = src.slice(switchStart, switchEnd);
  const matches = [...switchBody.matchAll(/case '([A-Za-z]+)':/g)];
  return matches.map((m) => m[1]!);
}

describe('SCHEMA_BY_TYPE exhaustiveness', () => {
  it('covers every $type renderNode dispatches on (read from render-core source)', () => {
    // Guard against a silently-empty extraction (e.g. the file moved/renamed)
    // masking a false pass.
    if (!existsSync(RENDER_CORE_SOURCE)) {
      throw new Error(`render-core source not found at ${RENDER_CORE_SOURCE} — update the path`);
    }
    const dispatchTypes = extractRendererDispatchTypes();
    expect(dispatchTypes.length).toBeGreaterThan(0);

    const missing = dispatchTypes.filter((t) => !(t in SCHEMA_BY_TYPE));
    expect(missing, `SCHEMA_BY_TYPE is missing renderer-handled $type(s): ${missing.join(', ')}`).toEqual([]);
  });

  it('RENDERER_HANDLED_TYPES matches the live renderNode dispatch set exactly', () => {
    const dispatchTypes = extractRendererDispatchTypes();
    expect(new Set(RENDERER_HANDLED_TYPES)).toEqual(new Set(dispatchTypes));
  });
});
