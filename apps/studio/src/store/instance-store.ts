// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createInstanceValidateMessage } from '../services/codegen-service.js';
import type { InstanceRecord, ValidationDiagnostic } from '@rune-langium/codegen/instances';
import { create } from 'zustand';

function ulid(): string {
  // Time-sortable enough for Phase 1's uniqueness needs; swap for a real
  // ulid library only if cross-session collision resistance ever matters.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Module-level, like preview-store.ts's workerRef/dispatchExecuteCounter —
// not store state, since a Worker instance isn't serializable/comparable
// the way zustand state is expected to be.
let workerRef: Worker | undefined;
let requestCounter = 0;
const pendingRequests = new Map<string, string>(); // requestId -> instanceId

interface InstanceStoreState {
  instances: Record<string, InstanceRecord>;
  validationErrors: Record<string, ValidationDiagnostic[]>;
  createInstance(typeFqn: string, name: string): string;
  updateInstanceData(id: string, fieldPath: string, value: unknown): void;
  removeInstance(id: string): void;
  setWorker(worker: Worker): void;
  dispatchValidate(id: string): void;
  receiveValidateResult(requestId: string, diagnostics: ValidationDiagnostic[]): void;
}

export const useInstanceStore = create<InstanceStoreState>((set, get) => ({
  instances: {},
  validationErrors: {},

  createInstance(typeFqn, name) {
    const id = ulid();
    const now = Date.now();
    const record: InstanceRecord = { id, name, typeFqn, data: {}, createdAt: now, modifiedAt: now };
    set((state) => ({ instances: { ...state.instances, [id]: record } }));
    return id;
  },

  updateInstanceData(id, fieldPath, value) {
    set((state) => {
      const existing = state.instances[id];
      if (!existing) return state;
      const data = { ...(existing.data as Record<string, unknown>), [fieldPath]: value };
      return { instances: { ...state.instances, [id]: { ...existing, data, modifiedAt: Date.now() } } };
    });
    get().dispatchValidate(id);
  },

  removeInstance(id) {
    set((state) => {
      const { [id]: _removed, ...rest } = state.instances;
      return { instances: rest };
    });
  },

  setWorker(worker) {
    workerRef = worker;
  },

  dispatchValidate(id) {
    const record = get().instances[id];
    if (!record || !workerRef) return;
    requestCounter++;
    const requestId = `validate:${id}:${requestCounter}`;
    pendingRequests.set(requestId, id);
    workerRef.postMessage(
      createInstanceValidateMessage(record.typeFqn, record.data as Record<string, unknown>, requestId)
    );
  },

  receiveValidateResult(requestId, diagnostics) {
    const id = pendingRequests.get(requestId);
    if (!id) return;
    pendingRequests.delete(requestId);
    set((state) => ({ validationErrors: { ...state.validationErrors, [id]: diagnostics } }));
  }
}));
