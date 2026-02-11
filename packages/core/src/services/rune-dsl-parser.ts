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
  'contains',
  'disjoint',
  // choice/exists at start of line end an expression
  'optional',
  'required'
]);

/**
 * Keywords that continue an expression on the next line
 * (binary operators, logical connectors, etc.)
 *
 * NOTE: Some entries overlap with STATEMENT_KEYWORDS intentionally.
 * Whether a keyword terminates or continues depends on execution order:
 * CONTINUATION_KEYWORDS is only checked inside `findExpressionEnd` after
 * a newline, where indentation determines the outcome — keywords at the
 * same or deeper indentation continue the expression, while those at
 * shallower indentation terminate it. STATEMENT_KEYWORDS is checked
 * first (before entering `findExpressionEnd`) to reject bare expressions
 * that start with a statement keyword.
 */
const CONTINUATION_KEYWORDS = new Set([
  'and',
  'or',
  'then',
  'else',
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

      // Skip whitespace (including newlines) and comments after keyword
      let pos = skipWhitespaceAndComments(text, keywordEnd);

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

      // Continue scanning from after the keyword so nested
      // functional ops inside the body get their own brackets
      i = keywordEnd;
      continue;
    }

    i++;
  }

  if (insertions.length === 0) {
    return text;
  }

  // Sort by position descending so earlier insertions don't shift later ones
  insertions.sort((a, b) => b.pos - a.pos);

  // Apply insertions from end to start to preserve positions
  let result = text;
  for (const ins of insertions) {
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
  let seenSwitch = false; // tracks whether we've scanned past a `switch` keyword
  let i = start;
  // Track position before trailing line comments at depth 0.
  // If the expression ends at a newline after a comment, the `]` must be
  // placed BEFORE the comment (otherwise the `]` would be inside the comment).
  let preCommentEnd = -1;

  while (i < text.length) {
    const ch = text[i];

    // Skip string literals
    if (ch === '"') {
      i = skipString(text, i);
      continue;
    }

    // Skip comments
    if (ch === '/' && text[i + 1] === '/') {
      if (depth === 0) {
        // Save position before comment (trimming trailing whitespace)
        let end = i;
        while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) {
          end--;
        }
        preCommentEnd = end;
      }
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

    // Detect `switch` keyword at word boundaries to track switch context
    if (
      ch === 's' &&
      depth === 0 &&
      text.startsWith('switch', i) &&
      (i === 0 || !isWordChar(text[i - 1])) &&
      !isWordChar(text[i + 6])
    ) {
      seenSwitch = true;
    }

    // Comma at depth 0 ends the expression UNLESS we're inside a switch
    // expression (where commas separate cases).
    if (ch === ',' && depth === 0) {
      if (seenSwitch) {
        // Inside a switch expression → comma is a case separator
        i++;
        continue;
      }
      return i;
    }

    // Newline at depth 0 — check if expression continues
    if ((ch === '\n' || ch === '\r') && depth === 0) {
      // Skip the newline sequence (\r\n or \n)
      const nlEnd = ch === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
      const nextNonWs = findNextNonWhitespaceOnLine(text, nlEnd);

      // Helper: return the expression end position, using the pre-comment
      // position if the current line had a trailing comment.
      const exprEnd = () => (preCommentEnd >= 0 ? preCommentEnd : i);

      // Compute indentation early (needed by comment and continuation checks)
      const startCol = getColumnOfPos(text, start);

      // If we hit another newline or EOF, expression ends
      if (nextNonWs >= text.length || text[nextNonWs] === '\n' || text[nextNonWs] === '\r') {
        return exprEnd();
      }

      // If next line is a comment-only line (starts with // or /*),
      // it should NOT trigger continuation — skip it and check the line after.
      if (text[nextNonWs] === '/' && (text[nextNonWs + 1] === '/' || text[nextNonWs + 1] === '*')) {
        // Skip the comment and any following whitespace/comments
        let past = nextNonWs;
        if (text[past + 1] === '/') {
          past = skipLineComment(text, past);
        } else {
          past = skipBlockComment(text, past);
        }
        // After the comment, skip whitespace/newlines to find the real next content
        past = skipWhitespaceAndNewlines(text, past);
        // Check the real next content (after comments)
        if (past >= text.length) return exprEnd();
        const realNextWord = extractWord(text, past);
        const realNextCol = getColumnOfPos(text, past);
        // If real next content is at lower indentation or is a statement keyword,
        // the expression ends BEFORE the comment
        if (realNextWord && STATEMENT_KEYWORDS.has(realNextWord)) return exprEnd();
        if (realNextWord && CONTINUATION_KEYWORDS.has(realNextWord)) {
          if (realNextCol >= startCol) {
            // The line after the comment continues the expression
            i = past - 1; // -1 because the main loop will i++ or handle this position
            preCommentEnd = -1;
            i = nlEnd;
            continue;
          }
          return exprEnd();
        }
        if (realNextCol > startCol) {
          preCommentEnd = -1;
          i = nlEnd;
          continue;
        }
        return exprEnd();
      }

      // Check if next line starts with a statement keyword
      const nextWord = extractWord(text, nextNonWs);
      if (nextWord && STATEMENT_KEYWORDS.has(nextWord)) {
        return exprEnd(); // Statement keyword → expression ends here
      }

      // Check for closing tokens at start of next line
      const nextCh = text[nextNonWs];
      if (nextCh === ')' || nextCh === ']') {
        return exprEnd();
      }

      // Expression continues on next line — reset comment tracking
      preCommentEnd = -1;

      // Lines starting with `->` or `->>` are feature call continuations
      if (text.startsWith('->', nextNonWs)) {
        i = nlEnd;
        continue;
      }

      // Lines starting with operators that continue binary expressions
      // Note: '/' is excluded when followed by '/' or '*' (comment starts)
      if (
        nextCh === '+' ||
        nextCh === '-' ||
        nextCh === '*' ||
        (nextCh === '/' && text[nextNonWs + 1] !== '/' && text[nextNonWs + 1] !== '*')
      ) {
        i = nlEnd;
        continue;
      }

      // Compute indentation for continuation decisions
      const nextCol = getColumnOfPos(text, nextNonWs);

      // Lines starting with 'and', 'or', 'then', 'else', etc. continue
      // the expression IF at the same or deeper indentation than start.
      // At lower indentation, they represent chaining operations (e.g.,
      // `then filter` at block level) and should terminate.
      if (nextWord && CONTINUATION_KEYWORDS.has(nextWord)) {
        if (nextCol >= startCol) {
          i = nlEnd;
          continue;
        }
        // Continuation keyword at lower indentation → terminates
        return exprEnd();
      }

      // Lines starting with `=`, `<>`, `>=`, `<=` continue
      if (nextCh === '=' || nextCh === '<' || nextCh === '>') {
        i = nlEnd;
        continue;
      }

      // If next line is indented deeper than the expression start,
      // it's a continuation (e.g., multi-line constructor body,
      // multi-line if-then-else, etc.)
      if (nextCol > startCol) {
        i = nlEnd;
        continue;
      }

      // By default, expression ends at newline
      return exprEnd();
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
 * Skips whitespace, newlines, AND comments (both // and /* *​/ forms).
 * Used to find the actual expression body after a functional op keyword.
 */
function skipWhitespaceAndComments(text: string, start: number): number {
  let i = skipWhitespaceAndNewlines(text, start);
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '/') {
      i = skipLineComment(text, i);
      i = skipWhitespaceAndNewlines(text, i);
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i = skipBlockComment(text, i);
      i = skipWhitespaceAndNewlines(text, i);
    } else {
      break;
    }
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
