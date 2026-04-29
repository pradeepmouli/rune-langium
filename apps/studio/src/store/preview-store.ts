// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import type { FormPreviewSchema, PreviewSourceMapEntry } from '@rune-langium/codegen';

export interface FormPreviewTarget {
  id: string;
  namespace: string;
  name: string;
  kind: string;
  sourceUri?: string;
  sourceIndex?: number;
  sourceRange?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export type PreviewStaleReason =
  | 'parse-error'
  | 'generation-error'
  | 'unsupported-target'
  | 'no-files';

export type PreviewStatus =
  | { state: 'waiting'; targetId?: string }
  | { state: 'ready'; targetId: string }
  | { state: 'invalid'; targetId: string }
  | { state: 'stale'; targetId?: string; reason: PreviewStaleReason; message: string }
  | { state: 'unavailable'; targetId?: string; reason: PreviewStaleReason; message: string };

export interface PreviewSampleState {
  targetId: string;
  values: Record<string, unknown>;
  serialized: string;
  errors: Record<string, string>;
  valid: boolean;
  validated: boolean;
  updatedAt: number;
}

interface PreviewStoreState {
  targets: FormPreviewTarget[];
  selectedTargetId?: string;
  selectedTarget?: FormPreviewTarget;
  lastResolvedTarget?: FormPreviewTarget;
  schemas: Map<string, FormPreviewSchema>;
  samples: Map<string, PreviewSampleState>;
  status: PreviewStatus;
}

interface PreviewStoreActions {
  setAvailableTargets(targets: FormPreviewTarget[]): void;
  selectTarget(targetId: string | undefined): void;
  receivePreviewResult(schema: FormPreviewSchema): void;
  receivePreviewStale(input: {
    targetId?: string;
    reason: PreviewStaleReason;
    message: string;
  }): void;
  getFieldSource(
    targetId: string | undefined,
    fieldPath: string
  ): PreviewSourceMapEntry | undefined;
  ensureSample(targetId: string, values: Record<string, unknown>): void;
  updateSample(
    targetId: string,
    values: Record<string, unknown>,
    errors: Record<string, string>,
    valid: boolean,
    validated: boolean
  ): void;
  resetSample(targetId: string, values: Record<string, unknown>): void;
  setSampleValues(targetId: string, values: Record<string, unknown>): void;
  clearSample(targetId: string): void;
  resetPreviewState(): void;
}

type PreviewStore = PreviewStoreState & PreviewStoreActions;

const initialState: PreviewStoreState = {
  targets: [],
  selectedTargetId: undefined,
  selectedTarget: undefined,
  lastResolvedTarget: undefined,
  schemas: new Map(),
  samples: new Map(),
  status: { state: 'waiting' }
};

function serializeSampleValues(values: Record<string, unknown>): string {
  return JSON.stringify(values, null, 2);
}

function sameSourceRange(
  left: FormPreviewTarget['sourceRange'],
  right: FormPreviewTarget['sourceRange']
): boolean {
  if (!left || !right) {
    return false;
  }
  return left.start.line === right.start.line && left.start.character === right.start.character;
}

function findRenamedTarget(
  targets: FormPreviewTarget[],
  previousTarget: FormPreviewTarget | undefined
): FormPreviewTarget | undefined {
  if (!previousTarget?.sourceUri) {
    return undefined;
  }
  return targets.find(
    (target) =>
      target.kind === previousTarget.kind &&
      target.sourceUri === previousTarget.sourceUri &&
      ((target.sourceIndex !== undefined &&
        previousTarget.sourceIndex !== undefined &&
        target.sourceIndex === previousTarget.sourceIndex) ||
        sameSourceRange(target.sourceRange, previousTarget.sourceRange))
  );
}

function remapTargetState<T>(
  map: Map<string, T>,
  fromTargetId: string,
  toTargetId: string
): Map<string, T> {
  if (fromTargetId === toTargetId || !map.has(fromTargetId)) {
    return map;
  }
  const next = new Map(map);
  const value = next.get(fromTargetId);
  next.delete(fromTargetId);
  if (value !== undefined) {
    next.set(toTargetId, value);
  }
  return next;
}

function mergeTargetIdentity(
  target: FormPreviewTarget | undefined,
  previousTarget: FormPreviewTarget | undefined
): FormPreviewTarget | undefined {
  if (!target) {
    return target;
  }
  if (
    target.sourceUri ||
    target.sourceIndex !== undefined ||
    target.sourceRange ||
    !previousTarget
  ) {
    return target;
  }
  return {
    ...target,
    sourceUri: previousTarget.sourceUri,
    sourceIndex: previousTarget.sourceIndex,
    sourceRange: previousTarget.sourceRange
  };
}

function retargetStatus(status: PreviewStatus, targetId: string): PreviewStatus {
  switch (status.state) {
    case 'ready':
      return { state: 'ready', targetId };
    case 'invalid':
      return { state: 'invalid', targetId };
    case 'stale':
      return { state: 'stale', targetId, reason: status.reason, message: status.message };
    case 'unavailable':
      return { state: 'unavailable', targetId, reason: status.reason, message: status.message };
    default:
      return { state: 'waiting', targetId };
  }
}

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  ...initialState,

  setAvailableTargets(targets) {
    const { selectedTargetId, selectedTarget: previousTarget, lastResolvedTarget, status } = get();
    const renameAnchor = previousTarget ?? lastResolvedTarget;
    const selectedTarget = mergeTargetIdentity(
      selectedTargetId ? targets.find((target) => target.id === selectedTargetId) : undefined,
      renameAnchor
    );
    const renamedTarget = selectedTarget ? undefined : findRenamedTarget(targets, renameAnchor);

    const previousTargetId = selectedTargetId ?? renameAnchor?.id;

    if (renamedTarget && previousTargetId) {
      const schemas = remapTargetState(get().schemas, previousTargetId, renamedTarget.id);
      const previousSample = get().samples.get(previousTargetId);
      const samples = remapTargetState(get().samples, previousTargetId, renamedTarget.id);
      if (previousSample) {
        samples.set(renamedTarget.id, { ...previousSample, targetId: renamedTarget.id });
      }
      set({
        targets,
        selectedTargetId: renamedTarget.id,
        selectedTarget: renamedTarget,
        lastResolvedTarget: renamedTarget,
        schemas,
        samples,
        status: retargetStatus(status, renamedTarget.id)
      });
      return;
    }

    if (selectedTargetId && !selectedTarget) {
      const schemas = new Map(get().schemas);
      schemas.delete(selectedTargetId);
      const samples = new Map(get().samples);
      samples.delete(selectedTargetId);
      set({
        targets,
        selectedTargetId: undefined,
        selectedTarget: undefined,
        lastResolvedTarget: renameAnchor,
        schemas,
        samples,
        status: { state: 'waiting' }
      });
      return;
    }

    set({
      targets,
      selectedTargetId: selectedTarget ? selectedTarget.id : undefined,
      selectedTarget,
      lastResolvedTarget: selectedTarget ?? renameAnchor
    });
  },

  selectTarget(targetId) {
    if (!targetId) {
      set({ selectedTargetId: undefined, selectedTarget: undefined, status: { state: 'waiting' } });
      return;
    }
    const previousTarget = get().selectedTarget ?? get().lastResolvedTarget;
    const selectedTarget = mergeTargetIdentity(
      get().targets.find((target) => target.id === targetId),
      previousTarget
    );
    if (!selectedTarget) {
      return;
    }
    set({
      selectedTargetId: selectedTarget?.id,
      selectedTarget,
      lastResolvedTarget: selectedTarget,
      status: selectedTarget ? { state: 'waiting', targetId } : { state: 'waiting' }
    });
  },

  receivePreviewResult(schema) {
    const schemas = new Map(get().schemas);
    schemas.set(schema.targetId, schema);
    const sample = get().samples.get(schema.targetId);
    set({
      schemas,
      status:
        sample?.validated && !sample.valid
          ? { state: 'invalid', targetId: schema.targetId }
          : { state: 'ready', targetId: schema.targetId }
    });
  },

  receivePreviewStale(input) {
    if (input.targetId && get().selectedTargetId !== input.targetId) {
      return;
    }
    const hasLastGood = input.targetId ? get().schemas.has(input.targetId) : false;
    set({
      status: hasLastGood ? { state: 'stale', ...input } : { state: 'unavailable', ...input }
    });
  },

  getFieldSource(targetId, fieldPath) {
    if (!targetId) return undefined;
    return get()
      .schemas.get(targetId)
      ?.sourceMap?.find((entry) => entry.fieldPath === fieldPath);
  },

  ensureSample(targetId, values) {
    if (get().samples.has(targetId)) {
      return;
    }
    const samples = new Map(get().samples);
    samples.set(targetId, {
      targetId,
      values,
      serialized: serializeSampleValues(values),
      errors: {},
      valid: true,
      validated: false,
      updatedAt: Date.now()
    });
    set({ samples });
  },

  updateSample(targetId, values, errors, valid, validated) {
    const samples = new Map(get().samples);
    samples.set(targetId, {
      targetId,
      values,
      serialized: serializeSampleValues(values),
      errors,
      valid,
      validated,
      updatedAt: Date.now()
    });
    const currentStatus = get().status;
    let nextStatus: PreviewStatus;
    if (currentStatus.state === 'stale' || currentStatus.state === 'unavailable') {
      nextStatus = currentStatus;
    } else if (validated && !valid) {
      nextStatus = { state: 'invalid', targetId };
    } else {
      nextStatus = { state: 'ready', targetId };
    }
    set({ samples, status: nextStatus });
  },

  resetSample(targetId, values) {
    const samples = new Map(get().samples);
    samples.set(targetId, {
      targetId,
      values,
      serialized: serializeSampleValues(values),
      errors: {},
      valid: true,
      validated: false,
      updatedAt: Date.now()
    });
    const currentStatus = get().status;
    set({
      samples,
      status:
        currentStatus.state === 'stale' || currentStatus.state === 'unavailable'
          ? currentStatus
          : { state: 'ready', targetId }
    });
  },

  setSampleValues(targetId, values) {
    const samples = new Map(get().samples);
    samples.set(targetId, {
      targetId,
      values,
      serialized: serializeSampleValues(values),
      errors: {},
      valid: true,
      validated: false,
      updatedAt: Date.now()
    });
    set({ samples });
  },

  clearSample(targetId) {
    const samples = new Map(get().samples);
    samples.delete(targetId);
    set({ samples });
  },

  resetPreviewState() {
    set({
      targets: [],
      selectedTargetId: undefined,
      selectedTarget: undefined,
      lastResolvedTarget: undefined,
      schemas: new Map(),
      samples: new Map(),
      status: { state: 'waiting' }
    });
  }
}));
