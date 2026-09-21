// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useEffect } from 'react';
import { useInstanceStore } from '../../store/instance-store.js';
import { usePrototypeViewStore } from '../../store/prototype-view-store.js';
import { InstancePayloadPanel } from '../../components/InstancePayloadPanel.js';
import { downloadFile, sanitizeDownloadFilename } from '../../services/export.js';
import { viewTypeInExplore } from '../../services/explore-navigation.js';
import { payloadPointerToFieldPath } from '../../services/instance-payload-graph.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rune-langium/design-system/ui/tabs';
import { InstanceFormPanel } from './InstanceFormPanel.js';
import { InstanceFunctionPanel } from './InstanceFunctionPanel.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export interface InstanceInspectorPanelProps {
  instanceId: string;
  focusedPayloadPointer?: string;
}

function saveStatusText(saveState: { state: string; message?: string } | undefined): string {
  if (saveState?.state === 'failed') return `Save failed: ${saveState.message}`;
  const state = saveState?.state ?? 'unsaved';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export const InstanceInspectorPanel = withInstrumentation(
  function InstanceInspectorPanel({ instanceId, focusedPayloadPointer }: InstanceInspectorPanelProps) {
    const record = useInstanceStore((s) => s.instances[instanceId]);
    const diagnostics = useInstanceStore((s) => s.validationErrors[instanceId]) ?? [];
    const validationStatus = useInstanceStore((s) => s.validationStatus[instanceId]);
    const schemaError = useInstanceStore((s) => (record ? s.schemaErrors.get(record.typeFqn) : undefined));
    const saveState = useInstanceStore((s) => s.saveStates[instanceId]);
    const retrySave = useInstanceStore((s) => s.retrySave);
    const retryInstance = useInstanceStore((s) => s.retryInstance);
    const flushInstance = useInstanceStore((s) => s.flushInstance);
    const view = usePrototypeViewStore((s) => s.state);
    const patchView = usePrototypeViewStore((s) => s.patch);

    useEffect(() => {
      const fieldPath = focusedPayloadPointer && payloadPointerToFieldPath(focusedPayloadPointer);
      if (!fieldPath) return;
      patchView({ inspectorTab: 'form' });
      const frame = requestAnimationFrame(() => {
        const target = Array.from(document.querySelectorAll<HTMLElement>('[data-field-path]')).find(
          (element) => element.dataset.fieldPath === fieldPath
        );
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const input = target?.querySelector<HTMLElement>('input, button, [role="combobox"]');
        (input ?? target)?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }, [focusedPayloadPointer, patchView]);

    if (!record) return null;

    return (
      <div className="flex h-full min-h-0 flex-col text-sm">
        <header className="border-b border-border px-3 py-2">
          <h2 className="truncate text-sm font-semibold">{record.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{record.typeFqn}</p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="mt-1"
            onClick={() => viewTypeInExplore(record.typeFqn)}
          >
            View type in Explore
          </Button>
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
          ) : validationStatus === 'unavailable' ? (
            <>
              <p className="text-muted-foreground">{schemaError?.message ?? 'Instance validation is unavailable.'}</p>
              <button type="button" className="mt-1 text-xs underline" onClick={() => void retryInstance(instanceId)}>
                Retry validation
              </button>
            </>
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
          onExport={async () => {
            await flushInstance(record.id);
            downloadFile(
              JSON.stringify(record.data, null, 2),
              sanitizeDownloadFilename(`${record.name}.json`, 'instance.json'),
              'application/json'
            );
          }}
        />
      </div>
    );
  },
  { op: 'InstanceInspectorPanel' }
);
