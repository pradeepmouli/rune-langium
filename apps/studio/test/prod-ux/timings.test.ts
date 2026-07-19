// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { buildTimingsRollup, exceedsBudget } from './timings.js';
import type { JourneyRecord } from './evidence.js';

function makeRecord(overrides: Partial<JourneyRecord> & Pick<JourneyRecord, 'id' | 'title'>): JourneyRecord {
  return {
    verdict: 'PASS',
    durationMs: 1000,
    checkpoints: [],
    consoleErrors: [],
    failedRequests: [],
    softFindings: [],
    retry: 0,
    opLog: [],
    ...overrides
  };
}

describe('buildTimingsRollup', () => {
  it('extracts one timing entry per budgeted op with a recorded duration', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J03',
        title: 'J03 — Curated CDM load',
        opLog: [
          {
            op: 'cdmLoad',
            subject: 'CDM',
            level: 'success',
            message: 'loaded',
            durationMs: 12000,
            ts: 0,
            panel: 'output'
          }
        ]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([{ op: 'cdmLoad', subject: 'CDM', ms: 12000, budgetMs: 45000 }]);
  });

  it('omits opLog entries whose op has no known budget', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J07',
        title: 'J07 — Source view',
        opLog: [{ op: 'lspConnect', level: 'success', message: 'connected', durationMs: 300, ts: 0, panel: 'output' }]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([]);
  });

  it('omits entries with no recorded durationMs', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J03',
        title: 'J03',
        opLog: [{ op: 'cdmLoad', subject: 'CDM', level: 'info', message: 'starting', ts: 0, panel: 'output' }]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([]);
  });

  it('collects one entry per subject for repeatable ops across journeys', () => {
    const journeys: JourneyRecord[] = [
      makeRecord({
        id: 'J09',
        title: 'J09',
        opLog: [
          {
            op: 'formRender',
            subject: 'curated:Party',
            level: 'success',
            message: 'rendered',
            durationMs: 800,
            ts: 0,
            panel: 'output'
          },
          {
            op: 'formRender',
            subject: 'scratch:Widget',
            level: 'success',
            message: 'rendered',
            durationMs: 600,
            ts: 0,
            panel: 'output'
          }
        ]
      })
    ];
    expect(buildTimingsRollup(journeys)).toEqual([
      { op: 'formRender', subject: 'curated:Party', ms: 800, budgetMs: 5000 },
      { op: 'formRender', subject: 'scratch:Widget', ms: 600, budgetMs: 5000 }
    ]);
  });
});

describe('exceedsBudget', () => {
  it('returns false when every op is within budget', () => {
    expect(exceedsBudget([{ op: 'cdmLoad', durationMs: 12000 }])).toBe(false);
  });

  it('returns true when any op exceeds its budget', () => {
    expect(exceedsBudget([{ op: 'cdmLoad', durationMs: 50000 }])).toBe(true);
  });

  it('ignores unbudgeted ops and entries with no durationMs', () => {
    expect(exceedsBudget([{ op: 'lspConnect', durationMs: 999999 }, { op: 'cdmLoad' }])).toBe(false);
  });
});
