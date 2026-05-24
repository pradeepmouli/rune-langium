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
    const sorted = [...perNs].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const content = sorted.map((o) => o.content.trimEnd()).join('\n\n') + '\n';
    return {
      relativePath: 'model.sql',
      content,
      sourceMap: [],
      diagnostics: sorted.flatMap((o) => o.diagnostics),
      funcs: []
    };
  },
  makeSharedArtifacts() {
    return [];
  }
};
