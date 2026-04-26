// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Known generators available in rosetta-code-generators.
 */

import type { GeneratorInfo } from './types.js';

/**
 * Known generators bundled with `rosetta-code-generators` and `rune-dsl`.
 *
 * @remarks
 * This list is maintained manually and reflects generators known at library
 * build time. Additional generators may be available in the installed
 * `rosetta-code-generators` version — use `--list-languages` on the CLI for
 * the authoritative runtime list.
 *
 * @category Codegen
 */
export const KNOWN_GENERATORS: readonly GeneratorInfo[] = [
  { id: 'scala', label: 'Scala' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'csharp9', label: 'C# 9' },
  { id: 'csharp8', label: 'C# 8' },
  { id: 'golang', label: 'Go' },
  { id: 'daml', label: 'DAML' },
  { id: 'jsonschema', label: 'JSON Schema' },
  { id: 'csv', label: 'CSV' },
  { id: 'excel', label: 'Excel' }
] as const;

/**
 * Check whether a language ID corresponds to a known generator.
 *
 * @useWhen Validating user-supplied `--language` input before submitting a
 *   {@link CodeGenerationRequest}.
 *
 * @param language - The generator ID to check (e.g., `"scala"`, `"typescript"`).
 * @returns `true` if the ID matches a generator in {@link KNOWN_GENERATORS}.
 *
 * @category Codegen
 */
export function isKnownGenerator(language: string): boolean {
  return KNOWN_GENERATORS.some((g) => g.id === language);
}

/**
 * Get generator metadata by ID.
 *
 * @param language - The generator ID to look up.
 * @returns The matching {@link GeneratorInfo}, or `undefined` if not found.
 *
 * @category Codegen
 */
export function getGenerator(language: string): GeneratorInfo | undefined {
  return KNOWN_GENERATORS.find((g) => g.id === language);
}
