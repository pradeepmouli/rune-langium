// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { InstanceCreateDialog } from '../../../components/InstanceCreateDialog.js';
import { usePrototypeViewStore } from '../../../store/prototype-view-store.js';
import { useWorkspaceOptional } from '../../providers/workspace-context.js';
import { InstanceInspectorPanel } from '../../panels/InstanceInspectorPanel.js';
import { InstanceGridPanel } from '../../panels/InstanceGridPanel.js';
import { withInstrumentation } from '../../../services/instrumentation/core.js';
import { usePrototypeNavigationStore } from '../../../services/prototype-navigation.js';

export const PrototypePerspective = withInstrumentation(
  function PrototypePerspective(): ReactElement {
    const workspace = useWorkspaceOptional();
    const view = usePrototypeViewStore((state) => state.state);
    const activate = usePrototypeViewStore((state) => state.activate);
    const patch = usePrototypeViewStore((state) => state.patch);
    const [creating, setCreating] = useState(false);
    const [seed, setSeed] = useState<Parameters<typeof InstanceCreateDialog>[0]['seed']>();

    useEffect(() => {
      if (workspace?.workspaceId) void activate(workspace.workspaceId);
    }, [activate, workspace?.workspaceId]);
    useEffect(() => {
      if (!workspace?.workspaceId) return;
      const intent = usePrototypeNavigationStore.getState().consume(workspace.workspaceId);
      if (intent?.kind === 'create') {
        setSeed(intent.seed);
        setCreating(true);
      }
    }, [workspace?.workspaceId]);

    return (
      <section data-testid="prototype-perspective" className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm text-muted-foreground">Persistent instances</p>
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
        <div className="min-h-0 flex-[2] border-b border-border">
          {view.selectedId ? (
            <InstanceInspectorPanel instanceId={view.selectedId} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select or create an instance to inspect it.
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <InstanceGridPanel />
        </div>
        <InstanceCreateDialog
          seed={seed}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(id) => patch({ selectedId: id, inspectorTab: 'form' })}
        />
      </section>
    );
  },
  { op: 'PrototypePerspective' }
);
