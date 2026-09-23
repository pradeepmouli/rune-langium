// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { WorkspaceTypePicker } from '../../components/WorkspaceTypePicker.js';
import { FormPreviewPanel } from '../../components/FormPreviewPanel.js';
import { useInstanceStore } from '../../store/instance-store.js';
import { usePreviewSessionFactory } from '../providers/preview-session-context.js';
import {
  createFunctionSession,
  type FunctionSession,
  type FunctionSessionState
} from '../../store/function-session-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';
import { resolveFunctionOutputTarget } from '../../services/function-output-target.js';
import { isInstanceBindableToField } from '../../services/function-input-binding.js';
import { requestPrototype } from '../../services/prototype-navigation.js';
import { useWorkspaceOptional } from '../providers/workspace-context.js';
import { qualifiedNameFromNodeId } from '@rune-langium/visual-editor';

const NO_SESSION_STATE: FunctionSessionState = {
  functionFqn: null,
  boundParameter: null,
  inputs: {},
  result: undefined,
  status: 'idle'
};

function InstanceFunctionSession({
  instanceId,
  onStateChange
}: {
  instanceId: string;
  onStateChange?(state: FunctionSessionState | undefined): void;
}): ReactElement {
  const workspace = useWorkspaceOptional();
  const workspaceId = workspace?.workspaceId;
  const factory = usePreviewSessionFactory();
  const instance = useInstanceStore((state) => state.instances[instanceId]);
  const sessionRef = useRef<FunctionSession | undefined>(undefined);
  if (!sessionRef.current && factory) sessionRef.current = createFunctionSession(factory());
  const session = sessionRef.current;
  useEffect(() => () => session?.dispose(), [session]);
  const state = useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => undefined),
    () => session?.getState() ?? NO_SESSION_STATE
  );
  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);
  useEffect(() => () => onStateChange?.(undefined), [onStateChange]);
  const outputTarget = useMemo(
    () => resolveFunctionOutputTarget(workspace?.models ?? [], state.functionFqn, state.schema),
    [state.functionFqn, state.schema, workspace?.models]
  );
  const canSaveResult =
    state.status === 'succeeded' &&
    outputTarget !== undefined &&
    state.result !== null &&
    typeof state.result === 'object' &&
    !Array.isArray(state.result);
  if (!factory || !session)
    return <p className="p-3 text-sm text-muted-foreground">Function execution is preparing…</p>;
  return (
    <section className="space-y-3 p-3" aria-label="Function session">
      <WorkspaceTypePicker
        label="Choose a function"
        value={state.functionFqn}
        onSelect={() => undefined}
        onSelectOption={(option) =>
          option && void session.selectFunction(qualifiedNameFromNodeId(option.value), option.value)
        }
        filterKinds={['func']}
      />
      {!state.functionFqn ? <p className="text-sm text-muted-foreground">Choose a function to run.</p> : null}
      {state.status === 'running' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading function…
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.schema ? (
        <>
          {instance ? (
            <div className="flex flex-wrap gap-1.5">
              {state.schema.fields
                .filter((field) => isInstanceBindableToField(instance, field, workspace?.models ?? []))
                .map((field) => (
                  <Button
                    key={field.path}
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => session.bindInstance(field.path, instance)}
                  >
                    Use {instance.name} for {field.label}
                  </Button>
                ))}
            </div>
          ) : null}
          <FormPreviewPanel
            schema={state.schema}
            status={{ state: 'ready', targetId: state.schema.targetId }}
            values={state.inputs}
            onValuesChange={(inputs) => session.setInputs(inputs)}
            presentation={{ mode: 'instance', showHeader: false, showPayload: false }}
          />
          <Button type="button" size="sm" disabled={state.status === 'running'} onClick={() => void session.run()}>
            {state.status === 'running' ? 'Running…' : 'Run'}
          </Button>
        </>
      ) : null}
      {state.status === 'succeeded' ? (
        <>
          {canSaveResult && workspaceId ? (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                requestPrototype(workspaceId, {
                  kind: 'create',
                  seed: { typeFqn: outputTarget.typeFqn, data: structuredClone(state.result) }
                })
              }
            >
              Save result as instance…
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export const InstanceFunctionPanel = withInstrumentation(
  function InstanceFunctionPanel({
    instanceId,
    onStateChange
  }: {
    instanceId: string;
    onStateChange?(state: FunctionSessionState | undefined): void;
  }): ReactElement {
    return <InstanceFunctionSession key={instanceId} instanceId={instanceId} onStateChange={onStateChange} />;
  },
  { op: 'InstanceFunctionPanel' }
);
