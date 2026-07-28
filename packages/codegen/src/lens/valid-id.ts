// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Whole-string validity check for Rune's ValidID terminal (see
 * packages/core/src/grammar/rune-dsl.langium's `ID` terminal:
 * `/\^?[a-zA-Z_][a-zA-Z_0-9]*` followed by a closing slash). That terminal
 * regex is written for LEXER
 * use, where matches are implicitly anchored at token boundaries — used
 * directly via `.test()` on an arbitrary string (as the generated
 * `isValidID()` in packages/core/src/generated/ast.ts does) it is NOT
 * equivalent to whole-string validation: it matches "bad-name" via the "bad"
 * substring, "a.b" via the "a" substring, and "9bad" via the "bad" substring
 * starting at index 1. This is the same character class, explicitly ANCHORED
 * start-to-end, and without the `^`-escape prefix — text produced from a
 * target-language parse (a Python string literal's content, a TS
 * property-access identifier) can never itself carry Rune's `^`-escape
 * marker; it's raw target-language text, not Rune source.
 */
const RUNE_VALID_ID = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

export function isRuneValidId(text: string): boolean {
  return RUNE_VALID_ID.test(text);
}
