// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { FormPreviewPanel as FormPreviewPanelView } from '../../components/FormPreviewPanel.js';
import { usePreviewStore } from '../../store/preview-store.js';

export function FormPreviewPanel(): React.ReactElement {
  const selectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  const selectedTarget = usePreviewStore((s) => s.selectedTarget);
  const schemas = usePreviewStore((s) => s.schemas);
  const status = usePreviewStore((s) => s.status);
  const getFieldSource = usePreviewStore((s) => s.getFieldSource);

  const schema = selectedTargetId ? schemas.get(selectedTargetId) : undefined;

  return (
    <FormPreviewPanelView
      schema={schema}
      status={status}
      target={selectedTarget}
      getFieldSource={(fieldPath) => getFieldSource(selectedTargetId, fieldPath)}
    />
  );
}
