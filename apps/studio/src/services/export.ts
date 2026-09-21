// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation } from './instrumentation/core.js';

/** Reduces a user-controlled name to a safe browser download filename. */
export const sanitizeDownloadFilename = withInstrumentation(
  function sanitizeDownloadFilename(raw: string, fallback: string): string {
    const basename = raw.replace(/^.*[/\\]/, '');
    // eslint-disable-next-line no-control-regex
    const cleaned = basename.replace(/[\x00-\x1f"]/g, '').trim();
    return cleaned.length > 0 ? cleaned : fallback;
  },
  { op: 'sanitizeDownloadFilename' }
);

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
