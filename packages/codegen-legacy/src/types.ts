// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Types for code generation via rosetta-code-generators.
 *
 * @remarks
 * Code generation delegates to the `rosetta-code-generators` Java/Scala toolchain
 * via a CLI subprocess proxy. These types describe the JSON request/response
 * protocol between the TypeScript CLI and the JVM-based generator.
 *
 * Requires Java 21+ and a built `rosetta-code-generators` JAR on the host.
 * Run `pnpm codegen:build-deps && pnpm codegen:build` to prepare.
 *
 * @see specs/008-core-editor-features/data-model.md
 * @see specs/008-core-editor-features/contracts/codegen-api.md
 *
 * @category Codegen
 */

/**
 * Request to generate code from one or more Rune DSL model files.
 *
 * @config
 * - `language` — must match a known generator ID (see {@link KNOWN_GENERATORS}).
 *   Use `isKnownGenerator()` to validate before submitting.
 * - `files` — all `.rosetta` source files needed for the generation context,
 *   including reference/dependency models. Files not listed here will not be
 *   available for cross-namespace type resolution in the generator.
 * - `options` — generator-specific key-value pairs forwarded to the JVM generator.
 *   Keys and valid values depend on the generator implementation.
 *
 * @pitfalls
 * - NEVER include only a subset of required namespace files — generators that
 *   perform cross-namespace type resolution will produce incomplete output or
 *   fail silently if dependency types are missing.
 * - Regenerating target files does NOT preserve user edits — output files are
 *   always overwritten. Store generated output in a separate directory and
 *   never hand-edit it.
 *
 * @category Codegen
 */
export interface CodeGenerationRequest {
  /** Target language (e.g., "scala", "typescript", "kotlin"). See {@link KNOWN_GENERATORS}. */
  language: string;
  /** `.rosetta` files with absolute path and content, including all dependency namespaces. */
  files: Array<{ path: string; content: string }>;
  /** Generator-specific options forwarded to the JVM generator as key-value pairs. */
  options?: Record<string, string>;
}

/**
 * Result of a code generation run.
 *
 * @remarks
 * A non-empty `errors` array does not always mean zero output files — generators
 * may emit partial output alongside errors. Always check `errors.length` explicitly
 * rather than relying on `files.length === 0` to detect failure.
 *
 * @pitfalls
 * - Mixed-severity output: `errors` and `warnings` may both be non-empty while
 *   `files` is also non-empty. Do not treat the presence of output files as
 *   indicating a clean generation run.
 *
 * @category Codegen
 */
export interface CodeGenerationResult {
  /** Target language used */
  language: string;
  /** Output code files */
  files: GeneratedFile[];
  /** Errors encountered during generation (may coexist with partial output). */
  errors: GenerationError[];
  /** Non-fatal warnings */
  warnings: string[];
}

/**
 * A single generated output file.
 *
 * @remarks
 * The `path` is relative to the configured output directory. Use it as the
 * last argument to `path.resolve(outputDir, file.path)` when writing to disk.
 *
 * @category Codegen
 */
export interface GeneratedFile {
  /** Output file path relative to the output directory (e.g., `"com/rosetta/model/MyType.java"`). */
  path: string;
  /** Generated source code content. */
  content: string;
}

/**
 * An error encountered during code generation for a specific DSL construct.
 *
 * @category Codegen
 */
export interface GenerationError {
  /** `.rosetta` file that caused the error */
  sourceFile: string;
  /** DSL construct that failed (e.g., type name or function name) */
  construct: string;
  /** Error description */
  message: string;
}

/**
 * Metadata about a known code generator.
 *
 * @category Codegen
 */
export interface GeneratorInfo {
  /** Generator identifier used in the CLI and API (e.g., `"java"`, `"scala"`). */
  id: string;
  /** Human-readable label for display (e.g., `"Scala"`). */
  label: string;
}
