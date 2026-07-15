// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createInstanceGenerateSchemaMessage, createInstanceValidateMessage } from '../services/codegen-service.js';
import { deleteInstance, listInstanceFiles, readInstance, writeInstance } from '../opfs/instances-fs.js';
import type { OpfsFs } from '../opfs/opfs-fs.js';
import type { InstanceRecord, ValidationDiagnostic } from '@rune-langium/codegen/instances';
import type { FormPreviewSchema } from '@rune-langium/codegen/export';
import type { PreviewStaleReason } from './preview-store.js';
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
// Tracks the LATEST outstanding validate requestId per instance so an
// out-of-order response (an older request's result arriving after a newer
// one, e.g. from rapid edits) can be dropped instead of overwriting fresher
// diagnostics with stale ones (finding #9).
const latestValidateRequestForInstance = new Map<string, string>(); // instanceId -> requestId

// Separate module-level map for instance-editing's schema fetches — must
// never collide with dispatchValidate's pendingRequests above. These now
// dispatch on their own `instance:generateSchema`/`instance:generateSchemaResult`
// worker message channel (finding #6/#7) rather than reusing
// `preview:generate`/`preview:result` (usePreviewStore's own target-
// selection channel) — sharing that channel let an instance schema fetch
// silently overwrite the codegen worker's `lastPreviewTargetId`, corrupting
// which target the Preview perspective re-generates on the next workspace
// file change.
let schemaRequestCounter = 0;
const pendingSchemaRequests = new Map<string, string>(); // requestId -> typeFqn

// OPFS persistence context (finding #1) — set once both an `OpfsFs` instance
// and the active workspace's root path are available. Follows the same
// module-level-ref pattern as `workerRef` above (not store state, since
// `OpfsFs` wraps a non-serializable `FileSystemDirectoryHandle`).
let opfsFs: OpfsFs | undefined;
let opfsWorkspaceRoot: string | undefined;

// Per-instance persistence queue (round-4 finding #1) — fire-and-forget
// `writeInstance`/`deleteInstance` calls issued for the SAME instance id
// (e.g. one per keystroke from rapid edits) are not guaranteed to resolve
// in the order they were issued; without sequencing, an older write
// finishing AFTER a newer one (or a delete racing a still-in-flight write)
// could leave stale — or wrongly-resurrected — data persisted to OPFS even
// though the in-memory `instances` state already reflects the latest edit.
// Chaining every operation for a given id onto that id's current queue tail
// guarantees writes AND deletes for the same instance execute in call
// order. Pruned back to empty once an operation's chain settles and no
// newer operation has replaced it in the meantime, so the map doesn't grow
// unboundedly across a long session of created-then-deleted instances.
const instanceWriteQueue = new Map<string, Promise<void>>();

function enqueueInstanceOp(id: string, op: () => Promise<void>): void {
  const prior = instanceWriteQueue.get(id) ?? Promise.resolve();
  const next = prior.then(op).finally(() => {
    if (instanceWriteQueue.get(id) === next) {
      instanceWriteQueue.delete(id);
    }
  });
  instanceWriteQueue.set(id, next);
}

function persistInstance(record: InstanceRecord): void {
  if (!opfsFs || !opfsWorkspaceRoot) return;
  const fs = opfsFs;
  const workspaceRoot = opfsWorkspaceRoot;
  enqueueInstanceOp(record.id, () =>
    writeInstance(fs, workspaceRoot, record).catch((err) => {
      console.error('[instance-store] Failed to persist instance to OPFS:', err);
    })
  );
}

function persistDelete(id: string): void {
  if (!opfsFs || !opfsWorkspaceRoot) return;
  const fs = opfsFs;
  const workspaceRoot = opfsWorkspaceRoot;
  enqueueInstanceOp(id, () =>
    deleteInstance(fs, workspaceRoot, id).catch((err) => {
      console.error('[instance-store] Failed to delete persisted instance from OPFS:', err);
    })
  );
}

interface InstanceStoreState {
  instances: Record<string, InstanceRecord>;
  validationErrors: Record<string, ValidationDiagnostic[]>;
  schemas: Map<string, FormPreviewSchema>;
  schemaErrors: Map<string, { reason: PreviewStaleReason; message: string }>;
  createInstance(typeFqn: string, name: string): string;
  updateInstanceData(id: string, data: Record<string, unknown>): void;
  removeInstance(id: string): void;
  setWorker(worker: Worker): void;
  dispatchValidate(id: string): void;
  receiveValidateResult(requestId: string, diagnostics: ValidationDiagnostic[]): void;
  dispatchGenerateSchema(typeFqn: string): void;
  receiveSchemaResult(requestId: string, schema: FormPreviewSchema): boolean;
  receiveSchemaStale(requestId: string, reason: PreviewStaleReason, message: string): boolean;
  setOpfsContext(fs: OpfsFs, workspaceRoot: string): void;
  loadInstancesFromOpfs(): Promise<void>;
}

export const useInstanceStore = create<InstanceStoreState>((set, get) => ({
  instances: {},
  validationErrors: {},
  schemas: new Map(),
  schemaErrors: new Map(),

  createInstance(typeFqn, name) {
    const id = ulid();
    const now = Date.now();
    const record: InstanceRecord = { id, name, typeFqn, data: {}, createdAt: now, modifiedAt: now };
    set((state) => ({ instances: { ...state.instances, [id]: record } }));
    persistInstance(record);
    // Validate immediately (round-5 finding #2) — mirrors the exact
    // dispatchValidate(id) call already used at the end of
    // updateInstanceData and in loadInstancesFromOpfs's per-loaded-id loop.
    // Without this, a brand-new instance's `data: {}` was never checked
    // against required fields, and InstanceInspectorPanel treats a missing
    // validationErrors[id] entry as "Valid" — so a new instance of a type
    // with required fields showed as valid until the user happened to edit
    // it. dispatchValidate already no-ops gracefully if workerRef isn't set
    // yet, so this is safe to call unconditionally.
    get().dispatchValidate(id);
    return id;
  },

  // `data` is a full replacement, not a shallow merge — the caller (the
  // generalized FormPreviewPanel's onValuesChange, via InstanceFormPanel)
  // always supplies the complete top-level values tree, matching how
  // usePreviewStore's updateSample already treats its `values` argument.
  updateInstanceData(id, data) {
    let updated: InstanceRecord | undefined;
    set((state) => {
      const existing = state.instances[id];
      if (!existing) return state;
      updated = { ...existing, data, modifiedAt: Date.now() };
      return { instances: { ...state.instances, [id]: updated } };
    });
    if (updated) persistInstance(updated);
    get().dispatchValidate(id);
  },

  removeInstance(id) {
    set((state) => {
      const { [id]: _removed, ...rest } = state.instances;
      return { instances: rest };
    });
    persistDelete(id);
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
    latestValidateRequestForInstance.set(id, requestId);
    workerRef.postMessage(
      createInstanceValidateMessage(record.typeFqn, record.data as Record<string, unknown>, requestId)
    );
  },

  receiveValidateResult(requestId, diagnostics) {
    const id = pendingRequests.get(requestId);
    if (!id) return;
    pendingRequests.delete(requestId);
    // Drop an out-of-order response: only the LATEST request issued for
    // this instance is allowed to write validationErrors (finding #9).
    if (latestValidateRequestForInstance.get(id) !== requestId) return;
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
    workerRef.postMessage(createInstanceGenerateSchemaMessage(typeFqn, requestId));
  },

  receiveSchemaResult(requestId, schema) {
    if (!pendingSchemaRequests.has(requestId)) return false;
    pendingSchemaRequests.delete(requestId);
    set((state) => {
      const schemas = new Map(state.schemas);
      schemas.set(schema.targetId, schema);
      const schemaErrors = new Map(state.schemaErrors);
      schemaErrors.delete(schema.targetId);
      return { schemas, schemaErrors };
    });
    return true;
  },

  receiveSchemaStale(requestId, reason, message) {
    const typeFqn = pendingSchemaRequests.get(requestId);
    if (!typeFqn) return false;
    pendingSchemaRequests.delete(requestId);
    set((state) => {
      // Also drop any previously-cached schema for this typeFqn (Codex
      // round-2 finding #3) — InstanceFormPanel checks `schema` BEFORE
      // `schemaError` when computing its status, so a stale response that
      // left an old cached schema in place would keep the panel rendering
      // the OUTDATED schema and never surface the new failure.
      const schemas = new Map(state.schemas);
      schemas.delete(typeFqn);
      const schemaErrors = new Map(state.schemaErrors);
      schemaErrors.set(typeFqn, { reason, message });
      return { schemas, schemaErrors };
    });
    return true;
  },

  // Wires the shared `OpfsFs` + active workspace root (finding #1) — set
  // from wherever in the component tree both become available (see
  // App.tsx's workspace-manager effect). Immediately clears in-memory
  // instances (a workspace switch must not leak the PREVIOUS workspace's
  // instances while the new workspace's are being loaded) and kicks off
  // `loadInstancesFromOpfs` fire-and-forget, mirroring the
  // fire-and-forget `dispatchValidate` pattern already used elsewhere in
  // this store.
  //
  // Also clears `schemas`/`schemaErrors` (round-3 finding #2) — a cached
  // schema is keyed by type FQN, not by workspace, so a stale schema for
  // the SAME FQN from the PREVIOUS workspace (a different model shape, or
  // simply answered before the worker's file state caught up) could
  // otherwise be read by InstanceFormPanel before the fresh
  // `dispatchGenerateSchema` request for the new workspace resolves.
  //
  // Also clears the module-level `pendingSchemaRequests` map (round-4
  // finding #2) — clearing `schemas`/`schemaErrors` state alone isn't
  // enough: a schema request dispatched from the PREVIOUS workspace can
  // still be in flight at switch time, and if its `requestId` is left in
  // `pendingSchemaRequests`, `receiveSchemaResult`/`receiveSchemaStale`
  // will still recognize it as owned and accept it once it lands —
  // repopulating `schemas` for that type FQN with data from the WRONG
  // (previous) workspace's model. `pendingRequests`/
  // `latestValidateRequestForInstance` (the analogous validate-request
  // tracking) do NOT need the same treatment: they're keyed by instance id
  // (a ulid), not by type FQN, so a stale validate response landing after a
  // switch writes into `validationErrors` under an id that cannot collide
  // with any instance id in the new workspace — there's no reused key for
  // it to corrupt.
  setOpfsContext(fs, workspaceRoot) {
    opfsFs = fs;
    opfsWorkspaceRoot = workspaceRoot;
    pendingSchemaRequests.clear();
    set({ instances: {}, validationErrors: {}, schemas: new Map(), schemaErrors: new Map() });
    void get().loadInstancesFromOpfs();
  },

  async loadInstancesFromOpfs() {
    if (!opfsFs || !opfsWorkspaceRoot) return;
    const fs = opfsFs;
    const workspaceRoot = opfsWorkspaceRoot;
    try {
      const files = await listInstanceFiles(fs, workspaceRoot);
      const ids = files.map((f) => f.replace(/\.json$/, ''));
      const records = await Promise.all(
        ids.map(async (id) => {
          try {
            return await readInstance(fs, workspaceRoot, id);
          } catch (err) {
            console.error(`[instance-store] Failed to read persisted instance "${id}" from OPFS:`, err);
            return undefined;
          }
        })
      );
      const loaded: Record<string, InstanceRecord> = {};
      for (const record of records) {
        if (record) loaded[record.id] = record;
      }
      // Only apply if this OPFS context is still the current one — guards
      // against a rapid workspace switch resolving out of order.
      if (opfsFs === fs && opfsWorkspaceRoot === workspaceRoot) {
        // Merge, don't wholesale-replace (round-7 finding #2): `loaded` is
        // the base, with any instances already present in current state
        // layered on top. setOpfsContext synchronously cleared `instances`
        // to `{}` before this async load started, and
        // updateInstanceData/removeInstance both require an existing
        // state.instances[id] entry to act on — so they can't have touched
        // any OPFS-loaded-but-not-yet-applied id. The only entries that can
        // exist in state.instances at the time this set() runs are ones
        // created via createInstance during this exact async gap, so
        // layering them on top of `loaded` is safe (not a stale-workspace
        // leak; the opfsFs/opfsWorkspaceRoot guard above already handles
        // the cross-workspace-switch case).
        set((state) => ({ instances: { ...loaded, ...state.instances } }));
        // Dispatch validation for every restored instance (round-3 finding
        // #3) — without this, `validationErrors` stays empty for records
        // loaded from OPFS (e.g. imported/raw JSON missing a required
        // field) and the Inspector reports them as "Valid" until the user
        // happens to edit one, which is the only other path that calls
        // dispatchValidate. `dispatchValidate` already no-ops if the worker
        // isn't wired up yet (matches the pattern used everywhere else in
        // this store), so this is safe to call unconditionally; if the
        // worker isn't ready yet at load time, those instances simply
        // aren't revalidated until touched — a smaller gap than today's
        // "never revalidated at all".
        for (const id of Object.keys(loaded)) {
          get().dispatchValidate(id);
        }
      }
    } catch (err) {
      console.error('[instance-store] Failed to load instances from OPFS:', err);
    }
  }
}));
