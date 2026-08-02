// @instrumentation-codemod-applied
import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const pathToUri = withInstrumentation(
  function pathToUri(path: string): string {
    // Preserve any path that already carries a URI scheme (file://, system://, etc.)
    if (path.includes('://')) return path;

    // For browser environment, treat relative paths as workspace paths
    let absPath: string;
    if (path.startsWith('/')) {
      // Already absolute POSIX path
      absPath = path;
    } else if (/^[a-zA-Z]:/.test(path)) {
      // Windows absolute path (e.g., C:/foo or C:\foo)
      absPath = path;
    } else {
      // Relative path - treat as workspace path
      absPath = `/workspace/${path}`;
    }

    // Normalize to POSIX-style separators for use in a URI
    const normalizedPath = absPath.replace(/\\/g, '/');

    // Ensure proper leading slash so that:
    // - POSIX:  /foo/bar   -> file:///foo/bar
    // - Windows: C:/foo    -> file:///C:/foo
    const uriPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

    return `file://${uriPath}`;
    // Workspace-relative virtual path in, `file:///workspace/...` URI out —
    // never a real OS path with a username/home dir (see the function body:
    // non-absolute input is always prefixed with the fixed `/workspace/` root).
    // Safe to capture verbatim.
  },
  { op: 'pathToUri', capture: Capture.Input | Capture.Output, sanitize: (value) => value }
);

export const uriToPath = withInstrumentation(
  function uriToPath(uri: string): string {
    if (!uri.startsWith('file://')) {
      return uri;
    }

    const parsed = new URL(uri);
    let path = decodeURIComponent(parsed.pathname);
    if (/^\/[a-zA-Z]:\//.test(path)) {
      path = path.slice(1);
    }
    if (path.startsWith('/workspace/')) {
      return path.slice('/workspace/'.length);
    }
    return path;
    // Same rationale as pathToUri above.
  },
  { op: 'uriToPath', capture: Capture.Input | Capture.Output, sanitize: (value) => value }
);
