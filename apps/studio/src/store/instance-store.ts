// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createInstanceValidateMessage, createPreviewGenerateMessage } from '../services/codegen-service.js';
import type { InstanceRecord, ValidationDiagnostic } from '@rune-langium/codegen/instances';
import type { FormPreviewSchema } from '@rune-langium/codegen/export';
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

// Separate module-level map for instance-editing's schema fetches — must
// never collide with dispatchValidate's pendingRequests above, nor with
// usePreviewStore's own target-selection requestIds (both reuse the
// preview:generate/preview:result worker messages).
let schemaRequestCounter = 0;
const pendingSchemaRequests = new Map<string, string>(); // requestId -> typeFqn

interface InstanceStoreState {
  instances: Record<string, InstanceRecord>;
  validationErrors: Record<string, ValidationDiagnostic[]>;
  schemas: Map<string, FormPreviewSchema>;
  createInstance(typeFqn: string, name: string): string;
  updateInstanceData(id: string, data: Record<string, unknown>): void;
  removeInstance(id: string): void;
  setWorker(worker: Worker): void;
  dispatchValidate(id: string): void;
  receiveValidateResult(requestId: string, diagnostics: ValidationDiagnostic[]): void;
  dispatchGenerateSchema(typeFqn: string): void;
  receiveSchemaResult(requestId: string, schema: FormPreviewSchema): boolean;
  clearPendingSchemaRequest(requestId: string): void;
}

export const useInstanceStore = create<InstanceStoreState>((set, get) => ({
  instances: {},
  validationErrors: {},
  schemas: new Map(),

  createInstance(typeFqn, name) {
    const id = ulid();
    const now = Date.now();
    const record: InstanceRecord = { id, name, typeFqn, data: {}, createdAt: now, modifiedAt: now };
    set((state) => ({ instances: { ...state.instances, [id]: record } }));
    return id;
  },

  // `data` is a full replacement, not a shallow merge — the caller (the
  // generalized FormPreviewPanel's onValuesChange, via InstanceFormPanel)
  // always supplies the complete top-level values tree, matching how
  // usePreviewStore's updateSample already treats its `values` argument.
  updateInstanceData(id, data) {
    set((state) => {
      const existing = state.instances[id];
      if (!existing) return state;
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
  },

  // Dispatches unconditionally (does not gate on schemas.has(typeFqn)) —
  // mirrors usePreviewStore's own target-change effect, which always
  // re-requests on selection rather than trusting a cache that could be
  // stale relative to in-flight file edits. Callers are responsible for
  // only invoking this once per mount / typeFqn change.
  dispatchGenerateSchema(typeFqn) {
    if (!workerRef) return;
    schemaRequestCounter++;
    const requestId = `schema:${typeFqn}:${schemaRequestCounter}`;
    pendingSchemaRequests.set(requestId, typeFqn);
    workerRef.postMessage(createPreviewGenerateMessage(typeFqn, requestId));
  },

  receiveSchemaResult(requestId, schema) {
    if (!pendingSchemaRequests.has(requestId)) return false;
    pendingSchemaRequests.delete(requestId);
    set((state) => {
      const schemas = new Map(state.schemas);
      schemas.set(schema.targetId, schema);
      return { schemas };
    });
    return true;
  },

  clearPendingSchemaRequest(requestId) {
    pendingSchemaRequests.delete(requestId);
  }
}));
