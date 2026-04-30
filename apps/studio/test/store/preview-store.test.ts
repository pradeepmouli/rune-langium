// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it } from 'vitest';
import type { FormPreviewSchema } from '@rune-langium/codegen';
import { usePreviewStore } from '../../src/store/preview-store.js';

function schema(
  targetId: string,
  title = targetId.split('.').at(-1) ?? targetId
): FormPreviewSchema {
  return {
    schemaVersion: 1,
    targetId,
    title,
    status: 'ready',
    fields: [{ path: 'value', label: 'value', kind: 'string', required: true }]
  };
}

describe('usePreviewStore', () => {
  beforeEach(() => {
    usePreviewStore.getState().resetPreviewState();
  });

  it('selects duplicate display names by fully-qualified target id', () => {
    usePreviewStore.getState().setAvailableTargets([
      { id: 'alpha.Trade', namespace: 'alpha', name: 'Trade', kind: 'data' },
      { id: 'beta.Trade', namespace: 'beta', name: 'Trade', kind: 'data' }
    ]);

    usePreviewStore.getState().selectTarget('beta.Trade');

    expect(usePreviewStore.getState().selectedTargetId).toBe('beta.Trade');
    expect(usePreviewStore.getState().selectedTarget?.namespace).toBe('beta');
  });

  it('stores preview snapshots per target id and keeps last good snapshot when stale', () => {
    usePreviewStore
      .getState()
      .setAvailableTargets([
        { id: 'alpha.Trade', namespace: 'alpha', name: 'Trade', kind: 'data' }
      ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');
    usePreviewStore.getState().receivePreviewResult(schema('alpha.Trade', 'Trade'));
    usePreviewStore.getState().receivePreviewStale({
      targetId: 'alpha.Trade',
      reason: 'parse-error',
      message: 'Expected attribute'
    });

    expect(usePreviewStore.getState().schemas.get('alpha.Trade')?.title).toBe('Trade');
    expect(usePreviewStore.getState().status).toEqual({
      state: 'stale',
      targetId: 'alpha.Trade',
      reason: 'parse-error',
      message: 'Expected attribute'
    });
  });

  it('re-resolves rename and clears deleted selected targets by id', () => {
    usePreviewStore
      .getState()
      .setAvailableTargets([
        { id: 'alpha.Trade', namespace: 'alpha', name: 'Trade', kind: 'data' }
      ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');

    usePreviewStore
      .getState()
      .setAvailableTargets([
        { id: 'alpha.RenamedTrade', namespace: 'alpha', name: 'RenamedTrade', kind: 'data' }
      ]);

    expect(usePreviewStore.getState().selectedTargetId).toBeUndefined();
    expect(usePreviewStore.getState().selectedTarget).toBeUndefined();
  });

  it('re-resolves renamed targets by source identity when the selected id changes', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');

    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.RenamedTrade',
        namespace: 'alpha',
        name: 'RenamedTrade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);

    expect(usePreviewStore.getState().selectedTargetId).toBe('alpha.RenamedTrade');
    expect(usePreviewStore.getState().selectedTarget?.name).toBe('RenamedTrade');
  });

  it('preserves source identity through transitional target updates before a rename resolves', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');

    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data'
      }
    ]);

    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.RenamedTrade',
        namespace: 'alpha',
        name: 'RenamedTrade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 18, character: 0 }
        }
      }
    ]);

    expect(usePreviewStore.getState().selectedTargetId).toBe('alpha.RenamedTrade');
    expect(usePreviewStore.getState().selectedTarget?.name).toBe('RenamedTrade');
  });

  it('re-resolves a renamed target after the selected target is transiently cleared during reload', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');

    usePreviewStore.getState().setAvailableTargets([]);
    expect(usePreviewStore.getState().selectedTargetId).toBeUndefined();

    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.RenamedTrade',
        namespace: 'alpha',
        name: 'RenamedTrade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 18, character: 0 }
        }
      }
    ]);

    expect(usePreviewStore.getState().selectedTargetId).toBe('alpha.RenamedTrade');
    expect(usePreviewStore.getState().selectedTarget?.name).toBe('RenamedTrade');
  });

  it('ignores stale selection requests for missing target ids after a rename has been resolved', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.RenamedTrade',
        namespace: 'alpha',
        name: 'RenamedTrade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 18, character: 0 }
        }
      }
    ]);

    usePreviewStore.getState().selectTarget('alpha.Trade');

    expect(usePreviewStore.getState().selectedTargetId).toBe('alpha.RenamedTrade');
    expect(usePreviewStore.getState().selectedTarget?.name).toBe('RenamedTrade');
  });

  it('preserves source identity when re-selecting a target from metadata-less target snapshots', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');

    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data'
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');

    expect(usePreviewStore.getState().selectedTarget).toMatchObject({
      id: 'alpha.Trade',
      sourceUri: 'file:///workspace/trade.rosetta',
      sourceIndex: 2
    });
  });

  it('drops selected target samples and cached schema when the target disappears from the available set', () => {
    usePreviewStore
      .getState()
      .setAvailableTargets([
        { id: 'alpha.Trade', namespace: 'alpha', name: 'Trade', kind: 'data' }
      ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');
    usePreviewStore.getState().receivePreviewResult(schema('alpha.Trade', 'Trade'));
    usePreviewStore.getState().setSampleValues('alpha.Trade', { tradeId: 'T-1' });

    usePreviewStore.getState().setAvailableTargets([]);

    expect(usePreviewStore.getState().selectedTargetId).toBeUndefined();
    expect(usePreviewStore.getState().selectedTarget).toBeUndefined();
    expect(usePreviewStore.getState().status).toEqual({ state: 'waiting' });
    expect(usePreviewStore.getState().samples.has('alpha.Trade')).toBe(false);
    expect(usePreviewStore.getState().schemas.has('alpha.Trade')).toBe(false);
  });

  it('ignores stale worker messages for targets that are no longer selected after deletion', () => {
    usePreviewStore
      .getState()
      .setAvailableTargets([
        { id: 'alpha.Trade', namespace: 'alpha', name: 'Trade', kind: 'data' }
      ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');
    usePreviewStore.getState().receivePreviewResult(schema('alpha.Trade', 'Trade'));

    usePreviewStore.getState().setAvailableTargets([]);
    usePreviewStore.getState().receivePreviewStale({
      targetId: 'alpha.Trade',
      reason: 'unsupported-target',
      message: 'No form preview schema is available for alpha.Trade.'
    });

    expect(usePreviewStore.getState().selectedTargetId).toBeUndefined();
    expect(usePreviewStore.getState().status).toEqual({ state: 'waiting' });
  });

  it('looks up source metadata for cached preview fields by fully-qualified target id', () => {
    usePreviewStore.getState().receivePreviewResult({
      ...schema('alpha.Trade', 'Trade'),
      sourceMap: [
        {
          fieldPath: 'value',
          sourceUri: 'file:///workspace/trade.rosetta',
          sourceLine: 9,
          sourceChar: 3
        }
      ]
    });

    expect(usePreviewStore.getState().getFieldSource('alpha.Trade', 'value')).toEqual({
      fieldPath: 'value',
      sourceUri: 'file:///workspace/trade.rosetta',
      sourceLine: 9,
      sourceChar: 3
    });
    expect(usePreviewStore.getState().getFieldSource('beta.Trade', 'value')).toBeUndefined();
  });

  it('tracks invalid sample state and resets back to ready for the active target', () => {
    usePreviewStore.getState().receivePreviewResult(schema('alpha.Trade', 'Trade'));
    usePreviewStore.getState().ensureSample('alpha.Trade', { value: '' });

    usePreviewStore
      .getState()
      .updateSample('alpha.Trade', { value: '' }, { value: 'Value is required' }, false, true);

    expect(usePreviewStore.getState().status).toEqual({
      state: 'invalid',
      targetId: 'alpha.Trade'
    });

    usePreviewStore.getState().resetSample('alpha.Trade', { value: '' });

    expect(usePreviewStore.getState().status).toEqual({
      state: 'ready',
      targetId: 'alpha.Trade'
    });
    expect(usePreviewStore.getState().samples.get('alpha.Trade')).toMatchObject({
      values: { value: '' },
      serialized: '{\n  "value": ""\n}',
      errors: {},
      valid: true,
      validated: false
    });
  });

  it('preserves sample values and invalid status when a selected target is renamed by source identity', () => {
    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.Trade',
        namespace: 'alpha',
        name: 'Trade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 12, character: 0 }
        }
      }
    ]);
    usePreviewStore.getState().selectTarget('alpha.Trade');
    usePreviewStore.getState().receivePreviewResult(schema('alpha.Trade', 'Trade'));
    usePreviewStore
      .getState()
      .updateSample('alpha.Trade', { value: '' }, { value: 'Value is required' }, false, true);

    usePreviewStore.getState().setAvailableTargets([
      {
        id: 'alpha.RenamedTrade',
        namespace: 'alpha',
        name: 'RenamedTrade',
        kind: 'data',
        sourceUri: 'file:///workspace/trade.rosetta',
        sourceIndex: 2,
        sourceRange: {
          start: { line: 8, character: 0 },
          end: { line: 18, character: 0 }
        }
      }
    ]);

    expect(usePreviewStore.getState().selectedTargetId).toBe('alpha.RenamedTrade');
    expect(usePreviewStore.getState().status).toEqual({
      state: 'invalid',
      targetId: 'alpha.RenamedTrade'
    });
    expect(usePreviewStore.getState().samples.get('alpha.RenamedTrade')).toMatchObject({
      values: { value: '' },
      errors: { value: 'Value is required' },
      valid: false,
      validated: true
    });
    expect(usePreviewStore.getState().samples.has('alpha.Trade')).toBe(false);
    expect(usePreviewStore.getState().schemas.has('alpha.Trade')).toBe(false);
  });

  it('reconciles cached sample values when a schema refresh removes and adds fields', () => {
    usePreviewStore.getState().receivePreviewResult({
      schemaVersion: 1,
      targetId: 'alpha.Trade',
      title: 'Trade',
      status: 'ready',
      fields: [
        { path: 'tradeId', label: 'Trade id', kind: 'string', required: true },
        {
          path: 'counterparty',
          label: 'Counterparty',
          kind: 'object',
          required: false,
          children: [{ path: 'counterparty.name', label: 'Name', kind: 'string', required: true }]
        }
      ]
    });
    usePreviewStore.getState().setSampleValues('alpha.Trade', {
      tradeId: 'T-1',
      obsolete: 'drop me',
      counterparty: { name: 'Acme' }
    });

    usePreviewStore.getState().receivePreviewResult({
      schemaVersion: 1,
      targetId: 'alpha.Trade',
      title: 'Trade',
      status: 'ready',
      fields: [
        { path: 'tradeId', label: 'Trade id', kind: 'string', required: true },
        { path: 'quantity', label: 'Quantity', kind: 'number', required: false }
      ]
    });

    expect(usePreviewStore.getState().samples.get('alpha.Trade')).toMatchObject({
      values: {
        tradeId: 'T-1',
        quantity: ''
      },
      serialized: '{\n  "tradeId": "T-1",\n  "quantity": ""\n}'
    });
  });
});
