// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { FormPreviewPanel } from '../../components/FormPreviewPanel.js';
import { useInstanceStore } from '../../store/instance-store.js';
import type { PreviewStatus } from '../../store/preview-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface InstanceFormPanelProps {
  instanceId: string;
}

export const InstanceFormPanel = withInstrumentation(
  function InstanceFormPanel({ instanceId }: InstanceFormPanelProps): ReactElement {
    const record = useInstanceStore((s) => s.instances[instanceId]);
    const schema = useInstanceStore((s) => (record ? s.schemas.get(record.typeFqn) : undefined));
    const schemaError = useInstanceStore((s) => (record ? s.schemaErrors.get(record.typeFqn) : undefined));
    const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);
    const rawDiagnostics = useInstanceStore((s) => s.validationErrors[instanceId]);

    useEffect(() => {
      if (!record) return;
      useInstanceStore.getState().dispatchGenerateSchema(record.typeFqn);
      // Only re-dispatch when the target type changes, not on every store
      // update (updateInstanceData/receiveValidateResult also touch this
      // store and must not retrigger a schema fetch).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record?.typeFqn]);

    if (!record) {
      return (
        <section role="status" className="p-3 text-sm text-muted-foreground">
          Instance not found.
        </section>
      );
    }

    // A failed schema fetch (finding #7) renders as 'unavailable' — reusing
    // FormPreviewPanel's existing status contract — instead of leaving the
    // panel stuck on "Generating preview…" forever.
    const status: PreviewStatus = schema
      ? { state: 'ready', targetId: record.typeFqn }
      : schemaError
        ? { state: 'unavailable', targetId: record.typeFqn, reason: schemaError.reason, message: schemaError.message }
        : { state: 'waiting', targetId: record.typeFqn };

    // `undefined` means no instance:validateResult has arrived yet for this
    // instance (e.g. it was just created and the round trip is still in
    // flight) — treat as "nothing to show yet", matching the uncontrolled
    // panel's own pre-first-validation convention, rather than surfacing a
    // stale/empty result as either "all valid" or "all invalid".
    const { errors, valid, validated } = rawDiagnostics
      ? {
          errors: Object.fromEntries(rawDiagnostics.map((d) => [d.path, d.message])),
          valid: rawDiagnostics.length === 0,
          validated: true
        }
      : { errors: {}, valid: true, validated: false };

    return (
      <FormPreviewPanel
        schema={schema}
        status={status}
        values={record.data as Record<string, unknown>}
        onValuesChange={(values) => updateInstanceData(instanceId, values)}
        errors={errors}
        valid={valid}
        validated={validated}
      />
    );
  },
  { op: 'InstanceFormPanel' }
);
