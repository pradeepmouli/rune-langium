// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared by expression-roundtrip.test.ts, expression-corpus-sweep.test.ts,
 * and (in production) `LanguageLensEditor`'s no-op-blur detection.
 *
 * The fixed-point check (`r2 === r1`) only proves the RENDERED TEXT is
 * stable under reparse — it does NOT prove the reparsed tree still means
 * the same thing as the original. The nested-switch/choice comma-ambiguity
 * bug (P1 follow-up) produced exactly this gap: an early candidate fix made
 * `r2 === r1` pass while silently reparsing `ArithmeticOperation` into
 * `SwitchOperation` (the switch's own case-comma absorbed a sibling list
 * element). `normalize` + a deep-equal check on the ORIGINAL vs. REPARSED
 * tree closes that gap by comparing tree SHAPE, not just rendered text.
 */

/** A parsed-or-dehydrated AST-shaped node ($type discriminant + data fields). */
type AnyNode = Record<string, unknown> & { $type?: string };

const INTERNAL_FIELD_PREFIX = '$';
/** `$type` is a data field (the shape discriminant); every other `$`-prefixed
 * key (`$cstNode`, `$container`, `$document`, `$cstText`, …) is parser/editor
 * bookkeeping that must NOT affect tree-equivalence. */
const KEPT_INTERNAL_FIELDS = new Set(['$type']);

function isRef(value: unknown): value is { $refText: string } {
  return typeof value === 'object' && value !== null && typeof (value as { $refText?: unknown }).$refText === 'string';
}

/**
 * Recursively strip parser/editor-only `$`-fields, collapse cross-references
 * to their `$refText` (a linked `.ref` would make live-parser and
 * `Dehydrated<T>` trees incomparable, and identity/link state isn't part of
 * the DSL's meaning anyway), and recurse into arrays/plain objects. Leaves
 * (strings/numbers/booleans/bigints/undefined/null) pass through unchanged.
 */
export function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (isRef(value)) return { $refText: value.$refText };
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as AnyNode)) {
      if (key.startsWith(INTERNAL_FIELD_PREFIX) && !KEPT_INTERNAL_FIELDS.has(key)) continue;
      out[key] = normalize(v);
    }
    return out;
  }
  return value;
}

/** Deep-equality over `normalize`d trees (plain structural comparison — no
 * cycles remain once `$container`/`$document` are stripped and refs are
 * collapsed to `$refText`). */
export function treesEquivalent(a: unknown, b: unknown): boolean {
  return deepEqual(normalize(a), normalize(b));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
