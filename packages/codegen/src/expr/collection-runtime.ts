// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Cardinality conversions shared by functions, validators, and executable previews. */
export function collectionRuntimeSource(typescript: boolean, exported = false): string {
  const prefix = exported ? 'export ' : '';
  const generic = typescript ? '<T>' : '';
  const input = typescript ? ': T' : '';
  const listType = '(T extends readonly (infer I)[] ? I : NonNullable<T>)[]';
  const singleType = 'T extends readonly (infer I)[] ? I | undefined : T extends null | undefined ? undefined : T';
  return `${prefix}const runeList = ${generic}(value${input})${typescript ? `: ${listType}` : ''} => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value])${typescript ? ` as ${listType}` : ''};
};
${prefix}const runeSingle = ${generic}(value${typescript ? ': T' : ''})${typescript ? `: ${singleType}` : ''} => {
  const values = runeList(value);
  if (values.length > 1) throw new Error('Expected at most one value');
  return values[0]${typescript ? ` as ${singleType}` : ''};
};`;
}
