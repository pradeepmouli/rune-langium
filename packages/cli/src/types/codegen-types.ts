/**
 * Types for code generation via rosetta-code-generators.
 * @see specs/008-core-editor-features/data-model.md
 * @see specs/008-core-editor-features/contracts/codegen-api.md
 */

/** Request to generate code from Rune DSL model files. */
export interface CodeGenerationRequest {
  /** Target language (e.g., "java", "python", "scala", "csharp") */
  language: string;
  /** Serialized .rosetta file contents */
  modelFiles: string[];
  /** Generator-specific options */
  options: Record<string, string>;
}

/** Result of a code generation run. */
export interface CodeGenerationResult {
  /** Target language used */
  language: string;
  /** Output code files */
  files: GeneratedFile[];
  /** Errors encountered during generation */
  errors: GenerationError[];
  /** Non-fatal warnings */
  warnings: string[];
}

/** A single generated output file. */
export interface GeneratedFile {
  /** Output file path (e.g., "com/rosetta/model/MyType.java") */
  path: string;
  /** Generated source code */
  content: string;
}

/** Error encountered during code generation for a specific construct. */
export interface GenerationError {
  /** .rosetta file that caused the error */
  sourceFile: string;
  /** DSL construct that failed */
  construct: string;
  /** Error description */
  message: string;
}
