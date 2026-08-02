// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useDiagnosticsStore } from '../../store/diagnostics-store.js';
import { DiagnosticsPanel } from '../../components/DiagnosticsPanel.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export const ProblemsPanel = withInstrumentation(
  function ProblemsPanel(): React.ReactElement {
    const fileDiagnostics = useDiagnosticsStore((s) => s.fileDiagnostics);
    return (
      <div data-testid="panel-problems" data-component="workspace.problems" className="h-full">
        <DiagnosticsPanel fileDiagnostics={fileDiagnostics} />
      </div>
    );
  },
  { op: 'ProblemsPanel' }
);
