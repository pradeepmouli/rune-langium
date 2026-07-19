// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, ConsoleMessage, Request, Response } from '@playwright/test';
import type { OpLogEntry } from '../../src/services/op-log.js';
import { buildTimingsRollup, type TimingRecord } from './timings.js';

export interface Checkpoint {
  name: string;
  screenshot: string;
  tMs: number;
}

export interface SoftFinding {
  ledgerId: string;
  detail: string;
}

/** One root's closure-walk result, as recorded into the manifest by J18. */
export interface TypeClosureRecord {
  rootFqn: string;
  rootKind: 'curated' | 'scratch';
  visitedCount: number;
  mappedCount: number;
  unmapped: string[];
  hydrationsTriggered: number;
  truncated: boolean;
  typeClosureWalkMs: number;
}

export interface JourneyRecord {
  id: string;
  title: string;
  verdict: 'PASS' | 'DEGRADED' | 'FAIL' | 'BLOCKED';
  durationMs: number;
  checkpoints: Checkpoint[];
  consoleErrors: string[];
  failedRequests: string[];
  softFindings: SoftFinding[];
  /** Playwright TestInfo.retry — 0 on the first attempt, 1+ on a retry. */
  retry: number;
  /** window.__runeStudioOpLog snapshot captured at journey teardown. */
  opLog: OpLogEntry[];
  /**
   * Earlier, superseded attempt(s) for this same journey id (e.g. a FAIL that
   * was then retried and passed). Never silently discarded — see
   * appendJourneyRecord.
   */
  previousAttempts?: JourneyRecord[];
  /** Populated only by J18 (data-type closure mapping) — one entry per walked root. */
  typeClosure?: TypeClosureRecord[];
}

/** Exported so test suites (e.g. fixtures.test.ts) can back up/restore the on-disk manifest around their own writes. */
export const REPORT_DIR = path.join(process.cwd(), 'test/prod-ux/report');

export class EvidenceCollector {
  private readonly startedAt: number;
  private readonly consoleErrors: string[] = [];
  private readonly failedRequests: string[] = [];
  private readonly checkpoints: Checkpoint[] = [];
  private readonly softFindings: SoftFinding[] = [];
  private typeClosureRecords: TypeClosureRecord[] = [];
  private seq = 0;

  constructor(
    private readonly page: Page,
    private readonly journeyId: string,
    private readonly title: string,
    /** Playwright TestInfo.retry — 0 on the first attempt, 1+ on a retry. */
    private readonly retry = 0
  ) {
    this.startedAt = Date.now();
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        this.consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err: Error) => {
      this.consoleErrors.push(`[pageerror] ${err.message}`);
    });
    page.on('requestfailed', (req: Request) => {
      this.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
    });
    // requestfailed only fires for network-level failures (DNS, connection
    // refused, aborted) — a first-party request that COMPLETES with a 4xx/5xx
    // status (e.g. a Worker returning 500) never fires it. Catch those here.
    page.on('response', (response: Response) => {
      const status = response.status();
      if (status < 400) return;
      let sameOrigin = false;
      try {
        sameOrigin = new URL(response.url()).origin === new URL(this.page.url()).origin;
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin) return;
      this.failedRequests.push(`${response.request().method()} ${response.url()} — HTTP ${status}`);
    });
  }

  async checkpoint(name: string): Promise<void> {
    this.seq += 1;
    const dir = path.join(REPORT_DIR, 'screenshots', this.journeyId, `attempt${this.retry}`);
    await mkdir(dir, { recursive: true });
    const fileName = `${String(this.seq).padStart(2, '0')}-${name}.png`;
    const screenshotPath = path.join(dir, fileName);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.checkpoints.push({
      name,
      screenshot: path.relative(REPORT_DIR, screenshotPath),
      tMs: Date.now() - this.startedAt
    });
  }

  softFinding(ledgerId: string, detail: string): void {
    this.softFindings.push({ ledgerId, detail });
  }

  /**
   * Records J18's per-root closure-walk results for inclusion in the next
   * `finish()` call. A setter rather than a `finish()` parameter — the
   * generic `checkout` fixture teardown in fixtures.ts always calls
   * `collector.finish(verdict, opLog)` with no knowledge of `typeClosure`
   * (a J18-specific field); routing it through mutable state here means
   * that teardown call picks it up automatically, with no risk of the
   * double-manifest-append a J18-local `finish()`/`appendJourneyRecord`
   * call would otherwise create.
   */
  setTypeClosure(records: TypeClosureRecord[]): void {
    this.typeClosureRecords = records;
  }

  /** True once at least one soft finding has been recorded — used by the
   *  fixture teardown to downgrade an otherwise-clean PASS to DEGRADED. */
  get hasSoftFindings(): boolean {
    return this.softFindings.length > 0;
  }

  async finish(verdict: JourneyRecord['verdict'], opLog: OpLogEntry[] = []): Promise<JourneyRecord> {
    return {
      id: this.journeyId,
      title: this.title,
      verdict,
      durationMs: Date.now() - this.startedAt,
      checkpoints: this.checkpoints,
      consoleErrors: this.consoleErrors,
      failedRequests: this.failedRequests,
      softFindings: this.softFindings,
      retry: this.retry,
      opLog,
      typeClosure: this.typeClosureRecords.length > 0 ? this.typeClosureRecords : undefined
    };
  }
}

/** Strips previousAttempts so a superseded record doesn't nest its own history. */
function withoutPreviousAttempts(record: JourneyRecord): JourneyRecord {
  const { previousAttempts: _previousAttempts, ...rest } = record;
  return rest;
}

// The manifest is reset exactly once per `playwright test` invocation by
// global-setup.ts, which runs once in the main orchestrator process before
// any worker starts and is NOT re-run for retries. Worker processes, by
// contrast, restart on every retry (even with workers: 1), so a module-scope
// flag here cannot reliably detect "first call this run" — that's why the
// reset responsibility lives in global-setup.ts instead of this module. By
// the time this function runs, the manifest on disk (if any) always belongs
// to the current run, so we simply read-and-merge, falling back to a fresh
// manifest if it's absent or unparseable.

export interface RunManifest {
  runId: string;
  journeys: JourneyRecord[];
  timings: TimingRecord[];
}

export async function appendJourneyRecord(record: JourneyRecord): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  const manifestPath = path.join(REPORT_DIR, 'run-manifest.json');
  let manifest: RunManifest;
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    manifest = { runId: `prod-ux-${new Date().toISOString()}`, journeys: [], timings: [] };
  }

  // A retry that supersedes a prior attempt for the same journey id must not
  // silently delete that prior attempt's evidence (e.g. a FAIL-then-PASS
  // flake) — fold it (and anything it already carried) into previousAttempts
  // on the surviving record, keeping ONE manifest entry per journey id.
  const existing = manifest.journeys.find((j) => j.id === record.id);
  const finalRecord: JourneyRecord = existing
    ? {
        ...record,
        previousAttempts: [...(existing.previousAttempts ?? []), withoutPreviousAttempts(existing)]
      }
    : record;

  manifest.journeys = manifest.journeys.filter((j) => j.id !== record.id);
  manifest.journeys.push(finalRecord);
  manifest.timings = buildTimingsRollup(manifest.journeys);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
