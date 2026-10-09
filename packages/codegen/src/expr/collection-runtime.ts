// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Cardinality conversions shared by functions, validators, and executable previews. */
export function collectionRuntimeSource(typescript: boolean, exported = false): string {
  const prefix = exported ? 'export ' : '';
  const generic = typescript ? '<T>' : '';
  const input = typescript ? ': T' : '';
  const listType = '(T extends readonly (infer I)[] ? I : NonNullable<T>)[]';
  const itemType = 'T extends readonly (infer I)[] ? I : NonNullable<T>';
  const singleType = 'T extends readonly (infer I)[] ? I | undefined : T extends null | undefined ? undefined : T';
  return `${prefix}const runeList = ${generic}(value${input})${typescript ? `: ${listType}` : ''} => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value])${typescript ? ` as ${listType}` : ''};
};
${prefix}const runeSingle = ${generic}(value${typescript ? ': T' : ''})${typescript ? `: ${singleType}` : ''} => {
  const values = runeList(value);
  if (values.length > 1) throw new Error('Expected at most one value');
  return values[0]${typescript ? ` as ${singleType}` : ''};
};
${prefix}const runeContains = (left${typescript ? ': unknown' : ''}, right${typescript ? ': unknown' : ''})${typescript ? ': boolean' : ''} => {
  const l = runeList(left), r = runeList(right);
  const keys = new Set(l.map(runeValueKey));
  return l.length > 0 && r.length > 0 && r.every((value) => keys.has(runeValueKey(value)));
};
${prefix}const runeDisjoint = (left${typescript ? ': unknown' : ''}, right${typescript ? ': unknown' : ''})${typescript ? ': boolean' : ''} => {
  const keys = new Set(runeList(right).map(runeValueKey));
  return !runeList(left).some((value) => keys.has(runeValueKey(value)));
};
${prefix}const runeDistinct = ${generic}(value${input}, key${typescript ? `: (item: ${itemType}) => string` : ''} = runeValueKey)${typescript ? `: ${listType}` : ''} => {
  const seen = new Set${typescript ? '<string>' : ''}();
  return runeList(value).filter((item) => {
    const identity = key(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};`;
}
