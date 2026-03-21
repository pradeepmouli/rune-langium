// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Known generators available in rosetta-code-generators.
 */

import type { GeneratorInfo } from './types.js';

/** Known generators from rosetta-code-generators and rune-dsl. */
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
 * Check if a language ID corresponds to a known generator.
 */
export function isKnownGenerator(language: string): boolean {
  return KNOWN_GENERATORS.some((g) => g.id === language);
}

/**
 * Get generator info by ID.
 */
export function getGenerator(language: string): GeneratorInfo | undefined {
  return KNOWN_GENERATORS.find((g) => g.id === language);
}
