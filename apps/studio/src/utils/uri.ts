/**
 * URI utilities for converting file paths to LSP-compatible document URIs.
 */

/** Convert a file path to a proper file:// URI for LSP document identification. */
export function pathToUri(path: string): string {
  if (path.startsWith('file://')) return path;

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
}
