#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Generates a typed TypeScript module from any tree-sitter grammar's
 * `node-types.json` — the machine-readable description of every node kind's
 * named fields every tree-sitter grammar package ships.
 *
 * Generic across grammars (not SQL-specific): a future tree-sitter reader
 * for a different grammar reuses this same script with its own
 * --input/--output/--prefix, rather than a bespoke generator per grammar.
 *
 * Pure type-level (no-codegen) derivation from an IMPORTED node-types.json
 * was tried and rejected: TypeScript's `resolveJsonModule` always widens
 * primitive types on import (confirmed on a real 552-entry grammar file
 * AND a minimal one-property control case — not a size artifact), and
 * neither `as const` (rejects import references) nor a `const` type
 * parameter (cannot restore literal-ness already lost at the import
 * boundary) recovers it. The only way to get a real literal-typed
 * discriminated union is for the data to exist as an actual `.ts` literal
 * expression at the point the assertion applies — hence this one-time
 * generator instead of a live build-time step. Regenerate manually when
 * the pinned grammar version bumps.
 *
 * Usage:
 *   node scripts/generate-tree-sitter-node-types.mjs \
 *     --input node_modules/@l1xnan/tree-sitter-sql/src/node-types.json \
 *     --output src/import/sources/generated/sql-node-types.ts \
 *     --prefix Sql
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--${key} requires a value`);
      }
      args[key] = value;
      i++;
    }
  }
  return args;
}

function main() {
  const { input, output, prefix } = parseArgs(process.argv.slice(2));
  if (!input || !output || !prefix) {
    throw new Error(
      'Usage: generate-tree-sitter-node-types.mjs --input <node-types.json> --output <out.ts> --prefix <TypeNamePrefix>'
    );
  }

  const raw = JSON.parse(readFileSync(input, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${input}: expected a JSON array of node-type entries, got ${typeof raw}`);
  }

  const constName = `${prefix.toUpperCase()}_NODE_TYPES`;
  const literalSource = JSON.stringify(raw, null, 2);

  const contents = `// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Generated from ${input} by
 * scripts/generate-tree-sitter-node-types.mjs. Regenerate with:
 *   pnpm --filter @rune-langium/codegen run generate:${prefix.toLowerCase()}-node-types
 *
 * Contains the FULL node-type vocabulary of the grammar this was
 * generated from (every entry, not a curated subset) — a reader's own
 * hand-written code only ever consults the handful of kinds it needs;
 * this file exists so that lookup is real-field-name-typed rather than
 * positional/string-scanned, wherever the grammar declares a field.
 */

export const ${constName} = ${literalSource} as const;

/** Every node kind name in the grammar. */
export type ${prefix}NodeKind = (typeof ${constName})[number]['type'];

/** The raw node-types.json entry for a given kind. */
export type ${prefix}NodeEntry<K extends ${prefix}NodeKind> = Extract<(typeof ${constName})[number], { type: K }>;

/** The field names the grammar declares for a given kind (never if it declares none). */
export type ${prefix}NodeFields<K extends ${prefix}NodeKind> =
  ${prefix}NodeEntry<K> extends { fields: infer F } ? keyof F : never;
`;

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
  console.log(`✓ Generated ${output} (${raw.length} node-type entries from ${input})`);
}

main();
