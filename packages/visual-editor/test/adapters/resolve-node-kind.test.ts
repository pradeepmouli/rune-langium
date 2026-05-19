// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { resolveNodeKind } from '../../src/adapters/model-helpers.js';

describe('resolveNodeKind', () => {
  it('resolves a user-authored AST node via data.$type', () => {
    const node = { id: 'ns::Foo', type: 'data', data: { $type: 'Data', name: 'Foo' } };
    expect(resolveNodeKind(node)).toBe('data');
  });

  it('resolves a curated enum via data.typeKind when $type is missing', () => {
    const node = { id: 'ns::E', type: 'enum', data: { typeKind: 'enum', name: 'E' } };
    expect(resolveNodeKind(node)).toBe('enum');
  });

  it('resolves a curated choice via data.typeKind in AST form (Choice)', () => {
    const node = { id: 'ns::C', type: 'choice', data: { typeKind: 'Choice', name: 'C' } };
    expect(resolveNodeKind(node)).toBe('choice');
  });

  it('falls back to React-Flow node.type when both $type and typeKind are missing', () => {
    const node = { id: 'ns::F', type: 'func', data: { name: 'F' } };
    expect(resolveNodeKind(node)).toBe('func');
  });

  it('accepts a raw data payload (without an enclosing React-Flow node wrapper)', () => {
    expect(resolveNodeKind({ $type: 'RosettaEnumeration', name: 'E' })).toBe('enum');
    expect(resolveNodeKind({ typeKind: 'choice', name: 'C' })).toBe('choice');
  });

  it("returns 'data' for null / undefined / unrecognised inputs", () => {
    expect(resolveNodeKind(null)).toBe('data');
    expect(resolveNodeKind(undefined)).toBe('data');
    expect(resolveNodeKind({})).toBe('data');
    expect(resolveNodeKind({ data: { $type: 'NotARealType' } })).toBe('data');
  });

  it('prefers data.$type over data.typeKind over node.type (priority order)', () => {
    // $type wins
    expect(resolveNodeKind({ type: 'enum', data: { $type: 'Data', typeKind: 'choice' } })).toBe('data');
    // typeKind wins over node.type when $type missing
    expect(resolveNodeKind({ type: 'data', data: { typeKind: 'enum' } })).toBe('enum');
  });
});

// ---------------------------------------------------------------------------
// Regression guard: ban the raw `AST_TYPE_TO_NODE_TYPE[…$type] ?? 'data'`
// pattern in production code. Every site that needs a node-kind lookup must
// go through resolveNodeKind so the curated fallback chain stays uniform.
//
// History: PR #208 (e2e-batch #1) added the fallback to selectedNodeType and
// graphNodesToAdapterDocument but missed 9 sibling sites that all silently
// degraded curated enum / choice / func / record entries to `'data'`. This
// guard exists so the next addition cannot re-introduce the same bug class.
// See feedback memory `fix-patterns-not-symptoms`.
// ---------------------------------------------------------------------------

describe('AST_TYPE_TO_NODE_TYPE raw-lookup guard', () => {
  // Walk packages/visual-editor/src/ and apps/studio/src/, look for the
  // banned pattern, allow only model-helpers.ts (the canonical site) and
  // editor-store.ts (inverse lookup of guaranteed AST type strings).
  const ALLOWED = new Set<string>([
    'packages/visual-editor/src/adapters/model-helpers.ts',
    'packages/visual-editor/src/store/editor-store.ts'
  ]);

  // Pattern: `AST_TYPE_TO_NODE_TYPE[` followed (within a line or two) by `$type` —
  // captures every variant we migrated, including those that pull `$type` off
  // an intermediate destructure (the ast-to-model.ts `$type ?? ''` case).
  const PATTERN = /AST_TYPE_TO_NODE_TYPE\s*\[[^\]]*\$type[^\]]*\]/;

  function walk(dir: string, out: string[]): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'test') continue;
        walk(p, out);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(p);
      }
    }
    return out;
  }

  it('has no raw $type lookups outside the allowed sites', () => {
    // Vitest runs with CWD set to the package root
    // (packages/visual-editor/), so the repo root is two levels up.
    const repoRoot = join(process.cwd(), '..', '..');
    const candidates: string[] = [];
    walk(join(repoRoot, 'packages', 'visual-editor', 'src'), candidates);
    walk(join(repoRoot, 'apps', 'studio', 'src'), candidates);

    const offenders: string[] = [];
    for (const file of candidates) {
      const rel = relative(repoRoot, file);
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      if (PATTERN.test(text)) offenders.push(rel);
    }

    expect(
      offenders,
      `Use resolveNodeKind() instead of indexing AST_TYPE_TO_NODE_TYPE with .$type directly. Offending files:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
