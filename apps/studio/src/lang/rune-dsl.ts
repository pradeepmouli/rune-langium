/**
 * Rune DSL CodeMirror language support (T015).
 *
 * Provides syntax highlighting for .rosetta files using CodeMirror's
 * StreamLanguage parser. Keywords are sourced from the Langium grammar.
 */

import { StreamLanguage, type StringStream } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

// ────────────────────────────────────────────────────────────────────────────
// Keywords extracted from rune-dsl.langium
// ────────────────────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
  'namespace',
  'version',
  'import',
  'as',
  'type',
  'extends',
  'enum',
  'choice',
  'annotation',
  'basicType',
  'recordType',
  'typeAlias',
  'metaType',
  'func',
  'function',
  'library',
  'rule',
  'reporting',
  'report',
  'source',
  'synonym',
  'body',
  'corpus',
  'segment',
  'override',
  'scope',
  'if',
  'then',
  'else',
  'switch',
  'default',
  'and',
  'or',
  'exists',
  'absent',
  'is',
  'contains',
  'disjoint',
  'count',
  'all',
  'any',
  'extract',
  'filter',
  'reduce',
  'map',
  'flatten',
  'distinct',
  'first',
  'last',
  'reverse',
  'sort',
  'min',
  'max',
  'sum',
  'join',
  'from',
  'for',
  'in',
  'to',
  'with',
  'using',
  'when',
  'condition',
  'set',
  'add',
  'remove',
  'only',
  'single',
  'multiple',
  'optional',
  'required',
  'inputs',
  'output',
  'eligibility',
  'provision',
  'merge',
  'root',
  'super',
  'item',
  'value',
  'path',
  'empty'
]);

const TYPE_KEYWORDS = new Set([
  'type',
  'enum',
  'choice',
  'basicType',
  'recordType',
  'typeAlias',
  'metaType',
  'annotation'
]);

const BOOLEANS = new Set(['True', 'False']);

// ────────────────────────────────────────────────────────────────────────────
// Stream parser state
// ────────────────────────────────────────────────────────────────────────────

interface RuneDslState {
  /** Whether we're inside a multi-line comment. */
  inBlockComment: boolean;
  /** Whether the previous token was a type keyword. */
  expectTypeName: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Stream parser implementation
// ────────────────────────────────────────────────────────────────────────────

export const runeDslStreamParser = {
  name: 'rune-dsl',

  startState(): RuneDslState {
    return { inBlockComment: false, expectTypeName: false };
  },

  token(stream: StringStream, state: RuneDslState): string | null {
    // Continue block comment
    if (state.inBlockComment) {
      if (stream.match('*/')) {
        state.inBlockComment = false;
      } else {
        stream.next();
      }
      return 'comment';
    }

    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Block comment start
    if (stream.match('/*')) {
      state.inBlockComment = true;
      return 'comment';
    }

    // Line comment
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Strings
    if (stream.match(/^"(?:\\.|[^"\\])*"/)) return 'string';
    if (stream.match(/^'(?:\\.|[^'\\])*'/)) return 'string';

    // Numbers
    if (stream.match(/^[0-9]+(?:\.[0-9]+)?/)) return 'number';

    // Identifiers and keywords
    if (stream.match(/^[a-zA-Z_][a-zA-Z_0-9]*/)) {
      const word = stream.current();

      if (BOOLEANS.has(word)) return 'bool';

      if (state.expectTypeName) {
        state.expectTypeName = false;
        return 'typeName';
      }

      if (TYPE_KEYWORDS.has(word)) {
        state.expectTypeName = true;
        return 'keyword';
      }

      if (KEYWORDS.has(word)) return 'keyword';

      return 'variableName';
    }

    // Operators / punctuation
    if (stream.match(/^[<>!=]+/)) return 'operator';
    if (stream.match(/^[-+*/]/)) return 'operator';

    // Skip unrecognised character
    stream.next();
    return null;
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * CodeMirror language extension for Rune DSL syntax highlighting.
 */
export function runeDslLanguage(): Extension {
  return StreamLanguage.define(runeDslStreamParser);
}
