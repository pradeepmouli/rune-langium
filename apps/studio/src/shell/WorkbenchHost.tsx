// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react';
import { DockLayout } from '@rune-langium/design-system/ui/dock-layout';
import { restoreNativeLayout } from './dockview-bridge.js';
import { StudioDockTab } from './StudioDockTab.js';
import type { WorkbenchDefinition, WorkbenchHostProps } from './workbench-types.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

export const WorkbenchDefinitionContext = createContext<WorkbenchDefinition | null>(null);

function PanelBody({ name }: { name: string }): React.ReactElement | null {
  const definition = useContext(WorkbenchDefinitionContext);
  if (!definition) throw new Error('PanelBody requires WorkbenchHost');
  // Panel renderers deliberately run inside this stable bridge. Rendering a
  // changing callback as <Component /> changes React's element type and
  // remounts its local state whenever surrounding perspective state updates.
  const render = definition.panels[name] as ((props: object) => React.ReactElement | null) | undefined;
  return render?.({}) ?? null;
}

function createDockviewPanelBridge(name: string): React.FC<IDockviewPanelProps> {
  function DockviewPanelBridge() {
    return <PanelBody name={name} />;
  }
  DockviewPanelBridge.displayName = `DockviewPanelBridge(${name})`;
  return DockviewPanelBridge;
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1920 : window.innerWidth;
}

export const resetWorkbench = withInstrumentation(
  function resetWorkbench(api: DockviewApi, definition: WorkbenchDefinition, width: number): void {
    api.clear();
    definition.buildDefault(api, width);
  },
  { op: 'resetWorkbench' }
);

export const WorkbenchHost = withInstrumentation(
  function WorkbenchHost({
    definition,
    initialNativeLayout,
    initialLayout,
    onNativeLayoutChange,
    onNativeLayoutError,
    onRestoreFallback,
    onReady,
    className,
    defaultTabComponent,
    rightHeaderActionsComponent
  }: WorkbenchHostProps): React.ReactElement {
    const definitionRef = useRef(definition);
    definitionRef.current = definition;
    const initialNativeLayoutRef = useRef(initialNativeLayout);
    const initialLayoutRef = useRef(initialLayout);
    const onNativeLayoutChangeRef = useRef(onNativeLayoutChange);
    onNativeLayoutChangeRef.current = onNativeLayoutChange;
    const onNativeLayoutErrorRef = useRef(onNativeLayoutError);
    onNativeLayoutErrorRef.current = onNativeLayoutError;
    const onRestoreFallbackRef = useRef(onRestoreFallback);
    onRestoreFallbackRef.current = onRestoreFallback;
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const listenerRef = useRef<{ dispose(): void } | null>(null);

    const panelNames = Object.keys(definition.panels).sort().join('\u0000');
    const components = useMemo(
      () =>
        Object.fromEntries(
          panelNames ? panelNames.split('\u0000').map((name) => [name, createDockviewPanelBridge(name)]) : []
        ),
      [panelNames]
    );

    const handleReady = useCallback((event: DockviewReadyEvent) => {
      listenerRef.current?.dispose();
      const currentDefinition = definitionRef.current;
      try {
        if (initialNativeLayoutRef.current !== undefined) {
          restoreNativeLayout(
            event.api,
            initialNativeLayoutRef.current,
            new Set(Object.keys(currentDefinition.panels))
          );
        } else if (initialLayoutRef.current) {
          initialLayoutRef.current(event.api, viewportWidth());
        } else {
          currentDefinition.buildDefault(event.api, viewportWidth());
        }
        currentDefinition.reconcile?.(event.api, viewportWidth());
      } catch {
        event.api.clear();
        currentDefinition.buildDefault(event.api, viewportWidth());
        currentDefinition.reconcile?.(event.api, viewportWidth());
        onRestoreFallbackRef.current?.();
      }

      listenerRef.current = event.api.onDidLayoutChange(() => {
        if (event.api.panels.length === 0) return;
        try {
          onNativeLayoutChangeRef.current(event.api.toJSON());
        } catch (error) {
          onNativeLayoutErrorRef.current?.(error);
        }
      });
      onReadyRef.current?.(event.api);
    }, []);

    useEffect(
      () => () => {
        listenerRef.current?.dispose();
        listenerRef.current = null;
      },
      []
    );

    return (
      <WorkbenchDefinitionContext.Provider value={definition}>
        <DockLayout
          components={components}
          defaultTabComponent={defaultTabComponent ?? StudioDockTab}
          rightHeaderActionsComponent={rightHeaderActionsComponent}
          onReady={handleReady}
          className={className}
        />
      </WorkbenchDefinitionContext.Provider>
    );
  },
  { op: 'WorkbenchHost' }
);
