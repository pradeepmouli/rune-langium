// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

/**
 * Curated-bundle `WorkspaceFile.path` values are already bracket-prefixed
 * (`[${bundleId}]/${path}`, set by `mergeModelFiles` in services/workspace.ts)
 * and must map to `file:///[${bundleId}]/${path}` — the EXACT URI scheme the
 * curated-mirror publish pipeline bakes into every serialized cross-document
 * `$ref` for that bundle. This mirrors
 * `apps/studio/functions/api/codegen.ts`'s `curatedKeyToUri` (server-side
 * codegen path, which hit and fixed this exact mismatch already — see its
 * doc comment for the incident writeup). The generic `/workspace/`-prefixing
 * branch below is for ordinary user-authored files and must never touch a
 * bracket-prefixed path: prepending `/workspace/` here produces
 * `file:///workspace/[cdm]/...`, which can never match the target URI a
 * curated reference was serialized against, so cross-document references
 * into curated bundles fail to resolve regardless of hydration order or
 * relink rounds.
 */
function curatedPathToUri(path: string): string {
  return `file:///${path}`;
}

export const pathToUri = withInstrumentation(
  function pathToUri(path: string): string {
    // Preserve any path that already carries a URI scheme (file://, system://, etc.)
    if (path.includes('://')) return path;

    if (path.startsWith('[')) return curatedPathToUri(path);

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
    // Workspace-relative virtual path or bracket-prefixed curated-bundle
    // identifier in, `file:///workspace/...` / `file:///[bundleId]/...` URI
    // out — never a real OS path with a username/home dir. Safe to capture
    // verbatim.
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
