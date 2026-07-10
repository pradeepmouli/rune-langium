// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Adapter that wraps the ?z2f-generated SqlImportOptionsForm with the
 * controlled `{ value, onChange }` contract ImportDialog expects.
 *
 * IMPORTANT: this file imports `?z2f` and MUST NOT be imported from
 * ImportDialog.tsx or any test that exercises it in isolation. Only
 * ExplorePerspective.tsx (the wiring site) should import this module.
 */

import React from 'react';
import GeneratedSqlImportOptionsForm from './sql-import-options.schema?z2f';

export interface SqlImportOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export function SqlImportOptionsFormAdapter({ value, onChange }: SqlImportOptionsFormAdapterProps): React.ReactElement {
  return (
    <GeneratedSqlImportOptionsForm
      defaultValues={value}
      onSubmit={(data: unknown) => onChange(data as Record<string, unknown>)}
    />
  );
}
