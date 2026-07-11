// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Adapter that wraps the ?z2f-generated OpenApiImportOptionsForm with the
 * controlled `{ value, onChange }` contract ImportDialog expects.
 *
 * IMPORTANT: this file imports `?z2f` and MUST NOT be imported from
 * ImportDialog.tsx or any test that exercises it in isolation. Only
 * ExplorePerspective.tsx (the wiring site) should import this module.
 */

import React from 'react';
import GeneratedOpenApiImportOptionsForm from './openapi-import-options.schema?z2f';

export interface OpenApiImportOptionsFormAdapterProps {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export function OpenApiImportOptionsFormAdapter({
  value,
  onChange
}: OpenApiImportOptionsFormAdapterProps): React.ReactElement {
  return (
    <GeneratedOpenApiImportOptionsForm
      defaultValues={value}
      onValueChange={(data: unknown) => onChange(data as Record<string, unknown>)}
    />
  );
}
