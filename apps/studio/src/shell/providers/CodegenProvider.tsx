// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspace } from './workspace-context.js';
import { usePreviewStore } from '../../store/preview-store.js';
import { useCodegenStore } from '../../store/codegen-store.js';
import {
  createPreviewGenerateMessage,
  createPreviewSetFilesMessage,
  isPreviewWorkerMessage,
  isPreviewExecuteResultMessage,
  isPreviewExecuteErrorMessage
} from '../../services/codegen-service.js';
import { pathToUri } from '../../utils/uri.js';
import { getRuneStudioTestApi } from '../../test-api.js';
import { BUNDLE_MARKER_SUFFIX } from '../../services/workspace.js';
import type { CodegenWorkerMessage } from '../../components/CodePreviewPanel.js';

/**
 * CodegenProvider owns the single codegen/preview {@link Worker} plus both
 * message channels: `preview:*` results flow into usePreviewStore, and
 * `codegen:*` results flow into useCodegenStore. It reads `files` from
 * {@link useWorkspace}, reads the selected target id + store actions from the
 * zustand stores, creates the worker once on mount, and hosts the six effects
 * that were previously in EditorPage. Results flow through the stores (no new
 * context). It renders its children.
 */
export function CodegenProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { files } = useWorkspace();
  const [codegenWorker, setCodegenWorker] = useState<Worker | null>(null);

  const previewRequestSequenceRef = useRef(0);
  const codegenRequestSequenceRef = useRef(0);
  const currentPreviewRequestIdRef = useRef<string | undefined>(undefined);
  const codegenCurrentRequestIdRef = useRef<string>('');

  const previewSelectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  const setWorkerRef = usePreviewStore((s) => s.setWorkerRef);
  const receivePreviewResult = usePreviewStore((s) => s.receivePreviewResult);
  const receivePreviewStale = usePreviewStore((s) => s.receivePreviewStale);
  const receiveExecutionResult = usePreviewStore((s) => s.receiveExecutionResult);
  const receiveExecutionError = usePreviewStore((s) => s.receiveExecutionError);

  const handlePreviewWorkerFailure = useCallback(
    (baseMessage: string, error: unknown, targetId?: string) => {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'type' in error && error.type === 'messageerror'
            ? 'A preview worker message could not be deserialized.'
            : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
              ? error.message
              : 'Reload Studio to restore form preview.';
      receivePreviewStale({
        targetId,
        reason: 'generation-error',
        message: `${baseMessage} ${detail}`.trim()
      });
      console.error(`[CodegenProvider] ${baseMessage}`, error);
    },
    [receivePreviewStale]
  );

  // Initialise dedicated codegen worker once on mount.
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker =
        getRuneStudioTestApi()?.createCodegenWorker?.() ??
        new Worker(new URL('../../workers/codegen-worker.ts', import.meta.url), {
          type: 'module'
        });
      setCodegenWorker(worker);
    } catch (error) {
      setCodegenWorker(null);
      handlePreviewWorkerFailure('Preview worker could not start.', error);
      return;
    }
    return () => {
      worker?.terminate();
      setCodegenWorker(null);
    };
  }, [handlePreviewWorkerFailure]);

  // Sync worker file state whenever the workspace changes.
  // codegen:setFiles uses only user-authored files (readOnly corpus files are
  // not the target of local code generation).
  // preview:setFiles includes ALL files so that corpus types (readOnly) can
  // be form-previewed — the worker only parses with eagerLinking:false so the
  // 186-file corpus costs one parse pass, not cross-reference resolution.
  useEffect(() => {
    if (!codegenWorker) return;
    const codegenFiles = files.filter((f) => !f.readOnly).map((f) => ({ uri: pathToUri(f.path), content: f.content }));
    // 019 Task #88 follow-up: thread `serializedModelJson` through to
    // the preview worker so curated bundle files (which ship pre-parsed
    // ASTs and an empty `content`) can be hydrated and previewed.
    const allFiles = files
      .filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX))
      .map((f) => ({
        uri: pathToUri(f.path),
        content: f.content,
        ...(f.serializedModelJson ? { serializedModelJson: f.serializedModelJson } : {})
      }));
    const previewRequestId = `preview:files:${++previewRequestSequenceRef.current}`;
    const codegenRequestId = `codegen:files:${++codegenRequestSequenceRef.current}`;
    currentPreviewRequestIdRef.current = previewRequestId;
    try {
      codegenWorker.postMessage({
        type: 'codegen:setFiles',
        files: codegenFiles,
        requestId: codegenRequestId
      });
      codegenWorker.postMessage(createPreviewSetFilesMessage(allFiles, previewRequestId));
    } catch (error) {
      handlePreviewWorkerFailure('Preview worker could not process updated files.', error);
    }
  }, [codegenWorker, files, handlePreviewWorkerFailure]);

  // Trigger form preview whenever the selected target changes. Files are
  // already current from the effect above; this effect only updates the target.
  useEffect(() => {
    if (!codegenWorker || !previewSelectedTargetId) return;
    const requestId = `preview:${previewSelectedTargetId}:${++previewRequestSequenceRef.current}`;
    currentPreviewRequestIdRef.current = requestId;
    try {
      codegenWorker.postMessage(createPreviewGenerateMessage(previewSelectedTargetId, requestId));
    } catch (error) {
      handlePreviewWorkerFailure(
        'Preview worker could not start generation for the selected type.',
        error,
        previewSelectedTargetId
      );
    }
  }, [codegenWorker, handlePreviewWorkerFailure, previewSelectedTargetId]);

  useEffect(() => {
    if (!codegenWorker) return;
    setWorkerRef(codegenWorker);
    function handleMessage(e: MessageEvent<unknown>) {
      const msg = e.data;
      if (isPreviewExecuteResultMessage(msg)) {
        receiveExecutionResult(msg.funcName, msg.output);
        return;
      }
      if (isPreviewExecuteErrorMessage(msg)) {
        receiveExecutionError(msg.funcName, msg.error);
        return;
      }
      // Preview messages below — execution messages above bypass stale-check
      // since they carry their own funcName-based keying
      if (!isPreviewWorkerMessage(e.data)) return;
      if (e.data.requestId !== currentPreviewRequestIdRef.current) {
        return;
      }
      if (e.data.type === 'preview:result') {
        receivePreviewResult(e.data.schema);
      } else {
        receivePreviewStale(e.data);
      }
    }
    function handleWorkerFailure(event: ErrorEvent | MessageEvent<unknown>) {
      const baseMessage =
        event.type === 'messageerror' ? 'Preview worker rejected a message.' : 'Preview worker crashed.';
      handlePreviewWorkerFailure(baseMessage, event, previewSelectedTargetId);
    }
    codegenWorker.addEventListener('message', handleMessage as EventListener);
    codegenWorker.addEventListener('error', handleWorkerFailure as EventListener);
    codegenWorker.addEventListener('messageerror', handleWorkerFailure as EventListener);
    return () => {
      codegenWorker.removeEventListener('message', handleMessage as EventListener);
      codegenWorker.removeEventListener('error', handleWorkerFailure as EventListener);
      codegenWorker.removeEventListener('messageerror', handleWorkerFailure as EventListener);
    };
  }, [
    codegenWorker,
    handlePreviewWorkerFailure,
    previewSelectedTargetId,
    receivePreviewResult,
    receivePreviewStale,
    receiveExecutionResult,
    receiveExecutionError,
    setWorkerRef
  ]);

  // ---------------------------------------------------------------------------
  // Codegen preview — single worker owner (Codex P2 fix).
  //
  // CodegenProvider is the sole owner of the codegen:generate request/response cycle.
  // CodePreviewPanel and ExportPerspective are pure-display consumers of
  // useCodegenStore. This prevents double-subscription when both surfaces are
  // simultaneously mounted (Explore dock keep-alive + Export perspective).
  // ---------------------------------------------------------------------------

  // Effect 1: listen for codegen worker responses and dispatch into the store.
  useEffect(() => {
    if (!codegenWorker) return;

    function handleCodegenMessage(e: MessageEvent<CodegenWorkerMessage>) {
      const msg = e.data;
      if (
        msg.type !== 'codegen:result' &&
        msg.type !== 'codegen:outdated' &&
        msg.type !== 'codegen:error'
      ) {
        return; // not a codegen response — handled by preview listener above
      }
      if (msg.requestId !== codegenCurrentRequestIdRef.current) {
        return; // stale response
      }
      const store = useCodegenStore.getState();
      switch (msg.type) {
        case 'codegen:result':
          store.receiveCodePreviewResult({ target: msg.target, files: msg.files });
          break;
        case 'codegen:outdated':
          store.markCodePreviewStale({ target: msg.target, message: msg.message });
          break;
        case 'codegen:error':
          store.markCodePreviewUnavailable({ target: msg.target, message: msg.message });
          break;
      }
    }

    function handleCodegenWorkerError(event: ErrorEvent) {
      console.error('[CodegenProvider] Codegen worker error (codegen:generate):', event.message, event.error);
      const store = useCodegenStore.getState();
      store.markCodePreviewUnavailable({
        target: store.codePreviewTarget,
        message: 'Code preview worker crashed — reload Studio.'
      });
    }

    codegenWorker.addEventListener('message', handleCodegenMessage as EventListener);
    codegenWorker.addEventListener('error', handleCodegenWorkerError as EventListener);
    return () => {
      codegenWorker.removeEventListener('message', handleCodegenMessage as EventListener);
      codegenWorker.removeEventListener('error', handleCodegenWorkerError as EventListener);
    };
  }, [codegenWorker]);

  // Effect 2: kick off code generation when the active target changes.
  // Mirrors the removed CodePreviewPanel effect (018 Task 0.8).
  const codegenActiveTarget = useCodegenStore((s) => s.activeTarget);
  const codegenPreviewTarget = useCodegenStore((s) => s.codePreviewTarget);
  useEffect(() => {
    if (!codegenWorker || codegenActiveTarget === undefined) return;
    const requestId = useCodegenStore.getState().beginCodePreviewRequest(codegenPreviewTarget);
    codegenCurrentRequestIdRef.current = requestId;
    try {
      codegenWorker.postMessage({ type: 'codegen:generate', target: codegenPreviewTarget, requestId });
    } catch (err) {
      console.error('[CodegenProvider] Failed to request code generation:', err);
      useCodegenStore.getState().markCodePreviewUnavailable({
        target: codegenPreviewTarget,
        message: 'Code preview worker is unavailable.'
      });
    }
  }, [codegenWorker, codegenActiveTarget, codegenPreviewTarget]);

  return <>{children}</>;
}
