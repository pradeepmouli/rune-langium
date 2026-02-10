import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import type { RosettaModel } from '../generated/ast.js';
import { createRuneDslServices } from '../services/rune-dsl-module.js';

/**
 * Result of parsing a Rosetta DSL source string.
 */
export interface ParseResult {
  /** The root AST node. */
  value: RosettaModel;
  /** Lexer errors encountered during parsing. */
  lexerErrors: Array<{
    message: string;
    offset: number;
    line?: number | undefined;
    column?: number | undefined;
  }>;
  /** Parser errors encountered during parsing. */
  parserErrors: Array<{
    message: string;
    offset?: number | undefined;
    line?: number | undefined;
    column?: number | undefined;
  }>;
  /** Whether the parse completed without errors. */
  hasErrors: boolean;
}

let _services: ReturnType<typeof createRuneDslServices> | undefined;

function getServices() {
  if (!_services) {
    _services = createRuneDslServices();
  }
  return _services;
}

/**
 * Parse a Rosetta DSL source string into a typed AST.
 *
 * @param input - The Rosetta DSL source text.
 * @param uri   - Optional URI for the document (defaults to `inmemory://model.rosetta`).
 * @returns A `ParseResult` with the root `RosettaModel` node and any errors.
 */
export async function parse(input: string, uri?: string): Promise<ParseResult> {
  const { RuneDsl } = getServices();
  const documentUri = URI.parse(uri ?? 'inmemory:///model.rosetta');
  const document: LangiumDocument<RosettaModel> =
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(input, documentUri);

  await RuneDsl.shared.workspace.DocumentBuilder.build([document]);

  const model = document.parseResult.value as RosettaModel;
  const lexerErrors = document.parseResult.lexerErrors.map((e) => ({
    message: e.message,
    offset: e.offset,
    line: e.line,
    column: e.column
  }));
  const parserErrors = document.parseResult.parserErrors.map((e) => ({
    message: e.message,
    offset: e.token?.startOffset,
    line: e.token?.startLine,
    column: e.token?.startColumn
  }));

  return {
    value: model,
    lexerErrors,
    parserErrors,
    hasErrors: lexerErrors.length > 0 || parserErrors.length > 0
  };
}
