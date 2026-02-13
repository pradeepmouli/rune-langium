/**
 * URI utilities for converting file paths to LSP-compatible document URIs.
 */

/** Convert a file path to a proper file:// URI for LSP document identification. */
export function pathToUri(path: string): string {
  if (path.startsWith('file://')) return path;
  // Ensure absolute path for proper file URI (3 slashes: file:///...)
  const absPath = path.startsWith('/') ? path : `/workspace/${path}`;
  return `file://${absPath}`;
}
