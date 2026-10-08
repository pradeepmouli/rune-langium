// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { nameFromNodeId, type ExpressionEditorSlotProps, type FunctionScope } from '@rune-langium/visual-editor';
import {
  getFunctionImplementationRegion,
  getExpressionRegions,
  type RosettaFunction,
  type Data,
  type Dehydrated,
  type SourceRegion,
  type ExpressionRegion
} from '@rune-langium/core';
import type { WorkspaceFile, ParsedWorkspaceModel } from '../../services/workspace.js';
import type { DocumentBinding, ExpressionDocument } from '../../services/expression-document.js';
import type { LspClientService } from '../../services/lsp-client.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { pathToUri } from '../../utils/uri.js';
import { ExpressionBuilderDialog } from './ExpressionBuilderDialog.js';
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
  loadScope?: (region: SourceRegion) => Promise<FunctionScope>;
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
    loadScope,
    target
  }: ExpressionWorkspaceProps) {
    const [binding, setBinding] = useState<DocumentBinding | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [selection, setSelection] = useState<SourceRegion | null>(null);
    const [builder, setBuilder] = useState<{
      binding: DocumentBinding;
      target: ExpressionRegion;
      scope: FunctionScope;
    } | null>(null);
    const [builderPending, setBuilderPending] = useState(false);
    const [builderError, setBuilderError] = useState<string>();
    const requestRef = useRef(0);
    useEffect(
      () => () => {
        requestRef.current++;
        viewRef.current = null;
      },
      []
    );
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
      file &&
      !coordinateError &&
      file.sourceLoaded !== false &&
      binding?.uri === pathToUri(file.path) &&
      binding.nodeId === nodeId
        ? binding
        : null;
    const openBuilder = async () => {
      if (!active || !file || !parsed || !parseCurrent || readOnly || active.readOnly || !loadScope) return;
      const owner = parsed.model.elements.find(
        (element) =>
          (element.$type === 'RosettaFunction' || element.$type === 'Data') && element.name === nameFromNodeId(nodeId)
      );
      if (!owner || (owner.$type !== 'RosettaFunction' && owner.$type !== 'Data')) return;
      const entries = getExpressionRegions(owner);
      const expression = target
        ? entries.find((entry) => entry.kind === target.kind && entry.index === target.index)
        : entries.find((entry) => selection && entry.region.from <= selection.from && entry.region.to >= selection.to);
      if (!expression) {
        setBuilderError('Place the cursor inside an expression to open the builder.');
        return;
      }
      const captured = documents.capture(active.uri, nodeId, active.region);
      if (!captured || captured.source !== parsed.source) return;
      const request = ++requestRef.current;
      setBuilderPending(true);
      setBuilderError(undefined);
      try {
        const scope = await loadScope(expression.region);
        if (request !== requestRef.current) return;
        const current = documents.capture(captured.uri, nodeId, captured.region);
        if (
          !current ||
          current.workspaceGeneration !== captured.workspaceGeneration ||
          current.revision !== captured.revision
        ) {
          setBuilderError('The source changed. Reopen the builder to apply this draft.');
          return;
        }
        setBuilder({ binding: captured, target: expression, scope });
      } catch (error) {
        if (request === requestRef.current) setBuilderError(error instanceof Error ? error.message : String(error));
      } finally {
        if (request === requestRef.current) setBuilderPending(false);
      }
    };
    return (
      <section className="flex flex-col gap-1" aria-label={target ? 'Condition expression' : 'Function implementation'}>
        <div className="flex min-h-6 items-center justify-between gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {target ? 'Expression' : 'Implementation'} · Rune
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              disabled={!active || !parseCurrent || readOnly || active?.readOnly || !loadScope || builderPending}
              onClick={openBuilder}
            >
              {builderPending ? 'Opening…' : 'Builder'}
            </Button>
            <Button variant="ghost" size="xs" onClick={onOpenSource}>
              Open in Source
            </Button>
          </div>
        </div>
        {active && file ? (
          <RuneRegionEditor
            binding={{ ...active, readOnly: readOnly || active.readOnly }}
            path={file.path}
            source={file.content}
            onContentChange={onContentChange}
            lspClient={lspClient}
            lspReady={lspReady}
            onViewCreated={(view) => {
              viewRef.current = view;
            }}
            onSelectionChange={(range) => setSelection(range)}
          />
        ) : (
          <p role="status" className="text-xs text-muted-foreground">
            {sourceError ??
              coordinateError ??
              (file?.sourceLoaded === false ? 'Loading source…' : 'Waiting for the current Rune source to parse…')}
          </p>
        )}
        {builderError && (
          <p role="alert" className="text-xs text-destructive">
            {builderError}
          </p>
        )}
        {builder && (
          <ExpressionBuilderDialog
            {...builder}
            onClose={() => {
              setBuilder(null);
              requestAnimationFrame(() => viewRef.current?.focus());
            }}
            onApply={(edit) => {
              const view = viewRef.current;
              if (!view || view.state.doc.toString() !== edit.binding.source) return { ok: false, reason: 'stale' };
              return documents.applyDocumentEdit(edit, () =>
                view.dispatch({
                  changes: { ...edit.region, insert: edit.replacement },
                  annotations: isolateHistory.of('full'),
                  userEvent: 'input.builder'
                })
              );
            }}
          />
        )}
      </section>
    );
  },
  {
    op: 'ExpressionWorkspace'
  }
);
