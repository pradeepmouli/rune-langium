/**
 * ExportMenu — Export options for .rosetta files and graph images (T086).
 *
 * Provides buttons for downloading the current model as .rosetta files
 * and exporting the graph viewport as SVG/PNG.
 */

import { useCallback } from 'react';
import { downloadFile, downloadRosettaFiles } from '../services/export.js';
import { Button } from '@rune-langium/design-system/ui/button';

export interface ExportMenuProps {
  /** Callback to get the current serialized .rosetta content per file. */
  getSerializedFiles: () => Map<string, string>;
  /** Callback to export the graph as an image blob. */
  exportImage?: (format: 'svg' | 'png') => Promise<Blob>;
  /** Whether there are any loaded models to export. */
  hasModels: boolean;
}

export function ExportMenu({ getSerializedFiles, exportImage, hasModels }: ExportMenuProps) {
  const handleExportRosetta = useCallback(() => {
    const files = getSerializedFiles();
    if (files.size === 0) return;

    if (files.size === 1) {
      const [name, content] = [...files.entries()][0]!;
      downloadFile(content, name.endsWith('.rosetta') ? name : `${name}.rosetta`);
    } else {
      downloadRosettaFiles(files);
    }
  }, [getSerializedFiles]);

  const handleExportSvg = useCallback(async () => {
    if (!exportImage) return;
    const blob = await exportImage('svg');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rune-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportImage]);

  const handleExportPng = useCallback(async () => {
    if (!exportImage) return;
    const blob = await exportImage('png');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rune-graph.png';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportImage]);

  return (
    <menu className="flex gap-1 list-none m-0 p-0" data-testid="export-menu">
      <li>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportRosetta}
          disabled={!hasModels}
          title="Download .rosetta files"
        >
          Export .rosetta
        </Button>
      </li>
      <li>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportSvg}
          disabled={!hasModels}
          title="Export graph as SVG"
        >
          Export SVG
        </Button>
      </li>
      <li>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportPng}
          disabled={!hasModels}
          title="Export graph as PNG"
        >
          Export PNG
        </Button>
      </li>
    </menu>
  );
}
