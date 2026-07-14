// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { FormPreviewPanel } from '../../components/FormPreviewPanel.js';
import { useInstanceStore } from '../../store/instance-store.js';
import type { PreviewStatus } from '../../store/preview-store.js';

export interface InstanceFormPanelProps {
  instanceId: string;
}

export function InstanceFormPanel({ instanceId }: InstanceFormPanelProps): ReactElement {
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const schema = useInstanceStore((s) => (record ? s.schemas.get(record.typeFqn) : undefined));
  const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);

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

  const status: PreviewStatus = schema
    ? { state: 'ready', targetId: record.typeFqn }
    : { state: 'waiting', targetId: record.typeFqn };

  return (
    <FormPreviewPanel
      schema={schema}
      status={status}
      values={record.data as Record<string, unknown>}
      onValuesChange={(values) => updateInstanceData(instanceId, values)}
    />
  );
}
