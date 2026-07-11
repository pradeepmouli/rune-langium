// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * A language projection over the canonical `RosettaExpression` AST.
 *
 * `render` never approximates: it returns `null` for any node outside the
 * lens's supported subset `S`, so the caller falls back to read-only Rune.
 * `parse` never returns a degraded node: an out-of-subset or syntactically
 * invalid input is a `RefusalReason`, not a best-effort tree.
 */
import type { RosettaExpression } from '@rune-langium/core';

export interface LanguageLens<L extends string> {
  readonly language: L;
  render(node: RosettaExpression): string | null;
  parse(text: string): LensResult;
}

export type LensResult = { ok: true; node: RosettaExpression } | { ok: false; reason: RefusalReason };

/** `offset`/`length` index into the TS source text the lens was asked to parse. */
export interface RefusalReason {
  kind: 'syntax-error' | 'out-of-subset';
  message: string;
  offset: number;
  length: number;
}
