// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useInstanceStore } from '../../store/instance-store.js';

export interface InstanceInspectorPanelProps {
  instanceId: string;
}

export function InstanceInspectorPanel({ instanceId }: InstanceInspectorPanelProps) {
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const diagnostics = useInstanceStore((s) => s.validationErrors[instanceId]) ?? [];

  if (!record) return null;

  return (
    <div className="flex flex-col gap-3 p-2 text-sm">
      <section>
        <h3 className="font-semibold">Validation</h3>
        {diagnostics.length === 0 ? (
          <p className="text-muted-foreground">Valid</p>
        ) : (
          <ul>
            {diagnostics.map((d, i) => (
              <li key={`${d.path}-${i}`}>
                <span>{d.path}</span>: <span>{d.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Provenance</h3>
        <p className="text-muted-foreground">{record.provenance?.codec ?? 'manual'}</p>
      </section>
      <section>
        <h3 className="font-semibold">Raw JSON</h3>
        <pre className="overflow-auto">{JSON.stringify(record.data, null, 2)}</pre>
      </section>
    </div>
  );
}
