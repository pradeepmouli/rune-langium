// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Shared source for structural Rune value equality in TS and executable previews. */
export function valueEqualitySource(typescript: boolean, exported = false): string {
  const prefix = exported ? 'export ' : '';
  const valueType = typescript ? ': unknown' : '';
  const fields = typescript ? ' as Record<string, unknown>' : '';
  return `${prefix}const runeValueKey = (value${valueType})${typescript ? ': string' : ''} => {
  if (value == null) return 'null';
  if (typeof value !== 'object') return typeof value + ':' + String(value);
  if (Array.isArray(value)) return 'array:' + JSON.stringify(value.map(runeValueKey));
  const tag = Object.prototype.toString.call(value);
  if (/^\\[object Temporal\\.(PlainDate|PlainTime|PlainDateTime|ZonedDateTime|Instant|PlainYearMonth|PlainMonthDay|Duration)\\]$/.test(tag)) return tag + ':' + String(value);
  const fields = value${fields};
  return 'object:' + JSON.stringify(Object.keys(fields).sort().filter((key) => fields[key] != null).map((key) => [key, runeValueKey(fields[key])]));
};
${prefix}const runeValueEquals = (left${valueType}, right${valueType})${typescript ? ': boolean' : ''} => runeValueKey(left) === runeValueKey(right);`;
}
