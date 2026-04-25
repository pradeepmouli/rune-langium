// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Anonymised telemetry client. Feature 012-studio-workspace-ux, T021.
 * Wire format: contracts/telemetry-event.md.
 *
 * Privacy invariants enforced here:
 *  - Disabled when running against localhost (dev or e2e).
 *  - Disabled when the user has set telemetry-enabled=false.
 *  - Schema is a closed discriminated union — anything that doesn't fit
 *    is rejected with a thrown error before any fetch is made.
 *  - Fetch failures are swallowed; telemetry MUST NEVER block the user.
 */

import { z } from 'zod';

const ErrorCategoryEnum = z.enum([
  'network',
  'archive_not_found',
  'archive_decode',
  'parse',
  'storage_quota',
  'permission_denied',
  'unknown'
]);
const ModelIdEnum = z.enum(['cdm', 'fpml', 'rune-dsl']);

const TelemetryEventSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('curated_load_attempt'),
      modelId: ModelIdEnum
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_success'),
      modelId: ModelIdEnum,
      durationMs: z.number().int().nonnegative().max(600_000)
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_failure'),
      modelId: ModelIdEnum,
      errorCategory: ErrorCategoryEnum
    })
    .strict(),
  z
    .object({
      event: z.enum([
        'workspace_open_success',
        'workspace_open_failure',
        'workspace_restore_success',
        'workspace_restore_failure'
      ])
    })
    .strict()
]);

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export interface TelemetryClientOptions {
  endpoint: string;
  enabled: boolean;
  studioVersion: string;
  uaClass: string;
}

export interface TelemetryClient {
  emit(event: TelemetryEvent): Promise<void>;
}

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function isLocalhost(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return LOCALHOST_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function createTelemetryClient(options: TelemetryClientOptions): TelemetryClient {
  const localNoOp = isLocalhost(options.endpoint);
  return {
    async emit(event: TelemetryEvent): Promise<void> {
      // Validate FIRST so caller mistakes show up in dev. The validation
      // throws — that's intentional; tests assert on it.
      const parsed = TelemetryEventSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(`telemetry: schema violation — ${parsed.error.message}`);
      }
      // Now apply opt-out / dev-mode gates.
      if (!options.enabled || localNoOp) return;

      const payload = {
        ...parsed.data,
        studio_version: options.studioVersion,
        ua_class: options.uaClass
      };
      try {
        await fetch(options.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          // Telemetry must never affect the page's session cookies.
          credentials: 'omit',
          // Best-effort; don't keep the page alive waiting on this.
          keepalive: true
        });
      } catch {
        // Fail silent. Telemetry MUST NOT block the user (FR-T03 spirit).
      }
    }
  };
}
