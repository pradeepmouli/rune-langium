// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, ConsoleMessage, Request } from '@playwright/test';

export interface Checkpoint {
  name: string;
  screenshot: string;
  tMs: number;
}

export interface SoftFinding {
  ledgerId: string;
  detail: string;
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
  /**
   * Earlier, superseded attempt(s) for this same journey id (e.g. a FAIL that
   * was then retried and passed). Never silently discarded — see
   * appendJourneyRecord.
   */
  previousAttempts?: JourneyRecord[];
}

const REPORT_DIR = path.join(process.cwd(), 'test/prod-ux/report');

export class EvidenceCollector {
  private readonly startedAt: number;
  private readonly consoleErrors: string[] = [];
  private readonly failedRequests: string[] = [];
  private readonly checkpoints: Checkpoint[] = [];
  private readonly softFindings: SoftFinding[] = [];
  private seq = 0;

  constructor(
    private readonly page: Page,
    private readonly journeyId: string,
    private readonly title: string
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
  }

  async checkpoint(name: string): Promise<void> {
    this.seq += 1;
    const dir = path.join(REPORT_DIR, 'screenshots', this.journeyId);
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

  async finish(verdict: JourneyRecord['verdict'], retry = 0): Promise<JourneyRecord> {
    return {
      id: this.journeyId,
      title: this.title,
      verdict,
      durationMs: Date.now() - this.startedAt,
      checkpoints: this.checkpoints,
      consoleErrors: this.consoleErrors,
      failedRequests: this.failedRequests,
      softFindings: this.softFindings,
      retry
    };
  }
}

/** Strips previousAttempts so a superseded record doesn't nest its own history. */
function withoutPreviousAttempts(record: JourneyRecord): JourneyRecord {
  const { previousAttempts: _previousAttempts, ...rest } = record;
  return rest;
}

// This suite runs single-worker/non-parallel (see playwright.prod.config.ts),
// so a simple module-scope flag is enough to detect "first call this
// process" without globalSetup or file-locking. On the first call, any
// manifest left on disk from an earlier `playwright test` invocation is
// discarded rather than merged into, so stale journey records never mix in
// with the current run's fresh runId. Every subsequent call within the same
// process merges as before, which is what lets multiple journeys in one run
// accumulate into a single manifest.
let hasResetManifestThisProcess = false;

export async function appendJourneyRecord(record: JourneyRecord): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  const manifestPath = path.join(REPORT_DIR, 'run-manifest.json');
  let manifest: { runId: string; journeys: JourneyRecord[] };
  if (!hasResetManifestThisProcess) {
    hasResetManifestThisProcess = true;
    manifest = { runId: `prod-ux-${new Date().toISOString()}`, journeys: [] };
  } else {
    try {
      const raw = await import('node:fs/promises').then((fs) => fs.readFile(manifestPath, 'utf-8'));
      manifest = JSON.parse(raw);
    } catch {
      manifest = { runId: `prod-ux-${new Date().toISOString()}`, journeys: [] };
    }
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
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
