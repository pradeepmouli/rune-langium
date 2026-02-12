/**
 * ExportMenu — Export options for .rosetta files and graph images (T086).
 *
 * Provides buttons for downloading the current model as .rosetta files
 * and exporting the graph viewport as SVG/PNG.
 */

import { useCallback } from 'react';
import { downloadFile, downloadRosettaFiles, exportImage } from '../services/export.js';

export interface ExportMenuProps {
  /** Callback to get the current serialized .rosetta content per file. */
  getSerializedFiles: () => Map<string, string>;
  /** Callback to get the graph container element for image export. */
  getGraphElement?: () => HTMLElement | null;
  /** Whether there are any loaded models to export. */
  hasModels: boolean;
}

export function ExportMenu({ getSerializedFiles, getGraphElement, hasModels }: ExportMenuProps) {
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
    const el = getGraphElement?.();
    if (!el) return;
    const blob = await exportImage(el, 'svg');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rune-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [getGraphElement]);

  const handleExportPng = useCallback(async () => {
    const el = getGraphElement?.();
    if (!el) return;
    const blob = await exportImage(el, 'png');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rune-graph.png';
    a.click();
    URL.revokeObjectURL(url);
  }, [getGraphElement]);

  return (
    <div className="studio-export-menu" data-testid="export-menu">
      <button
        className="studio-export-menu__button"
        onClick={handleExportRosetta}
        disabled={!hasModels}
        title="Download .rosetta files"
      >
        Export .rosetta
      </button>
      <button
        className="studio-export-menu__button"
        onClick={handleExportSvg}
        disabled={!hasModels}
        title="Export graph as SVG"
      >
        Export SVG
      </button>
      <button
        className="studio-export-menu__button"
        onClick={handleExportPng}
        disabled={!hasModels}
        title="Export graph as PNG"
      >
        Export PNG
      </button>
    </div>
  );
}
