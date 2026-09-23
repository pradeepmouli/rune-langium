// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { FormPreviewPanel as FormPreviewPanelView } from '../../components/FormPreviewPanel.js';
import { usePreviewStore } from '../../store/preview-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';
import { requestPrototype } from '../../services/prototype-navigation.js';
import { useWorkspaceOptional } from '../providers/workspace-context.js';

export const FormPreviewPanel = withInstrumentation(
  function FormPreviewPanel(): React.ReactElement {
    const workspace = useWorkspaceOptional();
    const selectedTargetId = usePreviewStore((s) => s.selectedTargetId);
    const selectedTarget = usePreviewStore((s) => s.selectedTarget);
    const schemas = usePreviewStore((s) => s.schemas);
    const status = usePreviewStore((s) => s.status);
    const getFieldSource = usePreviewStore((s) => s.getFieldSource);
    const dispatchExecute = usePreviewStore((s) => s.dispatchExecute);

    const schema = selectedTargetId ? schemas.get(selectedTargetId) : undefined;

    return (
      <FormPreviewPanelView
        schema={schema}
        status={status}
        target={selectedTarget}
        getFieldSource={(fieldPath) => getFieldSource(selectedTargetId, fieldPath)}
        onExecute={dispatchExecute}
        onCreateInstance={(seed) => {
          if (workspace?.workspaceId) requestPrototype(workspace.workspaceId, { kind: 'create', seed });
        }}
      />
    );
  },
  { op: 'FormPreviewPanel' }
);
