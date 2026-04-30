// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { create } from 'zustand';
import type { SourceMapEntry, Target } from '@rune-langium/codegen';

export interface CodePreviewFile {
  relativePath: string;
  content: string;
  sourceMap: SourceMapEntry[];
}

export type CodePreviewSnapshot =
  | { status: 'waiting'; target: Target }
  | {
      status: 'ready';
      target: Target;
      files: CodePreviewFile[];
      activeRelativePath: string;
    }
  | {
      status: 'stale';
      target: Target;
      message: string;
      files: CodePreviewFile[];
      activeRelativePath: string;
    }
  | {
      status: 'unavailable';
      target: Target;
      message: string;
    };

interface CodegenState {
  codePreviewTarget: Target;
  currentRequestId: string;
  snapshot: CodePreviewSnapshot;
  beginCodePreviewRequest: (target: Target) => string;
  setCodePreviewTarget: (target: Target) => void;
  setActiveCodePreviewFile: (relativePath: string) => void;
  receiveCodePreviewResult: (input: { target: Target; files: CodePreviewFile[] }) => void;
  markCodePreviewStale: (input: { target: Target; message: string }) => void;
  markCodePreviewUnavailable: (input: { target: Target; message: string }) => void;
  resetCodegenState: () => void;
}

const DEFAULT_TARGET: Target = 'zod';
const INITIAL_REQUEST_ID = `codegen:${DEFAULT_TARGET}:0`;

function createInitialSnapshot(target: Target = DEFAULT_TARGET): CodePreviewSnapshot {
  return {
    status: 'waiting',
    target
  };
}

function pickActiveRelativePath(
  files: CodePreviewFile[],
  previousRelativePath?: string
): string | undefined {
  if (files.length === 0) {
    return undefined;
  }
  if (previousRelativePath && files.some((file) => file.relativePath === previousRelativePath)) {
    return previousRelativePath;
  }
  return files[0]?.relativePath;
}

export const useCodegenStore = create<CodegenState>((set) => ({
  codePreviewTarget: DEFAULT_TARGET,
  currentRequestId: INITIAL_REQUEST_ID,
  snapshot: createInitialSnapshot(),
  beginCodePreviewRequest: (target) => {
    const requestId = `codegen:${target}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    set({
      codePreviewTarget: target,
      currentRequestId: requestId,
      snapshot: createInitialSnapshot(target)
    });
    return requestId;
  },
  setCodePreviewTarget: (target) =>
    set({
      codePreviewTarget: target,
      currentRequestId: `codegen:${target}:0`,
      snapshot: createInitialSnapshot(target)
    }),
  setActiveCodePreviewFile: (relativePath) =>
    set((state) => {
      if (
        !('files' in state.snapshot) ||
        !state.snapshot.files?.some((file) => file.relativePath === relativePath)
      ) {
        return state;
      }
      return {
        snapshot: {
          ...state.snapshot,
          activeRelativePath: relativePath
        }
      };
    }),
  receiveCodePreviewResult: (input) =>
    set((state) => {
      const previousActive =
        'activeRelativePath' in state.snapshot ? state.snapshot.activeRelativePath : undefined;
      const activeRelativePath = pickActiveRelativePath(input.files, previousActive);
      if (!activeRelativePath) {
        return {
          codePreviewTarget: input.target,
          snapshot: {
            status: 'unavailable',
            target: input.target,
            message: 'No code preview files were generated.'
          }
        };
      }
      return {
        codePreviewTarget: input.target,
        snapshot: {
          status: 'ready',
          target: input.target,
          files: input.files,
          activeRelativePath
        }
      };
    }),
  markCodePreviewStale: (input) =>
    set((state) => {
      const previousFiles = 'files' in state.snapshot ? state.snapshot.files : undefined;
      const activeRelativePath =
        'activeRelativePath' in state.snapshot ? state.snapshot.activeRelativePath : undefined;
      if (!previousFiles || previousFiles.length === 0 || !activeRelativePath) {
        return {
          codePreviewTarget: input.target,
          snapshot: {
            status: 'unavailable',
            target: input.target,
            message: input.message
          }
        };
      }
      return {
        codePreviewTarget: input.target,
        snapshot: {
          status: 'stale',
          target: input.target,
          message: input.message,
          files: previousFiles,
          activeRelativePath
        }
      };
    }),
  markCodePreviewUnavailable: (input) =>
    set(() => ({
      codePreviewTarget: input.target,
      snapshot: {
        status: 'unavailable',
        target: input.target,
        message: input.message
      }
    })),
  resetCodegenState: () =>
    set({
      codePreviewTarget: DEFAULT_TARGET,
      currentRequestId: INITIAL_REQUEST_ID,
      snapshot: createInitialSnapshot()
    })
}));
