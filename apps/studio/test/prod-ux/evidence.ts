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

  async finish(verdict: JourneyRecord['verdict']): Promise<JourneyRecord> {
    return {
      id: this.journeyId,
      title: this.title,
      verdict,
      durationMs: Date.now() - this.startedAt,
      checkpoints: this.checkpoints,
      consoleErrors: this.consoleErrors,
      failedRequests: this.failedRequests,
      softFindings: this.softFindings
    };
  }
}

export async function appendJourneyRecord(record: JourneyRecord): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  const manifestPath = path.join(REPORT_DIR, 'run-manifest.json');
  let manifest: { runId: string; journeys: JourneyRecord[] };
  try {
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(manifestPath, 'utf-8'));
    manifest = JSON.parse(raw);
  } catch {
    manifest = { runId: `prod-ux-${new Date().toISOString()}`, journeys: [] };
  }
  manifest.journeys = manifest.journeys.filter((j) => j.id !== record.id);
  manifest.journeys.push(record);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
