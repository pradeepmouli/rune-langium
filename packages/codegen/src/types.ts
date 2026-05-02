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

export type PreviewFieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'array'
  | 'unknown';

export interface PreviewFieldBase {
  path: string;
  label: string;
  required: boolean;
  cardinality?: { min?: number; max?: number | 'unbounded' };
  description?: string;
}

export interface PreviewScalarField extends PreviewFieldBase {
  kind: 'string' | 'number' | 'boolean';
}

export interface PreviewEnumField extends PreviewFieldBase {
  kind: 'enum';
  enumValues: Array<{ value: string; label: string }>;
}

export interface PreviewObjectField extends PreviewFieldBase {
  kind: 'object';
  children: PreviewField[];
}

export interface PreviewArrayField extends PreviewFieldBase {
  kind: 'array';
  children: [PreviewField];
}

export interface PreviewUnknownField extends PreviewFieldBase {
  kind: 'unknown';
}

export type PreviewField =
  | PreviewScalarField
  | PreviewEnumField
  | PreviewObjectField
  | PreviewArrayField
  | PreviewUnknownField;

export interface PreviewSourceMapEntry {
  fieldPath: string;
  sourceUri: string;
  sourceLine: number;
  sourceChar: number;
}

export type FormPreviewKind = 'data' | 'typeAlias' | 'choice' | 'function';

export interface FormPreviewSchema {
  schemaVersion: 1;
  targetId: string;
  title: string;
  kind?: FormPreviewKind;
  status: 'ready' | 'unsupported';
  fields: PreviewField[];
  unsupportedFeatures?: string[];
  sourceMap?: PreviewSourceMapEntry[];
}

/**
 * Options for `generatePreviewSchemas()`.
 *
 * `targetId` narrows generation to a single data type / form target. When
 * omitted, schemas are generated for every data target in the document set;
 * targets that cannot produce a preview schema are marked as unsupported.
 */
export interface GeneratePreviewSchemaOptions {
  /** Generate only the schema for this fully-qualified target id. */
  targetId?: string;
  /** Maximum recursion depth to follow when expanding nested object fields. */
  maxDepth?: number;
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
