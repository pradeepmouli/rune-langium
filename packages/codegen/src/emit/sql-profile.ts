// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SQL LanguageProfile. SQL has no module system (no barrel) and no runtime
 * sidecar. `single-file` bundling concatenates every per-namespace DDL into one
 * `model.sql`, preserving each namespace's statements as produced by the
 * per-namespace emitter. No singleFileLimits — one script is the canonical
 * deliverable for DDL.
 */
import type { GeneratorOutput } from '../types.js';
import type { LanguageProfile } from './language-profile.js';

export const sqlProfile: LanguageProfile<'sql'> = {
  target: 'sql',
  extension: '.sql',
  basicTypeMap: { boolean: 'BOOLEAN', number: 'NUMERIC', string: 'TEXT', time: 'TIME', pattern: 'TEXT' },
  recordTypeMap: { date: 'DATE', dateTime: 'TIMESTAMP', zonedDateTime: 'TIMESTAMPTZ' },
  typeAliasMap: { int: 'INTEGER', productType: 'TEXT', eventType: 'TEXT', calculation: 'TEXT' },
  libraryFuncMap: {},
  makeBarrel() {
    return undefined; // SQL has no module system.
  },
  concatenate(perNs): GeneratorOutput {
    // Alphabetical ordering is deterministic but NOT FK-safe across namespaces:
    // if namespace A references types in namespace B and 'A' < 'B' lexically, the
    // emitted FK precedes B's CREATE TABLE. Single-namespace models are always
    // safe; multi-namespace consumers should apply with deferred FK enforcement or
    // use the per-namespace layout and apply in dependency order. (Known
    // limitation — cross-namespace FK ordering is out of scope for this phase.)
    const sorted = [...perNs].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const content = sorted.map((o) => o.content.trimEnd()).join('\n\n') + '\n';
    const tableNames = [...content.matchAll(/CREATE TABLE ["[]([^"\]]+)["\]]/g)]
      .map((m) => m[1])
      .filter((t): t is string => t !== undefined);
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const t of tableNames) {
      if (seen.has(t)) dupes.add(t);
      else seen.add(t);
    }
    const dupeDiagnostics =
      dupes.size > 0
        ? [
            {
              severity: 'warning' as const,
              code: 'sql-duplicate-table',
              message: `Duplicate table name(s) across namespaces in the single-file bundle: ${[...dupes].sort().join(', ')}. Apply per-namespace, or namespace-qualify (future).`
            }
          ]
        : [];
    return {
      relativePath: 'model.sql',
      content,
      sourceMap: [],
      diagnostics: [...sorted.flatMap((o) => o.diagnostics), ...dupeDiagnostics],
      funcs: []
    };
  },
  makeSharedArtifacts() {
    return [];
  }
};
