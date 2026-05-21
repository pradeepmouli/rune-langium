// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Adapter that wraps the ?z2f-generated ExcelOptionsForm with the controlled
 * `{ value, onChange }` contract expected by DownloadConfigModal.optionsForm.
 *
 * The generated form (auto-save mode) calls `onSubmit` on every field change.
 * This adapter bridges that into `onChange(newValue)` so the modal can store
 * the collected options without knowing about z2f internals.
 *
 * IMPORTANT: this file imports `?z2f` and MUST NOT be imported from the modal
 * or from any test that exercises the modal in isolation. Only the wiring site
 * (CodePreviewPanel.tsx) should import this module.
 */

import React from 'react';
// The ?z2f import is intercepted by the Vite plugin at build time and replaced
// with the generated form component. TypeScript resolves it via the ambient
// `declare module '*?z2f'` in @zod-to-form/vite/client.
import GeneratedExcelOptionsForm from './excel-options.schema?z2f';

export interface ExcelOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

/**
 * Controlled wrapper around the ?z2f-generated ExcelOptionsForm.
 *
 * `defaultValues` seeds the form from the parent's `value` on first render
 * (using a stable key so a target change forces a remount and resets to the
 * incoming value). `onSubmit` (called on every field change in auto-save mode)
 * forwards the data to `onChange` as a plain Record.
 */
export function ExcelOptionsFormAdapter({
  value,
  onChange
}: ExcelOptionsFormAdapterProps): React.ReactElement {
  return (
    <GeneratedExcelOptionsForm
      // defaultValues seeds RHF on mount with the parent's current value.
      defaultValues={value as Record<string, unknown>}
      onSubmit={(data: unknown) => {
        onChange(data as Record<string, unknown>);
      }}
    />
  );
}
