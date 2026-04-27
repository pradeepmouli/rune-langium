// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { create } from 'zustand';
import type { Target } from '@rune-langium/codegen';

interface CodegenState {
  codePreviewTarget: Target;
  setCodePreviewTarget: (target: Target) => void;
}

export const useCodegenStore = create<CodegenState>((set) => ({
  codePreviewTarget: 'zod',
  setCodePreviewTarget: (target) => set({ codePreviewTarget: target })
}));
