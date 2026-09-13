// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { Temporal } from '@js-temporal/polyfill';
import { describe, it, expect } from 'vitest';
import { parseWorkspace, isData, type Data } from '@rune-langium/core';
import { mixedChoiceSource, mixedChoiceCases } from '../helpers/mixed-choice.js';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';
import { getActiveConditionPredicates } from '../../src/instances/condition-predicates.js';

async function parseSingleNamespaceDataByName(source: string): Promise<Map<string, Data>> {
  const [result] = await parseWorkspace([{ uri: 'inmemory:///model.rosetta', content: source }]);
  expect(result!.hasErrors, 'expected fixture to parse without errors').toBe(false);
  const model = result!.value as unknown as { elements: unknown[] };
  const map = new Map<string, Data>();
  for (const el of model.elements) {
    if (isData(el)) map.set(el.name, el);
  }
  return map;
}

const FIXTURE = `
namespace test.conditions
version "0.0.0"

type Trade:
  quantity number (1..1)

  condition PositiveQuantity:
    quantity > 0
`;

describe('getActiveConditionPredicates', () => {
  it('preserves direct conversion types in JavaScript previews', async () => {
    const types = await parseSingleNamespaceDataByName(`namespace test.conversion
recordType date { year int month int day int }
recordType zonedDateTime { date date time time timezone string }
type Event:
 start string (1..1)
 end string (1..1)
 condition Current: (start to-zoned-date-time) -> date -> year = 2026
 condition Ordered: (start to-zoned-date-time) < (end to-zoned-date-time)
`);
    const checks = getActiveConditionPredicates(types.get('Event')!).map(
      ({ predicate }) => new Function('data', 'Temporal', `${RUNTIME_HELPER_JS_SOURCE}\nreturn (${predicate});`)
    );
    const event = { start: '2026-01-01T00:30:00+05:30', end: '2025-12-31T20:00:00Z' };
    expect(checks.map((check) => check(event, Temporal))).toEqual([true, true]);
  });

  it('returns one predicate per active condition, executable against a data object', async () => {
    const dataByName = await parseSingleNamespaceDataByName(FIXTURE);
    const data = dataByName.get('Trade')!;
    const predicates = getActiveConditionPredicates(data);
    expect(predicates).toHaveLength(1);
    expect(predicates[0]?.name).toBe('PositiveQuantity');

    const check = new Function('data', `${RUNTIME_HELPER_JS_SOURCE}\nreturn (${predicates[0]!.predicate});`);
    expect(check({ quantity: 5 })).toBe(true);
    expect(check({ quantity: -1 })).toBe(false);
  });

  it('reads calendar fields from ISO strings in JavaScript validation', async () => {
    const types = await parseSingleNamespaceDataByName(`namespace test.calendar
recordType date {year int month int day int}
type Event:
 date date (1..1)
 condition Current: date -> year = 2026
`);
    const { predicate } = getActiveConditionPredicates(types.get('Event')!)[0]!;
    const check = new Function('data', 'Temporal', `${RUNTIME_HELPER_JS_SOURCE}\nreturn (${predicate});`);
    expect(check({ date: '2026-09-12' }, Temporal)).toBe(true);
    expect(check({ date: '2025-09-12' }, Temporal)).toBe(false);
  });

  it('uses offset-aware calendar reads and comparisons in JavaScript predicates', async () => {
    const types = await parseSingleNamespaceDataByName(`namespace test.offset
recordType date {year int month int day int}
recordType zonedDateTime {date date time time timezone string}
type Event:
 start zonedDateTime (1..1)
 end zonedDateTime (1..1)
 condition Current: start -> date -> year = 2026
 condition Ordered: start < end
`);
    const predicates = getActiveConditionPredicates(types.get('Event')!);
    const checks = predicates.map(
      ({ predicate }) => new Function('data', 'Temporal', `${RUNTIME_HELPER_JS_SOURCE}\nreturn (${predicate});`)
    );
    const event = { start: '2026-01-01T00:30:00+05:30', end: '2025-12-31T20:00:00Z' };
    expect(checks.map((check) => check(event, Temporal))).toEqual([true, true]);
    expect(checks[1]!({ ...event, end: '2025-12-31T18:00:00Z' }, Temporal)).toBe(false);
  });

  it('reads raw and wrapped Choice selections in JavaScript validators', async () => {
    const types = await parseSingleNamespaceDataByName(`${mixedChoiceSource}
type Event:
 selection Outer (1..1)
 condition Positive: (selection as Payload) -> amount > 0
 condition Switched: selection switch Payload then item -> amount > 0, default False
`);
    const checks = getActiveConditionPredicates(types.get('Event')!).map(
      ({ predicate }) => new Function('data', `${RUNTIME_HELPER_JS_SOURCE}\nreturn (${predicate});`)
    );
    for (const { input, wrapped } of mixedChoiceCases) {
      expect(checks.map((check) => check({ selection: input }))).toEqual([!!wrapped.value, !!wrapped.value]);
    }
    expect(
      checks.map((check) => check({ selection: { raw: { payload: { value: 'negative', amount: -1 } } } }))
    ).toEqual([false, false]);
  });

  it('returns an empty array for a type with no conditions', async () => {
    const dataByName = await parseSingleNamespaceDataByName(`
namespace test.conditions
version "0.0.0"

type Plain:
  name string (1..1)
`);
    const data = dataByName.get('Plain')!;
    expect(getActiveConditionPredicates(data)).toEqual([]);
  });
});
