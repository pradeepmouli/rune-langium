// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { AstNode, JsonSerializer, JsonSerializeOptions } from 'langium';

/**
 * Canonical BigInt JSON replacer for Rune wire serialization: bigint → Number.
 * Chosen so EVERY serialization path agrees on one policy (closing the historical
 * Number-vs-String divergence). NOTE: Number(bigint) is lossy above 2^53; this
 * matches the pre-existing AST serialize path and Rosetta models large numerics as
 * BigDecimal/string, not bigint.
 */
export function runeBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

/** The Langium serialize option triple for the canonical Rune wire form. */
export const RUNE_SERIALIZE_OPTIONS: JsonSerializeOptions = {
  refText: true,
  textRegions: true,
  replacer: (key, value, defaultReplacer) => (typeof value === 'bigint' ? Number(value) : defaultReplacer(key, value))
};

/** Serialize a Rune AST model to its canonical wire JSON string. */
export function serializeRuneModel(serializer: JsonSerializer, model: AstNode): string {
  return serializer.serialize(model, RUNE_SERIALIZE_OPTIONS);
}
