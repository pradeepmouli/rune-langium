// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * PrototypePerspective — full-height sidebar+detail screen for instance
 * authoring. Sidebar lists/creates instances (InstanceExplorerPanel); the
 * detail pane shows the selected instance's fields (InstanceFormPanel),
 * validation/raw JSON (InstanceInspectorPanel), and function execution
 * (InstanceFunctionPanel) behind tabs. Selection is local UI state — no
 * dedicated store, matching GitSyncPerspective's pattern for this
 * complexity level.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { InstanceExplorerPanel } from '../../panels/InstanceExplorerPanel.js';
import { InstanceFormPanel } from '../../panels/InstanceFormPanel.js';
import { InstanceInspectorPanel } from '../../panels/InstanceInspectorPanel.js';
import { InstanceFunctionPanel } from '../../panels/InstanceFunctionPanel.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@rune-langium/design-system/ui/tabs';

export function PrototypePerspective(): ReactElement {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  return (
    <section data-testid="prototype-perspective" className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 border-r border-border">
        <InstanceExplorerPanel selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <div className="min-w-0 flex-1">
        {selectedId ? (
          <Tabs defaultValue="fields" className="flex h-full flex-col">
            <TabsList>
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="inspector">Inspector</TabsTrigger>
              <TabsTrigger value="function">Function</TabsTrigger>
            </TabsList>
            <TabsContent value="fields" className="min-h-0 flex-1">
              {/* `key={selectedId}` forces a full remount of InstanceFormPanel
                  (and its nested FormPreviewPanel) on every instance switch —
                  FormPreviewPanel's `controlledMeta` local state (errors/valid/
                  validated) is scoped to the component instance's lifetime, not
                  keyed by instance id, so without a remount, switching from
                  instance A to instance B could keep showing A's validation
                  errors until B is edited (finding #8). Scoped to just this
                  panel (not the whole Tabs group) so the active tab selection
                  survives an instance switch. */}
              <InstanceFormPanel key={selectedId} instanceId={selectedId} />
            </TabsContent>
            <TabsContent value="inspector" className="min-h-0 flex-1 overflow-auto">
              <InstanceInspectorPanel instanceId={selectedId} />
            </TabsContent>
            <TabsContent value="function" className="min-h-0 flex-1">
              <InstanceFunctionPanel />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Select an instance from the list, or create one, to start editing.
          </div>
        )}
      </div>
    </section>
  );
}
