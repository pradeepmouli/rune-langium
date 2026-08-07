// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { vi } from 'vitest';
import type { FormPreviewSchema, PreviewField } from '@rune-langium/codegen/export';
import type { ValidationDiagnostic } from '@rune-langium/codegen/instances';
import { usePreviewStore } from '../../src/store/preview-store.js';
import { useInstanceStore } from '../../src/store/instance-store.js';

/**
 * Test-only structural-validation stand-in for a real codegen-worker
 * response — required-field and array-cardinality checks only, matching
 * these component tests' own fixture schemas. Real validation semantics
 * (Zod schema compile/parse, condition attribution) are the codegen
 * worker's job and are covered by codegen-worker.test.ts; this helper only
 * exists so uncontrolled-mode component tests can exercise FormPreviewPanel
 * rendering errors/valid state sourced from the (now-async) worker round
 * trip, without spinning up a real worker.
 */
function computeFakeDiagnostics(
  fields: PreviewField[],
  values: Record<string, unknown>,
  pathPrefix = ''
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  for (const field of fields) {
    const key = field.path.split('.').at(-1)!.replace('[]', '');
    const value = values?.[key];
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (field.kind === 'array') {
      const items = Array.isArray(value) ? value : [];
      const min = field.cardinality?.min;
      const max = field.cardinality?.max;
      if (typeof min === 'number' && items.length < min) {
        diagnostics.push({
          path,
          message: `Add at least ${min} ${field.label.toLowerCase()} item${min === 1 ? '' : 's'}`
        });
      }
      if (typeof max === 'number' && items.length > max) {
        diagnostics.push({
          path,
          message: `Use at most ${max} ${field.label.toLowerCase()} item${max === 1 ? '' : 's'}`
        });
      }
      continue;
    }

    if (field.kind === 'object') {
      if (field.required || (value && typeof value === 'object')) {
        diagnostics.push(
          ...computeFakeDiagnostics(field.children ?? [], (value as Record<string, unknown>) ?? {}, path)
        );
      }
      continue;
    }

    if (field.required && (value === undefined || value === '')) {
      diagnostics.push({ path, message: `${field.label} is required` });
    }
  }
  return diagnostics;
}

/**
 * Installs a fake worker on usePreviewStore whose postMessage synchronously
 * answers any `instance:validate` for `schema.targetId` via
 * computeFakeDiagnostics, then routes the result back through
 * receiveValidateResult — simulating the round trip `dispatchValidate` now
 * depends on, so component tests written before that round trip existed
 * keep exercising the same rendering behavior unchanged.
 */
export function installFakeValidatingWorker(schema: FormPreviewSchema): void {
  const postMessage = vi.fn((msg: unknown) => {
    const m = msg as { type: string; typeFqn: string; data: Record<string, unknown>; requestId: string };
    if (m.type !== 'instance:validate' || m.typeFqn !== schema.targetId) return;
    usePreviewStore.getState().receiveValidateResult(m.requestId, computeFakeDiagnostics(schema.fields, m.data));
  });
  usePreviewStore.getState().setWorkerRef({ postMessage } as unknown as Worker);
}

/**
 * Same as `installFakeValidatingWorker`, but for `instance-store.ts`'s own
 * worker ref (Prototype Workspace's controlled-mode instance editor) —
 * `updateInstanceData` dispatches `instance:validate` unconditionally on
 * every edit, and without a worker attached `dispatchValidate` silently
 * no-ops, leaving `validationErrors[id]` (and therefore
 * `InstanceFormPanel`'s errors/valid/validated props) permanently empty.
 */
export function installFakeValidatingWorkerForInstances(schema: FormPreviewSchema): void {
  const postMessage = vi.fn((msg: unknown) => {
    const m = msg as { type: string; typeFqn: string; data: Record<string, unknown>; requestId: string };
    if (m.type !== 'instance:validate' || m.typeFqn !== schema.targetId) return;
    useInstanceStore.getState().receiveValidateResult(m.requestId, computeFakeDiagnostics(schema.fields, m.data));
  });
  useInstanceStore.getState().setWorker({ postMessage } as unknown as Worker);
}
