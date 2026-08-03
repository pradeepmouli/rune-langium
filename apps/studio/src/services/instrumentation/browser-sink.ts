// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, formatLine } from '../../store/output-store.js';
import { useTelemetrySettingsStore } from '../../store/telemetry-settings.js';
import { configureInstrumentation, type TelemetryRecord } from './core.js';
import { withInstrumentation } from './core.js';

// This IS the currentEmit sink installed below (configureInstrumentation's
// first arg): wrapping it in withInstrumentation would make every
// instrumented call's success emission re-enter emitRecord ->
// currentEmit -> this function, recursing into itself (unbounded once the
// threshold is lowered below 'warn', since the default depth-0 level
// 'info' doesn't normally clear it). The instrumentation pipe's own
// terminal sink must stay a plain function. For the same reason it must
// format lines via output-store.ts's plain `formatLine`, never the
// instrumented `fmtLine` — calling `fmtLine` here would itself emit a new
// record on every line formatted, which this same sink would then format
// again, recursing independently of whether `routeTelemetryRecord` itself
// is instrumented.
// oxlint-disable-next-line rune/no-uninstrumented-export -- see comment above
export function routeTelemetryRecord(record: TelemetryRecord): void {
  // Single choke point for the existing telemetry opt-in flag — gates both
  // relayed worker records (worker-sink.ts's own configureInstrumentation
  // deliberately can't check the store; see worker-sink.ts) and, redundantly
  // but harmlessly, browser-originated records already gated below in
  // installInstrumentationBrowserSink.
  if (!useTelemetrySettingsStore.getState().enabled) return;
  const addLine = useOutputStore.getState().addLine;
  const severity = record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : 'info';
  addLine(formatLine(record.op, record.subject ?? ''), severity, {
    op: record.op,
    subject: record.subject,
    signature: record.signature,
    durationMs: record.durationMs
  });
}

export const installInstrumentationBrowserSink = withInstrumentation(
  function installInstrumentationBrowserSink(): void {
    configureInstrumentation(routeTelemetryRecord, () => useTelemetrySettingsStore.getState().enabled);
  },
  { op: 'installInstrumentationBrowserSink' }
);
