// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Calendar operations shared by emitted modules and the preview runtime. */
export function temporalRuntimeSource(typescript: boolean, exported = false): string {
  const prefix = exported ? 'export ' : '';
  const type = (value: string) => (typescript ? value : '');
  return `${typescript ? "import { Temporal } from '@js-temporal/polyfill';" : ''}
${prefix}const runeParseZonedDateTime = (value${type(': unknown')})${type(': Temporal.ZonedDateTime')} => {
  const text = String(value);
  const offset = text.match(/(Z|[+-]\\d{2}:\\d{2})$/)?.[1];
  return Temporal.ZonedDateTime.from(offset ? text + '[' + (offset === 'Z' ? 'UTC' : offset) + ']' : text);
};
${prefix}const runeDateField = ${type("<K extends 'year' | 'month' | 'day' | 'date' | 'time' | 'timezone'>")}(value${type(': unknown')}, kind${type(": 'date' | 'dateTime' | 'zonedDateTime'")}, field${type(': K')})${type(": (K extends 'year' | 'month' | 'day' ? number : string) | undefined")} => {
  if (value == null) return undefined;
  const parsed = kind === 'date' ? Temporal.PlainDate.from(String(value)) : kind === 'dateTime' ? Temporal.PlainDateTime.from(String(value)) : runeParseZonedDateTime(value);
  const result = field === 'date' && 'toPlainDate' in parsed ? parsed.toPlainDate().toString()
    : field === 'time' && 'toPlainTime' in parsed ? parsed.toPlainTime().toString()
    : field === 'timezone' && 'timeZoneId' in parsed ? parsed.timeZoneId
    : field === 'year' ? parsed.year : field === 'month' ? parsed.month : field === 'day' ? parsed.day : undefined;
  return result${type(" as (K extends 'year' | 'month' | 'day' ? number : string) | undefined")};
};
${prefix}const runeDateConstruct = (kind${type(": 'date' | 'dateTime' | 'zonedDateTime'")}, fields${type(': { year?: number; month?: number; day?: number; date?: string; time?: string; timezone?: string }')})${type(': string | undefined')} => {
  if (kind === 'date') {
    if (fields.year == null || fields.month == null || fields.day == null) return undefined;
    return Temporal.PlainDate.from({ year: fields.year, month: fields.month, day: fields.day }, { overflow: 'reject' }).toString();
  }
  if (fields.date == null || fields.time == null) return undefined;
  const dateTime = Temporal.PlainDate.from(fields.date).toPlainDateTime(Temporal.PlainTime.from(fields.time));
  if (kind === 'dateTime') return dateTime.toString();
  if (fields.timezone == null) return undefined;
  return dateTime.toZonedDateTime(fields.timezone === 'Z' ? 'UTC' : fields.timezone).toString();
};`;
}
