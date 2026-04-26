// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The three supported generator targets.
 * FR-019 (json-schema), FR-020 (typescript), FR-002–FR-014 (zod).
 */
export type Target = 'zod' | 'json-schema' | 'typescript';

/**
 * Options for a generation run.
 * FR-001 (target selection), FR-022 (strict mode).
 */
export interface GeneratorOptions {
  /** Selects the emitter pipeline. Defaults to 'zod'. */
  target?: Target;
  /**
   * If true, any GeneratorDiagnostic with severity 'error' causes
   * generate() to throw a GeneratorError instead of returning a partial result.
   * FR-022.
   */
  strict?: boolean;
  /**
   * Optional string prepended to each emitted file's header comment.
   * Do NOT set when requiring byte-identical output (SC-007).
   */
  headerComment?: string;
}

/**
 * One source-map entry: maps an output line back to a source location.
 * FR-024 (source maps).
 */
export interface SourceMapEntry {
  /** Output line number (zero-based). */
  outputLine: number;
  /** URI of the source Rune document. */
  sourceUri: string;
  /** Source line number (one-based). */
  sourceLine: number;
  /** Source character offset (one-based). */
  sourceChar: number;
}

/**
 * A generator-time diagnostic (not a Langium validation diagnostic).
 * FR-025 (diagnostics).
 */
export interface GeneratorDiagnostic {
  /** Severity of the diagnostic. */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message describing the issue. */
  message: string;
  /** Short diagnostic code (e.g. 'unresolved-ref', 'unknown-attribute'). */
  code: string;
  /** Source URI where the issue was detected, if known. */
  sourceUri?: string;
  /** Source line (one-based), if known. */
  line?: number;
  /** Source character offset (one-based), if known. */
  char?: number;
}

/**
 * Metadata for a single emitted Rune `func` (TypeScript target only).
 * FR-028–FR-032 (function declarations, US6).
 */
export interface GeneratedFunc {
  /** The func's identifier as declared in the Rune model. */
  name: string;
  /**
   * The relative output path of the module file containing this func
   * (same as the enclosing GeneratorOutput.relativePath).
   */
  relativePath: string;
  /**
   * The full text of just the emitted function declaration (subset of
   * GeneratorOutput.content). Useful for unit-testing the emitter in
   * isolation without parsing the full file.
   */
  fileContents: string;
  /**
   * Source-map entries scoped to this function's output lines.
   * A subset of the enclosing GeneratorOutput.sourceMap.
   */
  sourceMap: SourceMapEntry[];
}

/**
 * One emitted output file from the generator.
 * FR-001 (output structure).
 */
export interface GeneratorOutput {
  /** Relative path of the emitted file (e.g. 'cdm/base/math.zod.ts'). */
  relativePath: string;
  /** Full text content of the emitted file. */
  content: string;
  /** Source-map entries for this file. */
  sourceMap: SourceMapEntry[];
  /** Diagnostics produced during generation of this file. */
  diagnostics: GeneratorDiagnostic[];
  /**
   * Emitted function declarations for this namespace.
   * Non-empty only when target === 'typescript' (FR-028, FR-031).
   * Empty array for 'zod' and 'json-schema' targets — funcs are silently
   * skipped (FR-031).
   */
  funcs: GeneratedFunc[];
}

/**
 * Thrown when strict mode is enabled and any error diagnostic is produced.
 * FR-022.
 */
export class GeneratorError extends Error {
  /** The diagnostics that caused this error. */
  readonly diagnostics: GeneratorDiagnostic[];

  constructor(message: string, diagnostics: GeneratorDiagnostic[]) {
    super(message);
    this.name = 'GeneratorError';
    this.diagnostics = diagnostics;
  }
}
