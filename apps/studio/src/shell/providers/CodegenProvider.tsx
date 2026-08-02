// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '@rune-langium/visual-editor';
import { useStudioToast } from '../../components/StudioToastProvider.js';
import { useWorkspace } from './workspace-context.js';
import { usePreviewStore } from '../../store/preview-store.js';
import { useCodegenStore } from '../../store/codegen-store.js';
import { useInstanceStore } from '../../store/instance-store.js';
import { useOutputStore, fmtLine } from '../../store/output-store.js';
import { useActivityStore } from '../../store/activity-store.js';
import {
  createPreviewGenerateMessage,
  createPreviewSetFilesMessage,
  isPreviewWorkerMessage,
  isPreviewExecuteResultMessage,
  isPreviewExecuteErrorMessage,
  isInstanceValidateResultMessage,
  isInstanceGenerateSchemaResultMessage,
  isInstanceGenerateSchemaStaleMessage
} from '../../services/codegen-service.js';
import { pathToUri } from '../../utils/uri.js';
import { getRuneStudioTestApi } from '../../test-api.js';
import { BUNDLE_MARKER_SUFFIX } from '../../services/workspace.js';
import type { CodegenWorkerMessage } from '../../components/CodePreviewPanel.js';
import { HydrationOrchestrator, MAX_HYDRATION_RETRIES_PER_TARGET } from '../../services/hydration-orchestrator.js';
import type { DeferredExportEntry } from '../../workers/parser-worker.js';
import { routeTelemetryRecord } from '../../services/instrumentation/browser-sink.js';
import { isTelemetryRecordMessage } from '../../services/instrumentation/worker-sink.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';
import { RetryExhaustedError } from '../../services/instrumentation/errors.js';

/**
 * Looks up which curated namespace(s) export `name`, so a `preview:result`'s
 * `unresolved-reference:<name>` can be resolved to namespaces the
 * HydrationOrchestrator can hydrate. Returns an empty array for names that
 * are not a known deferred (curated, not-yet-hydrated) export — those are
 * genuinely unresolved and must not trigger a retry. Multiple curated
 * namespaces can export the same type name (e.g. `Scheme` recurs across
 * standard bodies), and there's no namespace-qualifying info available at
 * this call site to disambiguate — so every candidate is hydrated; hydrating
 * one that turns out not to be the reference's actual target is wasted
 * work, not an incorrectness.
 */
function findNamespacesForExport(deferredExports: DeferredExportEntry[], name: string): string[] {
  return deferredExports.filter((entry) => entry.exports.some((e) => e.name === name)).map((entry) => entry.namespace);
}

/** Extracts the referenced type names out of a form-preview schema's
 *  `unsupportedFeatures` list's `unresolved-reference:<name>` entries. */
function extractUnresolvedNames(unsupportedFeatures: string[] | undefined): string[] {
  return (unsupportedFeatures ?? [])
    .filter((f) => f.startsWith('unresolved-reference:'))
    .map((f) => f.slice('unresolved-reference:'.length));
}

const reportHydrationRetryExhausted = withInstrumentation(
  function reportHydrationRetryExhausted(targetId: string, attempts: number): never {
    throw new RetryExhaustedError(targetId, attempts);
  },
  {
    op: 'hydrationRetryExhausted',
    // targetId is deliberately NOT captured: a preview target can be a
    // user-authored type fqn, not just a curated id. Error-class name +
    // attempt count are structurally safe.
    sanitizeError: (err) => ({
      signature: err instanceof Error ? err.name : 'Error',
      context: err instanceof RetryExhaustedError ? { attempts: err.attempts } : undefined
    })
  }
);

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
  const { files, deferredExports } = useWorkspace();
  const [codegenWorker, setCodegenWorker] = useState<Worker | null>(null);

  const previewRequestSequenceRef = useRef(0);
  const codegenRequestSequenceRef = useRef(0);
  const currentPreviewRequestIdRef = useRef<string | undefined>(undefined);
  const codegenCurrentRequestIdRef = useRef<string>('');
  const orchestratorRef = useRef<HydrationOrchestrator | null>(null);

  const { showToast } = useStudioToast();
  const previewSelectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  const setWorkerRef = usePreviewStore((s) => s.setWorkerRef);
  const receivePreviewResult = usePreviewStore((s) => s.receivePreviewResult);
  const receivePreviewStale = usePreviewStore((s) => s.receivePreviewStale);
  const receiveExecutionResult = usePreviewStore((s) => s.receiveExecutionResult);
  const receiveExecutionError = usePreviewStore((s) => s.receiveExecutionError);
  const setHydrationRetriesRemaining = usePreviewStore((s) => s.setHydrationRetriesRemaining);
  const clearHydrationRetriesRemaining = usePreviewStore((s) => s.clearHydrationRetriesRemaining);

  // Owns the HydrationOrchestrator instance for this provider's lifetime.
  // Constructed inside a mount effect (not lazily on render) so it survives
  // React StrictMode's mount→unmount→remount double-invoke cleanly: the
  // cleanup disposes the orchestrator (unsubscribing from useEditorStore),
  // and the second mount constructs a fresh one — no leaked subscriptions.
  useEffect(() => {
    let lastHydrationNonce = useEditorStore.getState().hydrationNonce;
    const orchestrator = new HydrationOrchestrator({
      getHydratedNamespaces: () => useEditorStore.getState().hydratedNamespaces,
      getPendingHydrationNamespaces: () => useEditorStore.getState().pendingHydrationNamespaces,
      requestNamespaceHydration: (ns) => useEditorStore.getState().requestNamespaceHydration(ns),
      // useEditorStore.subscribe takes a single listener `(state) => void` —
      // no selector argument (the store is plain create() + temporal, not
      // wrapped in subscribeWithSelector; a two-argument form would silently
      // be ignored). Diff hydrationNonce manually to detect a hydration round.
      subscribeToHydrationChange: (onChange) =>
        useEditorStore.subscribe((state) => {
          if (state.hydrationNonce !== lastHydrationNonce) {
            lastHydrationNonce = state.hydrationNonce;
            onChange();
          }
        })
    });
    orchestratorRef.current = orchestrator;
    return () => {
      orchestrator.dispose();
      orchestratorRef.current = null;
    };
  }, []);

  const handlePreviewWorkerFailure = useCallback(
    (baseMessage: string, error: unknown, targetId?: string, options?: { toast?: boolean }) => {
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
      useOutputStore.getState().addLine(fmtLine('preview', baseMessage, detail), 'error', {
        op: 'preview',
        subject: targetId
      });
      if (options?.toast ?? true) {
        showToast({
          title: 'Form preview unavailable',
          description: `${baseMessage} ${detail}`.trim(),
          variant: 'destructive'
        });
      }
    },
    [receivePreviewStale, showToast]
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
      // Cleanup runs only on unmount (handlePreviewWorkerFailure is stable),
      // so no setCodegenWorker(null) here — the component is going away and a
      // state update on unmount is pointless.
      worker?.terminate();
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
    const codegenFiles: Array<{ uri: string; content: string }> = [];
    for (const f of files) {
      if (f.readOnly) continue;
      codegenFiles.push({ uri: pathToUri(f.path), content: f.content });
    }
    // 019 Task #88 follow-up: thread `serializedModelJson` through to
    // the preview worker so curated bundle files (which ship pre-parsed
    // ASTs and an empty `content`) can be hydrated and previewed.
    //
    // List-only curated refs (`refOnly`, no `serializedModelJson`) are NOT
    // parseable preview inputs: they use synthetic bundle/namespace paths and
    // exist only so the explorer can surface deferred exports before hydration.
    // Letting them reach the preview worker regresses into Langium's
    // "no services for the extension ''" dead-end.
    const allFiles: Array<{ uri: string; content: string; serializedModelJson?: string }> = [];
    for (const f of files) {
      if (f.path.endsWith(BUNDLE_MARKER_SUFFIX) || (f.refOnly && !f.serializedModelJson)) continue;
      allFiles.push({
        uri: pathToUri(f.path),
        content: f.content,
        ...(f.serializedModelJson ? { serializedModelJson: f.serializedModelJson } : {})
      });
    }
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
    useInstanceStore.getState().setWorker(codegenWorker);
    function handleMessage(e: MessageEvent<unknown>) {
      const msg = e.data;
      if (isTelemetryRecordMessage(msg)) {
        routeTelemetryRecord(msg.record);
        return;
      }
      if (isPreviewExecuteResultMessage(msg)) {
        receiveExecutionResult(msg.funcName, msg.output);
        return;
      }
      if (isPreviewExecuteErrorMessage(msg)) {
        receiveExecutionError(msg.funcName, msg.error);
        return;
      }
      if (isInstanceValidateResultMessage(msg)) {
        useInstanceStore.getState().receiveValidateResult(msg.requestId, msg.diagnostics);
        return;
      }
      // Instance-store's schema fetches use their OWN `instance:generateSchema`/
      // `instance:generateSchemaResult`/`instance:generateSchemaStale` worker
      // messages (finding #6/#7 fix) — a completely distinct channel from
      // `preview:generate`/`preview:result`/`preview:stale`, so there's no
      // ambiguity to disambiguate here and no risk of leaking into
      // usePreviewStore (or of an instance schema fetch corrupting the
      // codegen worker's `lastPreviewTargetId`/`lastPreviewRequestId`, which
      // `preview:setFiles` re-runs preview generation against).
      if (isInstanceGenerateSchemaResultMessage(msg)) {
        useInstanceStore.getState().receiveSchemaResult(msg.requestId, msg.schema);
        return;
      }
      if (isInstanceGenerateSchemaStaleMessage(msg)) {
        useInstanceStore.getState().receiveSchemaStale(msg.requestId, msg.reason, msg.message);
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
        const targetId = e.data.schema.targetId;
        const unresolvedNames = extractUnresolvedNames(e.data.schema.unsupportedFeatures);
        const orchestrator = orchestratorRef.current;
        if (orchestrator) {
          if (unresolvedNames.length === 0) {
            orchestrator.markResolved(targetId);
            clearHydrationRetriesRemaining(targetId);
          } else {
            const namespacesToHydrate = new Set<string>();
            for (const name of unresolvedNames) {
              for (const namespace of findNamespacesForExport(deferredExports, name)) {
                namespacesToHydrate.add(namespace);
              }
            }
            if (namespacesToHydrate.size === 0) {
              // No unresolved name maps to a known deferred (curated, not-yet-
              // hydrated) export -- every one is genuinely unresolved (a typo, a
              // type absent from the curated manifest, etc). Don't spend a retry
              // attempt on a round that can't possibly hydrate anything: doing so
              // would silently drain this target's budget on noise, potentially
              // starving a LATER round where a real, resolvable reference shows up
              // on the same target.
              clearHydrationRetriesRemaining(targetId);
            } else {
              const canRetry = orchestrator.beginRetryRound(targetId);
              if (canRetry) {
                for (const namespace of namespacesToHydrate) {
                  orchestrator.requestHydration(namespace, {
                    retryFor: {
                      targetId,
                      onRetry: () => {
                        // Deferred by one macrotask: onRetry fires synchronously from
                        // inside markNamespacesHydrated's zustand set() call, which can
                        // race ahead of this component's OWN files-sync effect (which
                        // resends preview:setFiles with the newly-hydrated content one
                        // React commit later). Without this defer, the retry can reach
                        // the worker before the new content does and fail identically,
                        // burning an attempt for no reason (self-healing via the next
                        // requestHydration round regardless, but this makes it
                        // deterministic instead of relying on the cap to paper over
                        // the race — see design doc §Architecture "Retry-post ordering").
                        // The live-selection re-check below additionally guards
                        // against a race with the user switching the Form Preview
                        // selection to a different target while this retry was
                        // in flight — without it, this callback would clobber
                        // currentPreviewRequestIdRef for whatever is now selected.
                        setTimeout(() => {
                          if (!codegenWorker) return;
                          if (usePreviewStore.getState().selectedTargetId !== targetId) return;
                          const requestId = `preview:${targetId}:${++previewRequestSequenceRef.current}`;
                          currentPreviewRequestIdRef.current = requestId;
                          codegenWorker.postMessage(createPreviewGenerateMessage(targetId, requestId));
                        }, 0);
                      }
                    }
                  });
                }
              } else {
                try {
                  reportHydrationRetryExhausted(targetId, MAX_HYDRATION_RETRIES_PER_TARGET);
                } catch {
                  // Preserves today's observable UX. This catch exists ONLY so the throw
                  // routes through instrumentation's error-capture path without changing
                  // control flow for anything downstream of this handler.
                }
              }
              setHydrationRetriesRemaining(targetId, orchestrator.getRemainingAttempts(targetId));
            }
          }
        }
      } else {
        receivePreviewStale(e.data);
      }
    }
    function handleWorkerFailure(event: ErrorEvent | MessageEvent<unknown>) {
      const baseMessage =
        event.type === 'messageerror' ? 'Preview worker rejected a message.' : 'Preview worker crashed.';
      // A genuine 'error' event on this shared worker is ALSO handled by
      // handleCodegenWorkerError below (same worker, both listeners fire),
      // which already shows its own crash toast (Codex P2) — suppress this
      // one so a single crash doesn't produce two destructive toasts.
      // 'messageerror' has no such duplicate handler, so it still toasts.
      handlePreviewWorkerFailure(baseMessage, event, previewSelectedTargetId, { toast: event.type !== 'error' });
    }
    codegenWorker.addEventListener('message', handleMessage as EventListener);
    codegenWorker.addEventListener('error', handleWorkerFailure as EventListener);
    codegenWorker.addEventListener('messageerror', handleWorkerFailure as EventListener);
    return () => {
      codegenWorker.removeEventListener('message', handleMessage as EventListener);
      codegenWorker.removeEventListener('error', handleWorkerFailure as EventListener);
      codegenWorker.removeEventListener('messageerror', handleWorkerFailure as EventListener);
      // Clear the preview store's worker ref so a terminated worker is not left
      // dangling after unmount (else a later dispatchExecute would post to a
      // dead worker and be silently dropped). Symmetric with setWorkerRef above;
      // CodegenProvider is a singleton so there is no remount race. (Codex P2)
      setWorkerRef(null);
    };
  }, [
    codegenWorker,
    deferredExports,
    handlePreviewWorkerFailure,
    previewSelectedTargetId,
    receivePreviewResult,
    receivePreviewStale,
    receiveExecutionResult,
    receiveExecutionError,
    setHydrationRetriesRemaining,
    clearHydrationRetriesRemaining,
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
      if (msg.type !== 'codegen:result' && msg.type !== 'codegen:outdated' && msg.type !== 'codegen:error') {
        return; // not a codegen response — handled by preview listener above
      }
      if (msg.requestId !== codegenCurrentRequestIdRef.current) {
        return; // stale response
      }
      const store = useCodegenStore.getState();
      switch (msg.type) {
        case 'codegen:result':
          store.receiveCodePreviewResult({ target: msg.target, files: msg.files });
          useActivityStore
            .getState()
            .addActivity('gen', true, `${msg.target} · ${msg.files.length} file${msg.files.length === 1 ? '' : 's'}`);
          break;
        case 'codegen:outdated':
          store.markCodePreviewStale({ target: msg.target, message: msg.message });
          break;
        case 'codegen:error':
          useOutputStore.getState().addLine(fmtLine('codegen', msg.message), 'error');
          useActivityStore.getState().addActivity('gen', false, msg.message);
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
      useOutputStore.getState().addLine(fmtLine('codegen', 'worker crashed', event.message), 'error');
      showToast({
        title: 'Code preview worker crashed',
        description: 'Reload Studio to restore code preview.',
        variant: 'destructive'
      });
    }

    codegenWorker.addEventListener('message', handleCodegenMessage as EventListener);
    codegenWorker.addEventListener('error', handleCodegenWorkerError as EventListener);
    return () => {
      codegenWorker.removeEventListener('message', handleCodegenMessage as EventListener);
      codegenWorker.removeEventListener('error', handleCodegenWorkerError as EventListener);
    };
  }, [codegenWorker, showToast]);

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
      useOutputStore
        .getState()
        .addLine(
          fmtLine('codegen', 'generation request failed', err instanceof Error ? err.message : String(err)),
          'error'
        );
      showToast({
        title: 'Code preview unavailable',
        description: err instanceof Error ? err.message : 'Could not reach the code preview worker.',
        variant: 'destructive'
      });
    }
  }, [codegenWorker, codegenActiveTarget, codegenPreviewTarget, showToast]);

  return <>{children}</>;
}
