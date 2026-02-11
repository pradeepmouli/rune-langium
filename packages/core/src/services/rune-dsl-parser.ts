import type { AstNode, LangiumCoreServices } from 'langium';
import type { ParseResult, ParserOptions } from 'langium';
import { LangiumParser, createParser } from 'langium';

/**
 * Custom parser for the Rune DSL that pre-processes input text to insert
 * implicit `[` and `]` brackets around bare expressions after `extract`,
 * `filter`, and `reduce` operators.
 *
 * ## Background
 *
 * In the Xtext-based Rune DSL, `extract`/`filter`/`reduce` can accept both
 * bracket-delimited inline functions (`extract [body]`) and bare expressions
 * (`extract FuncName(item)`), using the `=>` syntactic predicate to resolve
 * the ambiguity. Langium's LL(k) parser (Chevrotain) cannot replicate this —
 * adding both alternatives causes the parser builder to hang indefinitely
 * during FIRST(k) set computation.
 *
 * This parser works around the limitation by transforming the input text
 * before parsing: bare expressions after `extract`/`filter`/`reduce` are
 * wrapped in `[` and `]` so the standard InlineFunction grammar rule can
 * handle them.
 */
export class RuneDslParser extends LangiumParser {
  constructor(services: LangiumCoreServices) {
    super(services);
  }

  override parse<T extends AstNode = AstNode>(
    input: string,
    options?: ParserOptions
  ): ParseResult<T> {
    const transformed = insertImplicitBrackets(input);
    return super.parse<T>(transformed, options);
  }
}

/**
 * Factory function that creates and initializes a RuneDslParser.
 * Drop-in replacement for `createLangiumParser`.
 */
export function createRuneDslParser(services: LangiumCoreServices): RuneDslParser {
  const grammar = services.Grammar;
  const lexer = services.parser.Lexer;
  const parser = new RuneDslParser(services);
  createParser(grammar, parser, lexer.definition);
  parser.finalize();
  return parser;
}

// ═══════════════════════════════════════════════════════════════════
// Text pre-processor: inserts implicit brackets for bare expressions
// ═══════════════════════════════════════════════════════════════════

/**
 * Keywords that start extract/filter/reduce bare expressions.
 * When these appear and are NOT followed by `[`, the subsequent
 * expression is a bare ImplicitInlineFunction body.
 */
const FUNCTIONAL_OPS = new Set(['extract', 'filter', 'reduce']);

/**
 * Statement-level keywords that terminate an expression on the next line.
 * If the line following a bare expression starts with one of these,
 * the expression ends at the preceding newline.
 */
const STATEMENT_KEYWORDS = new Set([
  'then',
  'func',
  'type',
  'enum',
  'namespace',
  'import',
  'body',
  'reporting',
  'rule',
  'eligibility',
  'alias',
  'set',
  'add',
  'output',
  'input',
  'condition',
  'post-condition',
  'assign-output',
  'annotation',
  'library',
  'corpus',
  'segment',
  'isda',
  'typeAlias',
  'calculationType',
  'isProduct',
  'isEvent',
  'metaType',
  'basicType',
  'recordType',
  'qualifiedType',
  // operators that indicate a new chained operation (terminators)
  'extract',
  'filter',
  'reduce',
  'sort',
  'min',
  'max',
  'flatten',
  'distinct',
  'reverse',
  'first',
  'last',
  'count',
  'sum',
  'to-string',
  'to-number',
  'to-int',
  'to-time',
  'to-date',
  'to-date-time',
  'to-zoned-date-time',
  'to-enum',
  'only-element',
  'one-of',
  'join',
  'default',
  'switch',
  'contains',
  'disjoint',
  // choice/exists at start of line end an expression
  'optional',
  'required'
]);

/**
 * Keywords that continue an expression on the next line
 * (binary operators, logical connectors, etc.)
 */
const CONTINUATION_KEYWORDS = new Set([
  'and',
  'or',
  'then',
  'exists',
  'is',
  'absent',
  'count',
  'only-element',
  'one-of',
  'contains',
  'disjoint',
  'default',
  'join',
  'to-string',
  'to-number',
  'to-int',
  'to-time',
  'to-date',
  'to-date-time',
  'to-zoned-date-time',
  'to-enum'
]);

/**
 * Checks if a character is a word character (part of an identifier).
 */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

/**
 * Scans the input text and inserts `[` and `]` around bare expressions
 * that follow `extract`, `filter`, or `reduce` operators.
 *
 * The algorithm:
 * 1. Scan character-by-character, skipping strings and comments
 * 2. When a functional operator keyword is found:
 *    a. Check if followed by `[` — if so, skip (already InlineFunction)
 *    b. Check if followed by `ID [` or `ID ,` — if so, skip (closure param form)
 *    c. Otherwise, insert `[` before the bare expression and `]` at its end
 * 3. Expression end is determined by tracking nesting depth and looking
 *    for terminators (comma, closing bracket, newline + statement keyword)
 *
 * Multi-line support: when the keyword is at end of line (followed by
 * newline + whitespace), we look at the next line. If it starts with an
 * expression token (ID, `(`, `-`, `+`, etc.) and NOT a statement keyword,
 * we treat the next line as the start of a bare expression.
 */
export function insertImplicitBrackets(text: string): string {
  const insertions: Array<{ pos: number; ch: string }> = [];

  let i = 0;
  while (i < text.length) {
    // Skip string literals
    if (text[i] === '"') {
      i = skipString(text, i);
      continue;
    }

    // Skip line comments
    if (text[i] === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i);
      continue;
    }

    // Skip block comments
    if (text[i] === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }

    // Check for functional operator keyword
    const keyword = matchFunctionalOp(text, i);
    if (keyword) {
      const keywordEnd = i + keyword.length;

      // Skip whitespace (including newlines) after keyword to find start of body
      let pos = skipWhitespaceAndNewlines(text, keywordEnd);

      // If EOF or already `[` → skip
      if (pos >= text.length || text[pos] === '[') {
        i = keywordEnd;
        continue;
      }

      // If followed by ID then `[` or `,` → closure param form, skip
      if (isWordChar(text[pos])) {
        const idEnd = scanIdentifier(text, pos);
        let afterId = idEnd;
        while (afterId < text.length && (text[afterId] === ' ' || text[afterId] === '\t')) {
          afterId++;
        }
        if (afterId < text.length && (text[afterId] === '[' || text[afterId] === ',')) {
          // Check: is this really closure params? `extract p1, p2 [body]`
          // Or could be: `extract FuncName(arg1, arg2)`
          // For comma case, scan ahead to find `[` to confirm closure form
          if (text[afterId] === '[') {
            // `extract param [body]` — closure parameter form
            i = keywordEnd;
            continue;
          }
          // Comma after ID — could be closure `extract p1, p2 [body]`
          // or could be inside a constructor `extract ... , key: val`
          // Scan ahead: if we find `[` before newline/`;`, it's closure params
          if (isClosureParamList(text, pos)) {
            i = keywordEnd;
            continue;
          }
        }

        // Check if the word is a statement keyword — then it's not a bare expr
        const word = text.substring(pos, idEnd);
        if (STATEMENT_KEYWORDS.has(word)) {
          i = keywordEnd;
          continue;
        }
      }

      // Check if the position starts with something that can't be an expression
      const ch = text[pos];
      if (ch === ')' || ch === '}' || ch === ']') {
        i = keywordEnd;
        continue;
      }

      // Bare expression detected — find its boundaries
      const exprEnd = findExpressionEnd(text, pos);

      if (exprEnd > pos) {
        insertions.push({ pos, ch: '[' });
        insertions.push({ pos: exprEnd, ch: ']' });
      }

      i = exprEnd;
      continue;
    }

    i++;
  }

  if (insertions.length === 0) {
    return text;
  }

  // Apply insertions in reverse order to preserve positions
  let result = text;
  for (let j = insertions.length - 1; j >= 0; j--) {
    const ins = insertions[j]!;
    result = result.substring(0, ins.pos) + ins.ch + result.substring(ins.pos);
  }

  return result;
}

/**
 * Checks if position `start` begins a closure parameter list:
 * `p1, p2 [body]` — IDs separated by commas, then `[`.
 */
function isClosureParamList(text: string, start: number): boolean {
  let pos = start;
  while (pos < text.length) {
    // Expect an ID
    if (!isWordChar(text[pos])) return false;
    pos = scanIdentifier(text, pos);

    // Skip whitespace
    while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) pos++;

    if (pos >= text.length) return false;
    if (text[pos] === '[') return true; // Found `[` after params
    if (text[pos] !== ',') return false; // Not a comma → not closure params
    pos++; // skip comma

    // Skip whitespace after comma
    while (pos < text.length && (text[pos] === ' ' || text[pos] === '\t')) pos++;
  }
  return false;
}

/**
 * Matches a functional operator keyword at position `i` in the text.
 * Returns the keyword string if found (with word boundaries), or null.
 */
function matchFunctionalOp(text: string, i: number): string | null {
  for (const kw of FUNCTIONAL_OPS) {
    if (text.startsWith(kw, i)) {
      // Check word boundaries
      if (i > 0 && isWordChar(text[i - 1])) continue;
      const end = i + kw.length;
      if (end < text.length && isWordChar(text[end])) continue;
      return kw;
    }
  }
  return null;
}

/**
 * Scans forward from `start` to find the end of a bare expression.
 *
 * Tracks nesting of `()`, `{}`, `[]`. The expression ends when:
 * - `,` at depth 0 (constructor/list separator)
 * - `)` or `}` or `]` at depth 0 (closing bracket from outer context)
 * - newline at depth 0 NOT followed by a continuation line
 * - EOF
 *
 * A "continuation line" is one where the first non-whitespace content
 * is NOT a statement keyword and looks like expression continuation
 * (operators, feature calls, identifiers that continue the expression).
 */
function findExpressionEnd(text: string, start: number): number {
  let depth = 0;
  let i = start;

  while (i < text.length) {
    const ch = text[i];

    // Skip string literals
    if (ch === '"') {
      i = skipString(text, i);
      continue;
    }

    // Skip comments
    if (ch === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      continue;
    }

    // Track nesting
    if (ch === '(' || ch === '{' || ch === '[') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth <= 0) return i; // Closing bracket from outer context
      depth--;
      i++;
      continue;
    }

    // Comma at depth 0 ends the expression
    if (ch === ',' && depth === 0) {
      return i;
    }

    // Newline at depth 0 — check if expression continues
    if ((ch === '\n' || ch === '\r') && depth === 0) {
      // Skip the newline sequence (\r\n or \n)
      const nlEnd = ch === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
      const nextNonWs = findNextNonWhitespaceOnLine(text, nlEnd);

      // If we hit another newline or EOF, expression ends
      if (nextNonWs >= text.length || text[nextNonWs] === '\n' || text[nextNonWs] === '\r') {
        return i;
      }

      // Check if next line starts with a statement keyword
      const nextWord = extractWord(text, nextNonWs);
      if (nextWord && STATEMENT_KEYWORDS.has(nextWord)) {
        return i; // Statement keyword → expression ends here
      }

      // Check for closing tokens at start of next line
      const nextCh = text[nextNonWs];
      if (nextCh === ')' || nextCh === ']') {
        return i;
      }

      // Lines starting with `->` or `->>` are feature call continuations
      if (text.startsWith('->', nextNonWs)) {
        i = nlEnd;
        continue;
      }

      // Lines starting with operators that continue binary expressions
      if (nextCh === '+' || nextCh === '-' || nextCh === '*' || nextCh === '/') {
        i = nlEnd;
        continue;
      }

      // Lines starting with 'and', 'or', 'then', comparison ops continue
      if (nextWord && CONTINUATION_KEYWORDS.has(nextWord)) {
        i = nlEnd;
        continue;
      }

      // Lines starting with `=`, `<>`, `>=`, `<=` continue
      if (nextCh === '=' || nextCh === '<' || nextCh === '>') {
        i = nlEnd;
        continue;
      }

      // If the current line's expression is inside a construct started
      // by this bare expression (i.e. we're mid-expression), the next
      // line starting with an ID that has more indentation than the
      // expression start should continue the expression
      const startCol = getColumnOfPos(text, start);
      const nextCol = getColumnOfPos(text, nextNonWs);

      // If next line is indented deeper than the expression start,
      // it's a continuation (e.g., multi-line constructor body,
      // multi-line if-then-else, etc.)
      if (nextCol > startCol) {
        i = nlEnd;
        continue;
      }

      // By default, expression ends at newline
      return i;
    }

    i++;
  }

  return i; // EOF
}

// ═══════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════

function skipString(text: string, start: number): number {
  let i = start + 1; // skip opening "
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2; // skip escape
      continue;
    }
    if (text[i] === '"') {
      return i + 1; // skip closing "
    }
    i++;
  }
  return i;
}

function skipLineComment(text: string, start: number): number {
  let i = start + 2; // skip //
  while (i < text.length && text[i] !== '\n') i++;
  return i;
}

function skipBlockComment(text: string, start: number): number {
  let i = start + 2; // skip /*
  while (i < text.length - 1) {
    if (text[i] === '*' && text[i + 1] === '/') {
      return i + 2;
    }
    i++;
  }
  return text.length;
}

function scanIdentifier(text: string, start: number): number {
  let i = start;
  while (i < text.length && isWordChar(text.charAt(i))) i++;
  return i;
}

function findNextNonWhitespace(text: string, start: number): number {
  let i = start;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\r')) {
    i++;
  }
  return i;
}

/**
 * Finds the next non-whitespace character on the same line (does not skip newlines).
 * Skips spaces, tabs, and \r only.
 */
function findNextNonWhitespaceOnLine(text: string, start: number): number {
  let i = start;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\r')) {
    i++;
  }
  return i;
}

/**
 * Skips whitespace INCLUDING newlines to find the next content.
 */
function skipWhitespaceAndNewlines(text: string, start: number): number {
  let i = start;
  while (
    i < text.length &&
    (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || text[i] === '\n')
  ) {
    i++;
  }
  return i;
}

/**
 * Gets the column (0-based) of a position in the text,
 * counting from the start of its line.
 */
function getColumnOfPos(text: string, pos: number): number {
  let col = 0;
  let i = pos - 1;
  while (i >= 0 && text[i] !== '\n' && text[i] !== '\r') {
    col++;
    i--;
  }
  return col;
}

function extractWord(text: string, start: number): string | null {
  if (start >= text.length || !/[a-zA-Z_]/.test(text.charAt(start))) {
    return null;
  }
  // Handle hyphenated keywords like 'to-string', 'only-element'
  let end = start;
  while (end < text.length && /[\w-]/.test(text.charAt(end))) {
    end++;
  }
  // Remove trailing hyphens
  while (end > start && text[end - 1] === '-') {
    end--;
  }
  return text.substring(start, end);
}
