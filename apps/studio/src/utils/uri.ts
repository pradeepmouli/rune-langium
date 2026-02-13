/**
 * URI utilities for converting file paths to LSP-compatible document URIs.
 */
import * as nodePath from 'path';

/** Convert a file path to a proper file:// URI for LSP document identification. */
export function pathToUri(path: string): string {
  if (path.startsWith('file://')) return path;

  // Resolve to an absolute filesystem path using the current working directory as base.
  const absPath = nodePath.isAbsolute(path) ? path : nodePath.resolve(path);

  // Normalize to POSIX-style separators for use in a URI.
  const normalizedPath = absPath.replace(/\\/g, '/');

  // Ensure proper leading slash so that:
  // - POSIX:  /foo/bar   -> file:///foo/bar
  // - Windows: C:/foo    -> file:///C:/foo
  const uriPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  return `file://${uriPath}`;
}
