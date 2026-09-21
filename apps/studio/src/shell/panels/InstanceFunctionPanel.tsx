// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';
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

const NO_SESSION_STATE: FunctionSessionState = {
  functionFqn: null,
  boundParameter: null,
  inputs: {},
  result: undefined,
  status: 'idle'
};

export const InstanceFunctionPanel = withInstrumentation(
  function InstanceFunctionPanel({ instanceId }: { instanceId: string }): ReactElement {
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
    if (!factory || !session)
      return <p className="p-3 text-sm text-muted-foreground">Function execution is preparing…</p>;
    return (
      <section className="space-y-3 p-3" aria-label="Function session">
        <WorkspaceTypePicker
          label="Choose a function"
          value={state.functionFqn}
          onSelect={(fqn) => fqn && void session.selectFunction(fqn)}
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
                  .filter((field) => field.kind === 'object' || field.kind === 'array')
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
              onExecute={() => void session.run()}
              presentation={{ mode: 'instance', showHeader: false, showPayload: false }}
            />
            <Button type="button" size="sm" disabled={state.status === 'running'} onClick={() => void session.run()}>
              {state.status === 'running' ? 'Running…' : 'Run'}
            </Button>
          </>
        ) : null}
        {state.status === 'succeeded' ? (
          <pre aria-label="Function result">{JSON.stringify(state.result, null, 2)}</pre>
        ) : null}
      </section>
    );
  },
  { op: 'InstanceFunctionPanel' }
);
