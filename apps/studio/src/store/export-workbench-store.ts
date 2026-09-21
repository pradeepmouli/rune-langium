// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import type { GeneratorDiagnostic, Target } from '@rune-langium/codegen/export';
import { exportInputKey, generateExport, type ExportConfig, type ExportInput } from '../services/export-request.js';
import type { ExportArtifact } from '../services/export-artifact.js';
import { withInstrumentation } from '../services/instrumentation/core.js';
import { readWorkbenchSettings, writeWorkbenchSettings } from '../shell/workbench-settings.js';

export type ExportRunState =
  | { status: 'idle' }
  | { status: 'generating'; requestId: string }
  | { status: 'ready' | 'stale'; inputKey: string; artifact: ExportArtifact }
  | { status: 'failed'; message: string; diagnostics: GeneratorDiagnostic[] };

type GenerateExport = (input: ExportInput, signal: AbortSignal) => Promise<ExportArtifact>;

/** Durable preferences. Generated artifacts and source stay in memory only. */
export interface ExportWorkbenchPreferences {
  config: ExportConfig;
  activeFile: string | undefined;
}

export interface ExportWorkbenchState {
  workspaceId: string | undefined;
  config: ExportConfig;
  activeFile: string | undefined;
  run: ExportRunState;
  activate(workspaceId: string): Promise<void>;
  configure(config: ExportConfig): void;
  setActiveFile(path: string | undefined): void;
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

/** Create export state with an injected generator so races are independently testable. */
export const createExportWorkbench = withInstrumentation(
  function createExportWorkbench(generateExportArtifact: GenerateExport = generateExport) {
    let active: { requestId: string; controller: AbortController } | undefined;
    let sequence = 0;
    let activation = 0;
    const cancelActive = () => {
      active?.controller.abort();
      active = undefined;
    };
    const persist = (state: Pick<ExportWorkbenchState, 'workspaceId' | 'config' | 'activeFile'>) => {
      if (!state.workspaceId) return;
      void writeWorkbenchSettings(state.workspaceId, 'export-workbench', {
        config: state.config,
        activeFile: state.activeFile
      });
    };
    return create<ExportWorkbenchState>((set, get) => ({
      workspaceId: undefined,
      config: DEFAULT_CONFIG,
      activeFile: undefined,
      run: { status: 'idle' },
      async activate(workspaceId) {
        const generation = ++activation;
        cancelActive();
        set({
          workspaceId,
          config: cloneConfig(DEFAULT_CONFIG),
          activeFile: undefined,
          run: { status: 'idle' }
        });
        const restored = await readWorkbenchSettings(workspaceId, 'export-workbench', DEFAULT_PREFERENCES);
        if (activation === generation && get().workspaceId === workspaceId) {
          set({
            config: cloneConfig(restored.config ?? DEFAULT_CONFIG),
            activeFile: restored.activeFile,
            run: { status: 'idle' }
          });
        }
      },
      configure(config) {
        cancelActive();
        const nextConfig = cloneConfig(config);
        set({ config: nextConfig, run: { status: 'idle' } });
        persist({ ...get(), config: nextConfig });
      },
      setActiveFile(activeFile) {
        set({ activeFile });
        persist({ ...get(), activeFile });
      },
      invalidate(sourceRevision) {
        cancelActive();
        set((state) => {
          if (state.run.status !== 'ready') return { run: { status: 'idle' } };
          return {
            run: { status: 'stale', inputKey: `${state.run.inputKey}:${sourceRevision}`, artifact: state.run.artifact }
          };
        });
      },
      async generate(input) {
        cancelActive();
        const controller = new AbortController();
        const requestId = `export:${++sequence}`;
        const config = cloneConfig(input.config);
        const ownedInput = { ...input, config };
        const inputKey = exportInputKey(ownedInput);
        active = { requestId, controller };
        set({ config, run: { status: 'generating', requestId } });
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
              diagnostics: []
            }
          });
        } finally {
          if (active?.requestId === requestId) active = undefined;
        }
      },
      cancel() {
        cancelActive();
        if (get().run.status === 'generating') set({ run: { status: 'idle' } });
      }
    }));
  },
  { op: 'createExportWorkbench' }
);

export const useExportWorkbenchStore = createExportWorkbench();
