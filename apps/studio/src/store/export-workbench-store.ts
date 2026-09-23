// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import type { GeneratorDiagnostic, Target } from '@rune-langium/codegen/export';
import { exportInputKey, generateExport, type ExportConfig, type ExportInput } from '../services/export-request.js';
import type { ExportArtifact } from '../services/export-artifact.js';
import { withInstrumentation } from '../services/instrumentation/core.js';
import { readWorkbenchSettings, writeWorkbenchSettings } from '../shell/workbench-settings.js';
import { createActivationGuard } from './activation-guard.js';

type CapturedExport = { inputKey: string; artifact: ExportArtifact };

export type ExportRunState =
  | { status: 'idle' }
  | { status: 'generating'; requestId: string; previous?: CapturedExport }
  | ({ status: 'ready' | 'stale' } & CapturedExport)
  | { status: 'failed'; message: string; diagnostics: GeneratorDiagnostic[]; previous?: CapturedExport };

type GenerateExport = (input: ExportInput, signal: AbortSignal) => Promise<ExportArtifact>;

/** Durable preferences. Generated artifacts and source stay in memory only. */
export interface ExportWorkbenchPreferences {
  config: ExportConfig;
  activeFile: string | undefined;
  nativeLayout?: unknown;
}

export interface ExportWorkbenchState {
  workspaceId: string | undefined;
  config: ExportConfig;
  activeFile: string | undefined;
  nativeLayout?: unknown;
  run: ExportRunState;
  activate(workspaceId: string): Promise<void>;
  configure(config: ExportConfig): void;
  setActiveFile(path: string | undefined): void;
  setNativeLayout(layout: unknown): void;
  invalidate(sourceRevision: number): void;
  generate(input: ExportInput): Promise<void>;
  cancel(): void;
}

const DEFAULT_CONFIG: ExportConfig = {
  target: 'typescript' as Target,
  selection: { namespaces: [], declarations: [] },
  options: {}
};

const DEFAULT_PREFERENCES: ExportWorkbenchPreferences = {
  config: DEFAULT_CONFIG,
  activeFile: undefined
};

function cloneConfig(config: ExportConfig): ExportConfig {
  return structuredClone(config);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function errorDiagnostics(error: unknown): GeneratorDiagnostic[] {
  if (!error || typeof error !== 'object' || !('diagnostics' in error)) return [];
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  return Array.isArray(diagnostics) ? (diagnostics as GeneratorDiagnostic[]) : [];
}

function capturedExport(run: ExportRunState): CapturedExport | undefined {
  if (run.status === 'ready' || run.status === 'stale') return { inputKey: run.inputKey, artifact: run.artifact };
  if (run.status === 'generating' || run.status === 'failed') return run.previous;
  return undefined;
}

/** Create export state with an injected generator so races are independently testable. */
export const createExportWorkbench = withInstrumentation(
  function createExportWorkbench(generateExportArtifact: GenerateExport = generateExport) {
    let active: { requestId: string; controller: AbortController } | undefined;
    let sequence = 0;
    const activation = createActivationGuard();
    const cancelActive = () => {
      active?.controller.abort();
      active = undefined;
    };
    const persist = (state: Pick<ExportWorkbenchState, 'workspaceId' | 'config' | 'activeFile' | 'nativeLayout'>) => {
      if (!state.workspaceId) return;
      void writeWorkbenchSettings(state.workspaceId, 'export-workbench', {
        config: state.config,
        activeFile: state.activeFile,
        nativeLayout: state.nativeLayout
      });
    };
    return create<ExportWorkbenchState>((set, get) => ({
      workspaceId: undefined,
      config: DEFAULT_CONFIG,
      activeFile: undefined,
      run: { status: 'idle' },
      async activate(workspaceId) {
        const generation = activation.begin();
        cancelActive();
        set({
          workspaceId,
          config: cloneConfig(DEFAULT_CONFIG),
          activeFile: undefined,
          nativeLayout: undefined,
          run: { status: 'idle' }
        });
        const restored = await readWorkbenchSettings(workspaceId, 'export-workbench', DEFAULT_PREFERENCES);
        if (activation.isCurrent(generation) && get().workspaceId === workspaceId) {
          set({
            config: cloneConfig(restored.config ?? DEFAULT_CONFIG),
            activeFile: restored.activeFile,
            nativeLayout: restored.nativeLayout,
            run: { status: 'idle' }
          });
        }
      },
      configure(config) {
        activation.invalidate();
        cancelActive();
        const nextConfig = cloneConfig(config);
        set((state) => {
          const previous = capturedExport(state.run);
          return {
            config: nextConfig,
            run: previous ? { status: 'stale', ...previous } : { status: 'idle' }
          };
        });
        persist({ ...get(), config: nextConfig });
      },
      setActiveFile(activeFile) {
        activation.invalidate();
        set({ activeFile });
        persist({ ...get(), activeFile });
      },
      setNativeLayout(nativeLayout) {
        activation.invalidate();
        set({ nativeLayout });
        persist({ ...get(), nativeLayout });
      },
      invalidate(sourceRevision) {
        cancelActive();
        set((state) => {
          const previous = capturedExport(state.run);
          if (!previous) return { run: { status: 'idle' } };
          return {
            run: { status: 'stale', inputKey: `${previous.inputKey}:${sourceRevision}`, artifact: previous.artifact }
          };
        });
      },
      async generate(input) {
        activation.invalidate();
        const previous = capturedExport(get().run);
        cancelActive();
        const controller = new AbortController();
        const requestId = `export:${++sequence}`;
        const config = cloneConfig(input.config);
        const ownedInput = { ...input, config };
        const inputKey = exportInputKey(ownedInput);
        active = { requestId, controller };
        set({ config, run: { status: 'generating', requestId, ...(previous ? { previous } : {}) } });
        persist({ ...get(), config });
        try {
          const artifact = await generateExportArtifact(ownedInput, controller.signal);
          if (active?.requestId !== requestId) return;
          set({ run: { status: 'ready', inputKey, artifact } });
        } catch (error) {
          if (active?.requestId !== requestId || isAbort(error)) return;
          set({
            run: {
              status: 'failed',
              message: error instanceof Error ? error.message : String(error),
              diagnostics: errorDiagnostics(error),
              ...(previous ? { previous } : {})
            }
          });
        } finally {
          if (active?.requestId === requestId) active = undefined;
        }
      },
      cancel() {
        cancelActive();
        const run = get().run;
        if (run.status === 'generating') {
          set({ run: run.previous ? { status: 'stale', ...run.previous } : { status: 'idle' } });
        }
      }
    }));
  },
  { op: 'createExportWorkbench' }
);

export const useExportWorkbenchStore = createExportWorkbench();
