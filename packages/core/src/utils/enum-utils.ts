// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { RosettaEnumeration, RosettaEnumValue } from '../generated/ast.js';

/** Effective enum members, with child declarations overriding inherited names. */
export function getEnumValues(enumeration: RosettaEnumeration): RosettaEnumValue[] {
  const seen = new Set<RosettaEnumeration>();
  const values = new Map<string, RosettaEnumValue>();
  for (
    let current: RosettaEnumeration | undefined = enumeration;
    current && !seen.has(current);
    current = current.parent?.ref
  ) {
    seen.add(current);
    for (const value of current.enumValues) if (!values.has(value.name)) values.set(value.name, value);
  }
  return [...values.values()];
}
