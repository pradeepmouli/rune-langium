/**
 * EditorPage — Main editor layout embedding RuneTypeGraph (T088).
 *
 * Provides the graph canvas + side panels (source view, detail panel)
 * in a responsive layout.
 */

import { useRef, useCallback, useState } from 'react';
import { RuneTypeGraph } from '@rune-langium/visual-editor';
import type { RuneTypeGraphRef } from '@rune-langium/visual-editor';
import type { RosettaModel } from '@rune-langium/core';
import { SourceView } from '../components/SourceView.js';
import { ExportMenu } from '../components/ExportMenu.js';
import type { WorkspaceFile } from '../services/workspace.js';

export interface EditorPageProps {
  models: RosettaModel[];
  files: WorkspaceFile[];
  onFilesChange?: (files: WorkspaceFile[]) => void;
}

export function EditorPage({ models, files, onFilesChange }: EditorPageProps) {
  const graphRef = useRef<RuneTypeGraphRef>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const handleNodeSelect = useCallback((nodeId: string | undefined, _nodeData?: unknown) => {
    setSelectedNode(nodeId ?? null);
  }, []);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    graphRef.current?.focusNode(nodeId);
  }, []);

  const getSerializedFiles = useCallback((): Map<string, string> => {
    const rosettaText = graphRef.current?.exportRosetta?.();
    if (!rosettaText || typeof rosettaText !== 'string') return new Map();

    // If we have workspace files, map back to file names
    if (files.length > 0) {
      const result = new Map<string, string>();
      result.set(files[0]!.name, rosettaText);
      return result;
    }

    return new Map<string, string>([['model.rosetta', rosettaText]]);
  }, [files]);

  const getGraphElement = useCallback(() => graphContainerRef.current, []);

  const handleFitView = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  const handleRelayout = useCallback(() => {
    graphRef.current?.relayout();
  }, []);

  return (
    <div className="studio-editor-page" data-testid="editor-page">
      {/* Toolbar */}
      <div className="studio-editor-page__toolbar">
        <div className="studio-editor-page__toolbar-left">
          <button className="studio-toolbar-button" onClick={handleFitView} title="Fit to view">
            Fit View
          </button>
          <button
            className="studio-toolbar-button"
            onClick={handleRelayout}
            title="Re-run auto layout"
          >
            Re-layout
          </button>
          <button
            className={`studio-toolbar-button ${showSource ? 'studio-toolbar-button--active' : ''}`}
            onClick={() => setShowSource(!showSource)}
            title="Toggle source view"
          >
            Source
          </button>
        </div>
        <div className="studio-editor-page__toolbar-right">
          <ExportMenu
            getSerializedFiles={getSerializedFiles}
            getGraphElement={getGraphElement}
            hasModels={models.length > 0}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="studio-editor-page__content">
        {/* Graph area */}
        <div
          className={`studio-editor-page__graph ${showSource ? 'studio-editor-page__graph--with-source' : ''}`}
          ref={graphContainerRef}
        >
          <RuneTypeGraph
            ref={graphRef}
            models={models as unknown[]}
            config={{
              layout: { direction: 'TB' },
              showControls: true,
              showMinimap: true,
              readOnly: false
            }}
            callbacks={{
              onNodeSelect: handleNodeSelect,
              onNodeDoubleClick: handleNodeDoubleClick
            }}
          />
        </div>

        {/* Source panel (toggleable) */}
        {showSource && (
          <div className="studio-editor-page__source">
            <SourceView files={files} onFileSelect={() => {}} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="studio-editor-page__status">
        <span>{models.length} model(s) loaded</span>
        <span>{files.filter((f) => f.dirty).length} modified</span>
        {selectedNode && <span>Selected: {selectedNode}</span>}
      </div>
    </div>
  );
}
