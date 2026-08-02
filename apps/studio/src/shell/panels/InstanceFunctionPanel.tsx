// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { FormPreviewPanel } from './FormPreviewPanel.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export const InstanceFunctionPanel = withInstrumentation(
  function InstanceFunctionPanel() {
    return <FormPreviewPanel />;
  },
  { op: 'InstanceFunctionPanel' }
);
