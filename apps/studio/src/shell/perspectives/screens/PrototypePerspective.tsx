// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { jsonCodec } from '@rune-langium/codegen/instances';
import { InstanceCreateDialog } from '../../../components/InstanceCreateDialog.js';
import { usePrototypeViewStore } from '../../../store/prototype-view-store.js';
import { useWorkspaceOptional } from '../../providers/workspace-context.js';
import { InstanceInspectorPanel } from '../../panels/InstanceInspectorPanel.js';
import { InstanceGridPanel } from '../../panels/InstanceGridPanel.js';
import { InstanceGraphPanel } from '../../panels/InstanceGraphPanel.js';
import { useInstanceStore } from '../../../store/instance-store.js';
import { withInstrumentation } from '../../../services/instrumentation/core.js';
import { usePrototypeNavigationStore } from '../../../services/prototype-navigation.js';

export const PrototypePerspective = withInstrumentation(
  function PrototypePerspective(): ReactElement {
    const workspace = useWorkspaceOptional();
    const view = usePrototypeViewStore((state) => state.state);
    const activate = usePrototypeViewStore((state) => state.activate);
    const patch = usePrototypeViewStore((state) => state.patch);
    const pendingIntent = usePrototypeNavigationStore((state) => state.pending);
    const consumePrototypeIntent = usePrototypeNavigationStore((state) => state.consume);
    const [creating, setCreating] = useState(false);
    const [seed, setSeed] = useState<Parameters<typeof InstanceCreateDialog>[0]['seed']>();
    const [importError, setImportError] = useState<string | null>(null);
    const [focusedPayloadPointer, setFocusedPayloadPointer] = useState<string | undefined>();
    const importInputRef = useRef<HTMLInputElement>(null);
    const activationRef = useRef<{ workspaceId: string; promise: Promise<void> } | undefined>(undefined);
    const selectedRecord = useInstanceStore((state) =>
      view.selectedId ? state.instances[view.selectedId] : undefined
    );
    const graphAvailable = view.graphVisible && selectedRecord !== undefined;
    const compactPane = !selectedRecord
      ? 'grid'
      : view.compactPane === 'graph' && !graphAvailable
        ? 'inspector'
        : view.compactPane;

    useEffect(() => {
      const workspaceId = workspace?.workspaceId;
      if (!workspaceId) return;
      if (activationRef.current?.workspaceId !== workspaceId) {
        activationRef.current = { workspaceId, promise: activate(workspaceId) };
      }
      let cancelled = false;
      void activationRef.current.promise.then(() => {
        if (cancelled) return;
        const intent = consumePrototypeIntent(workspaceId);
        if (intent?.kind === 'create') {
          setSeed(intent.seed);
          setCreating(true);
        }
        if (intent?.kind === 'open')
          patch({ selectedId: intent.instanceId, inspectorTab: 'form', compactPane: 'inspector' });
      });
      return () => {
        cancelled = true;
      };
    }, [consumePrototypeIntent, patch, pendingIntent, workspace?.workspaceId]);
    useEffect(() => setFocusedPayloadPointer(undefined), [selectedRecord?.id]);

    const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const result = jsonCodec.import(await file.text(), view.typeFqn ?? '');
      if (result.diagnostics.length > 0 || result.data === undefined) {
        setImportError(result.diagnostics.map((diagnostic) => diagnostic.message).join(' '));
        return;
      }
      setImportError(null);
      setSeed({ data: result.data, ...(view.typeFqn ? { typeFqn: view.typeFqn } : {}) });
      setCreating(true);
    };

    return (
      <section data-testid="prototype-perspective" className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm text-muted-foreground">Persistent instances</p>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Import JSON"
            className="sr-only"
            onChange={importJson}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => importInputRef.current?.click()}>
            Import JSON
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Toggle payload graph"
            onClick={() => {
              const graphVisible = !view.graphVisible;
              patch({ graphVisible, ...(graphVisible ? { compactPane: 'graph' } : {}) });
            }}
          >
            Payload graph
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setSeed(undefined);
              setCreating(true);
            }}
          >
            New instance
          </Button>
        </div>
        <nav aria-label="Prototype panes" className="flex border-b border-border lg:hidden">
          <Button
            type="button"
            variant={compactPane === 'inspector' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none"
            disabled={!selectedRecord}
            onClick={() => patch({ compactPane: 'inspector' })}
          >
            Inspector
          </Button>
          <Button
            type="button"
            variant={compactPane === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none"
            onClick={() => patch({ compactPane: 'grid' })}
          >
            Instances
          </Button>
          {graphAvailable ? (
            <Button
              type="button"
              variant={compactPane === 'graph' ? 'secondary' : 'ghost'}
              size="sm"
              className="flex-1 rounded-none"
              onClick={() => patch({ compactPane: 'graph' })}
            >
              Payload graph
            </Button>
          ) : null}
        </nav>
        <div
          className={`min-h-0 flex-[2] border-b border-border lg:flex ${compactPane === 'grid' ? 'hidden' : 'flex'}`}
        >
          <div className={`min-h-0 min-w-0 flex-1 ${compactPane === 'graph' ? 'hidden lg:block' : 'block'}`}>
            {view.selectedId ? (
              <InstanceInspectorPanel instanceId={view.selectedId} focusedPayloadPointer={focusedPayloadPointer} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select or create an instance to inspect it.
              </div>
            )}
          </div>
          {graphAvailable ? (
            <div
              className={`min-h-0 min-w-0 flex-1 border-border lg:border-l ${
                compactPane === 'graph' ? 'block' : 'hidden lg:block'
              }`}
            >
              <InstanceGraphPanel
                record={selectedRecord}
                onSelectPointer={(pointer) => {
                  setFocusedPayloadPointer(pointer);
                  patch({ compactPane: 'inspector' });
                }}
              />
            </div>
          ) : null}
        </div>
        <div className={`min-h-0 flex-1 lg:flex ${compactPane === 'grid' ? 'flex' : 'hidden'}`}>
          <InstanceGridPanel />
        </div>
        {importError ? (
          <p role="alert" className="border-t border-border p-2 text-sm text-destructive">
            {importError}
          </p>
        ) : null}
        <InstanceCreateDialog
          seed={seed}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(id) => patch({ selectedId: id, inspectorTab: 'form', compactPane: 'inspector' })}
        />
      </section>
    );
  },
  { op: 'PrototypePerspective' }
);
