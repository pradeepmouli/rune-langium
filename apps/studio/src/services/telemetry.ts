// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Anonymised telemetry client. Wire format: contracts/telemetry-event.md.
 *
 * Privacy invariants enforced here:
 *  - Disabled when running against localhost (dev or e2e).
 *  - Disabled when the user has set telemetry-enabled=false.
 *  - Schema is a closed discriminated union — anything that doesn't fit
 *    is rejected with a thrown error before any fetch is made.
 *  - Fetch failures are swallowed; telemetry MUST NEVER block the user.
 */

import { z } from 'zod';
import { CuratedModelIdSchema, ErrorCategorySchema } from '@rune-langium/curated-schema';

const TelemetryEventSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('curated_load_attempt'),
      modelId: CuratedModelIdSchema
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_success'),
      modelId: CuratedModelIdSchema,
      durationMs: z.number().int().nonnegative().max(600_000)
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_failure'),
      modelId: CuratedModelIdSchema,
      errorCategory: ErrorCategorySchema
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
        // Fail silent. Telemetry MUST NEVER block or fail the host action.
      }
    }
  };
}

/**
 * Production endpoint for the telemetry Worker. Routed at the edge by
 * `apps/telemetry-worker/wrangler.toml` to the same-origin path under
 * www.daikonic.dev, so a same-origin POST does not require a preflight.
 */
export const TELEMETRY_ENDPOINT_PROD =
  'https://www.daikonic.dev/rune-studio/api/telemetry/v1/event';

/**
 * Resolve the right endpoint for the current host. In development (vite
 * dev server, e2e fixtures, file://) this returns `localhost`, which the
 * client treats as a no-op so dev runs never hit the production worker.
 */
export function resolveTelemetryEndpoint(origin?: string): string {
  const o = origin ?? (typeof location !== 'undefined' ? location.origin : '');
  try {
    const u = new URL(o);
    // `file:` URLs have origin "null" (the string), so naïvely returning
    // `${u.origin}/...` produces `null/rune-studio/...`, which would parse
    // but never resolve. Map both file: and localhost to a known-localhost
    // URL — the client's no-op gate (isLocalhost / `enabled === false`)
    // short-circuits before any fetch is issued.
    if (u.protocol === 'file:') {
      return 'http://localhost/rune-studio/api/telemetry/v1/event';
    }
    if (LOCALHOST_HOSTS.has(u.hostname)) {
      return `${u.origin}/rune-studio/api/telemetry/v1/event`;
    }
  } catch {
    // fall through to prod
  }
  return TELEMETRY_ENDPOINT_PROD;
}
