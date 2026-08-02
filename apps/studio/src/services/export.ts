// @instrumentation-codemod-applied
import { withInstrumentation } from './instrumentation/core.js';

// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const downloadFile = withInstrumentation(
  function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    // `content` is the exported file's raw text (generated code/model export)
    // and `filename` may echo a user-chosen type/project name — neither is
    // safe to capture; `mimeType` alone isn't useful on its own.
  },
  { op: 'downloadFile' }
);
