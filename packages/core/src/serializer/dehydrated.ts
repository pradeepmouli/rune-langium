// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AstNode } from 'langium';

// ---------------------------------------------------------------------------
// Dehydrated<T> — lossless editable wire model
// ---------------------------------------------------------------------------

interface ReferenceShape {
  readonly $refText: string;
}

type LangiumRuntimeFields = '$container' | '$containerProperty' | '$containerIndex' | '$cstNode' | '$document';

type DehydratedField<F> =
  NonNullable<F> extends ReferenceShape
    ? { $refText: string } | Extract<F, undefined | null>
    : F extends Array<infer E extends AstNode>
    ? Dehydrated<E>[]
    : NonNullable<F> extends AstNode
    ? Dehydrated<NonNullable<F>> | Extract<F, undefined | null>
    : F;

/**
 * Lossless editable wire model for a Langium AST node.
 *
 * Strips runtime-only internals ($container, $cstNode, etc.) and converts
 * every Reference<T> to { $refText: string }. All semantic fields are
 * preserved and made mutable for in-place editing.
 *
 * This is the canonical substrate for the Rune editable store.
 */
export type Dehydrated<T extends AstNode> = {
  readonly $type: T['$type'];
  readonly $namespace?: string;
} & {
  -readonly [K in Exclude<keyof T, LangiumRuntimeFields | '$type'>]: DehydratedField<T[K]>;
};
