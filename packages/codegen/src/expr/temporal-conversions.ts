// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Accepted wire formats; conversions retain source precision and timezone spelling. */
export const TEMPORAL_CONVERSION_PATTERNS = {
  date: String.raw`^\d{4}-\d{2}-\d{2}$`,
  time: String.raw`^\d{2}:\d{2}:\d{2}(\.\d+)?$`,
  dateTime: String.raw`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$`,
  zonedDateTime: String.raw`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})(\[[^\]]+\])?$`
} as const;

const patterns = new Map(
  Object.entries(TEMPORAL_CONVERSION_PATTERNS).map(([kind, pattern]) => [kind, new RegExp(pattern)])
);
export function matchesTemporalWireFormat(
  value: unknown,
  kind: keyof typeof TEMPORAL_CONVERSION_PATTERNS
): value is string {
  return typeof value === 'string' && patterns.get(kind)!.test(value);
}
