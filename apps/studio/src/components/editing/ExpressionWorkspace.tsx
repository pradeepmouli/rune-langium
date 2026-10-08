// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState } from 'react';
import { nameFromNodeId, type ExpressionEditorSlotProps } from '@rune-langium/visual-editor';
import {
  getFunctionImplementationRegion,
  getExpressionRegions,
  type RosettaFunction,
  type Data,
  type Dehydrated
} from '@rune-langium/core';
import type { WorkspaceFile, ParsedWorkspaceModel } from '../../services/workspace.js';
import type { DocumentBinding, ExpressionDocument } from '../../services/expression-document.js';
import type { LspClientService } from '../../services/lsp-client.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { pathToUri } from '../../utils/uri.js';
import { RuneRegionEditor } from './RuneRegionEditor.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface ExpressionWorkspaceProps {
  nodeId: string;
  file?: WorkspaceFile;
  parsed?: ParsedWorkspaceModel;
  documents: ExpressionDocument;
  parseCurrent: boolean;
  readOnly: boolean;
  onContentChange(path: string, fullSource: string): void;
  onOpenSource(): void;
  lspClient?: LspClientService;
  lspReady?: boolean;
  sourceError?: string;
  sourceOwner?: RosettaFunction | Data | Dehydrated<RosettaFunction> | Dehydrated<Data>;
  target?: ExpressionEditorSlotProps['target'];
}

export const ExpressionWorkspace = withInstrumentation(
  function ExpressionWorkspace({
    nodeId,
    file,
    parsed,
    documents,
    parseCurrent,
    readOnly,
    onContentChange,
    onOpenSource,
    lspClient,
    lspReady,
    sourceError,
    sourceOwner,
    target
  }: ExpressionWorkspaceProps) {
    const [binding, setBinding] = useState<DocumentBinding | null>(null);
    const [coordinateError, setCoordinateError] = useState<string | undefined>();
    useEffect(() => {
      if (!file || file.sourceLoaded === false) return;
      const owner =
        parsed && parseCurrent
          ? parsed.model.elements.find(
              (element) =>
                (element.$type === 'RosettaFunction' || element.$type === 'Data') &&
                element.name === nameFromNodeId(nodeId)
            )
          : readOnly
            ? sourceOwner
            : undefined;
      if (!owner || (owner.$type !== 'RosettaFunction' && owner.$type !== 'Data')) return;
      try {
        const region = target
          ? getExpressionRegions(owner).find((entry) => entry.kind === target.kind && entry.index === target.index)
              ?.region
          : owner.$type === 'RosettaFunction'
            ? getFunctionImplementationRegion(owner, file.content)
            : undefined;
        if (!region) {
          setCoordinateError('Source coordinates are unavailable for this expression. Open the file in Source.');
          return;
        }
        const next = documents.capture(pathToUri(file.path), nodeId, region);
        if (next) {
          setBinding(next);
          setCoordinateError(undefined);
        } else setCoordinateError('Source coordinates do not match this file. Open the file in Source.');
      } catch (error) {
        setCoordinateError(error instanceof Error ? error.message : String(error));
      }
    }, [file, parsed, parseCurrent, sourceOwner, readOnly, nodeId, documents, target?.kind, target?.index]);
    const active =
      file && file.sourceLoaded !== false && binding?.uri === pathToUri(file.path) && binding.nodeId === nodeId
        ? binding
        : null;
    return (
      <section className="flex flex-col gap-1" aria-label={target ? 'Condition expression' : 'Function implementation'}>
        <div className="flex min-h-6 items-center justify-between gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {target ? 'Expression' : 'Implementation'} · Rune
          </span>
          <Button variant="ghost" size="xs" onClick={onOpenSource}>
            Open in Source
          </Button>
        </div>
        {active && file ? (
          <RuneRegionEditor
            binding={{ ...active, readOnly }}
            path={file.path}
            source={file.content}
            onContentChange={onContentChange}
            lspClient={lspClient}
            lspReady={lspReady}
          />
        ) : (
          <p role="status" className="text-xs text-muted-foreground">
            {sourceError ??
              coordinateError ??
              (file?.sourceLoaded === false ? 'Loading source…' : 'Waiting for the current Rune source to parse…')}
          </p>
        )}
      </section>
    );
  },
  {
    op: 'ExpressionWorkspace',
    sanitize: () => '[unsanitized-default: REVIEW]',
    sanitizeError: (e) => ({ signature: e instanceof Error ? e.name : 'Error' })
  }
);
