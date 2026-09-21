// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useInstanceStore } from '../../store/instance-store.js';
import { usePrototypeViewStore } from '../../store/prototype-view-store.js';
import { InstancePayloadPanel } from '../../components/InstancePayloadPanel.js';
import { downloadFile } from '../../services/export.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rune-langium/design-system/ui/tabs';
import { InstanceFormPanel } from './InstanceFormPanel.js';
import { InstanceFunctionPanel } from './InstanceFunctionPanel.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface InstanceInspectorPanelProps {
  instanceId: string;
}

function saveStatusText(saveState: { state: string; message?: string } | undefined): string {
  if (saveState?.state === 'failed') return `Save failed: ${saveState.message}`;
  const state = saveState?.state ?? 'unsaved';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export const InstanceInspectorPanel = withInstrumentation(
  function InstanceInspectorPanel({ instanceId }: InstanceInspectorPanelProps) {
    const record = useInstanceStore((s) => s.instances[instanceId]);
    const diagnostics = useInstanceStore((s) => s.validationErrors[instanceId]) ?? [];
    const validationStatus = useInstanceStore((s) => s.validationStatus[instanceId]);
    const saveState = useInstanceStore((s) => s.saveStates[instanceId]);
    const retrySave = useInstanceStore((s) => s.retrySave);
    const view = usePrototypeViewStore((s) => s.state);
    const patchView = usePrototypeViewStore((s) => s.patch);

    if (!record) return null;

    return (
      <div className="flex h-full min-h-0 flex-col text-sm">
        <header className="border-b border-border px-3 py-2">
          <h2 className="truncate text-sm font-semibold">{record.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{record.typeFqn}</p>
          <p role="status" aria-label="Save status" className="mt-1 text-xs text-muted-foreground">
            {saveStatusText(saveState)}
          </p>
          {saveState?.state === 'failed' ? (
            <button type="button" className="mt-1 text-xs underline" onClick={() => void retrySave(instanceId)}>
              Retry save
            </button>
          ) : null}
        </header>
        <section className="px-3 pt-2">
          <h3 className="font-semibold">Validation</h3>
          {validationStatus === 'pending' || !validationStatus ? (
            <p className="text-muted-foreground">Checking…</p>
          ) : diagnostics.length === 0 ? (
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
        <section className="px-3 pt-2">
          <h3 className="font-semibold">Provenance</h3>
          <p className="text-muted-foreground">{record.provenance?.codec ?? 'manual'}</p>
        </section>
        <Tabs
          value={view.inspectorTab}
          onValueChange={(value) => patchView({ inspectorTab: value as 'form' | 'functions' })}
          className="mt-3 flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-3 shrink-0 self-start">
            <TabsTrigger value="form">Form</TabsTrigger>
            <TabsTrigger value="functions">Functions</TabsTrigger>
          </TabsList>
          <TabsContent value="form" className="min-h-0 flex-1 overflow-auto">
            <InstanceFormPanel key={record.id} instanceId={record.id} />
          </TabsContent>
          <TabsContent value="functions" className="min-h-0 flex-1">
            <InstanceFunctionPanel instanceId={record.id} />
          </TabsContent>
        </Tabs>
        <InstancePayloadPanel
          payload={{ kind: 'instance', value: record.data }}
          onExport={() => downloadFile(JSON.stringify(record.data, null, 2), `${record.name}.json`, 'application/json')}
        />
      </div>
    );
  },
  { op: 'InstanceInspectorPanel' }
);
