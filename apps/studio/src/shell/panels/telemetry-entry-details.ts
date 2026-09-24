// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

interface TelemetryEntryDetails {
  message: string;
  status: string;
  op?: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
  signature?: string;
  time?: string;
}

// oxlint-disable-next-line rune/no-uninstrumented-export -- Pure row formatter; instrumenting a log-render helper would feed the panel it renders.
export function formatTelemetryEntryDetails({
  message,
  status,
  op,
  subject,
  durationMs,
  opId,
  signature,
  time
}: TelemetryEntryDetails): string {
  return [
    ['Message', message],
    ['Status', status],
    ['Operation', op],
    ['Time', time],
    ['Duration', durationMs === undefined ? undefined : `${Math.round(durationMs)} ms`],
    ['Signature', signature],
    ['Subject', subject],
    ['Correlation ID', opId?.toString()]
  ]
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}
