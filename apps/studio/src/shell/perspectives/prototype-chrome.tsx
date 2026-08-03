// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from '../../services/instrumentation/core.js';

export const PrototypeActions = withInstrumentation(
  function PrototypeActions(): null {
    // No perspective-level actions in Phase 1 (New Instance / Import live in
    // InstanceExplorerPanel itself, not the shared topbar action cluster).
    return null;
  },
  { op: 'PrototypeActions' }
);
