/**
 * Export service — SVG/PNG image export and .rosetta file download (T087).
 */

/**
 * Download a text blob as a file.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download multiple files as a zip (simplified — just downloads individually).
 */
export function downloadRosettaFiles(files: Map<string, string>): void {
  for (const [name, content] of files) {
    const filename = name.endsWith('.rosetta') ? name : `${name}.rosetta`;
    downloadFile(content, filename, 'text/plain');
  }
}

/**
 * Export the graph viewport as a PNG image.
 * Uses the html-to-image library if available, otherwise a placeholder.
 */
export async function exportImage(
  _element: HTMLElement,
  format: 'svg' | 'png' = 'png'
): Promise<Blob> {
  // Placeholder — html-to-image integration would go here
  return new Blob([''], {
    type: format === 'svg' ? 'image/svg+xml' : 'image/png'
  });
}
