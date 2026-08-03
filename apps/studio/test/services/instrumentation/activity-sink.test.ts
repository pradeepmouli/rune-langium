// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import {
  configureInstrumentation,
  resetInstrumentationForTests,
  setInstrumentationThreshold,
  withInstrumentation
} from '../../../src/services/instrumentation/core.js';
import { useActivityStore } from '../../../src/store/activity-store.js';
import { installInstrumentationActivitySink } from '../../../src/services/instrumentation/activity-sink.js';

afterEach(() => {
  resetInstrumentationForTests();
  useActivityStore.setState({ entries: [] });
});

describe('installInstrumentationActivitySink', () => {
  it('a namespace-tagged call adds a correctly-shaped ActivityEntry', () => {
    configureInstrumentation(() => {});
    const unregister = installInstrumentationActivitySink();
    setInstrumentationThreshold('info');
    const wrapped = withInstrumentation(() => 'ok', { op: 'testOp', level: 'info', namespace: 'workspace' });
    wrapped();
    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag: 'workspace', ok: true, msg: 'testOp' });
    unregister();
  });

  it('a debug-default call (no namespace) does NOT add an entry', () => {
    configureInstrumentation(() => {});
    installInstrumentationActivitySink();
    setInstrumentationThreshold('trace');
    const wrapped = withInstrumentation(() => 'ok', { op: 'plainOp' });
    wrapped();
    expect(useActivityStore.getState().entries).toHaveLength(0);
  });

  it('regression: an ordinary unhandled error with NO namespace does NOT add an entry, even though it unconditionally clears the global threshold', () => {
    configureInstrumentation(() => {});
    installInstrumentationActivitySink();
    setInstrumentationThreshold('error');
    const wrapped = withInstrumentation(
      () => {
        throw new Error('boom');
      },
      { op: 'explode' }
    );
    expect(() => wrapped()).toThrow('boom');
    expect(useActivityStore.getState().entries).toHaveLength(0);
  });

  it('a namespace-tagged handled error adds an entry with ok:false', () => {
    configureInstrumentation(() => {});
    installInstrumentationActivitySink();
    setInstrumentationThreshold('warn');
    const wrapped = withInstrumentation(
      () => {
        throw new Error('boom');
      },
      { op: 'retryExhausted', handled: true, namespace: 'curated' }
    );
    expect(() => wrapped()).toThrow('boom');
    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag: 'curated', ok: false, msg: 'retryExhausted' });
  });
});
