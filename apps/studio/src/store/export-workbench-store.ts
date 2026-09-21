// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import type { GeneratorDiagnostic, Target } from '@rune-langium/codegen/export';
import { exportInputKey, generateExport, type ExportConfig, type ExportInput } from '../services/export-request.js';
import type { ExportArtifact } from '../services/export-artifact.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

export type ExportRunState =
  | { status: 'idle' }
  | { status: 'generating'; requestId: string }
  | { status: 'ready' | 'stale'; inputKey: string; artifact: ExportArtifact }
  | { status: 'failed'; message: string; diagnostics: GeneratorDiagnostic[] };

type GenerateExport = (input: ExportInput, signal: AbortSignal) => Promise<ExportArtifact>;

export interface ExportWorkbenchState {
  config: ExportConfig;
  run: ExportRunState;
  configure(config: ExportConfig): void;
  invalidate(sourceRevision: number): void;
  generate(input: ExportInput): Promise<void>;
  cancel(): void;
}

const DEFAULT_CONFIG: ExportConfig = {
  target: 'typescript' as Target,
  selection: { namespaces: [], declarations: [] },
  options: {}
};

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Create export state with an injected generator so races are independently testable. */
export const createExportWorkbench = withInstrumentation(
  function createExportWorkbench(generateExportArtifact: GenerateExport = generateExport) {
    let active: { requestId: string; controller: AbortController } | undefined;
    let sequence = 0;
    const cancelActive = () => {
      active?.controller.abort();
      active = undefined;
    };
    return create<ExportWorkbenchState>((set, get) => ({
      config: DEFAULT_CONFIG,
      run: { status: 'idle' },
      configure(config) {
        cancelActive();
        set({ config, run: { status: 'idle' } });
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
        const inputKey = exportInputKey(input);
        active = { requestId, controller };
        set({ config: input.config, run: { status: 'generating', requestId } });
        try {
          const artifact = await generateExportArtifact(input, controller.signal);
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
