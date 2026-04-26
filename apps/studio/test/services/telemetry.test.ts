// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T020 — telemetry client tests.
 * Asserts the wire shape, opt-out behaviour, and dev-mode no-op per
 * contracts/telemetry-event.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTelemetryClient,
  resolveTelemetryEndpoint,
  TELEMETRY_ENDPOINT_PROD,
  type TelemetryEvent
} from '../../src/services/telemetry.js';

const ENDPOINT = 'https://example.test/api/telemetry/v1/event';

describe('telemetry client (T020)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('posts a curated_load_attempt event with the documented envelope', async () => {
    const t = createTelemetryClient({
      endpoint: ENDPOINT,
      enabled: true,
      studioVersion: '0.1.0',
      uaClass: 'Chromium 130'
    });
    await t.emit({ event: 'curated_load_attempt', modelId: 'cdm' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(ENDPOINT);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse(((init as RequestInit).body as string) ?? '{}');
    expect(body).toMatchObject({
      event: 'curated_load_attempt',
      modelId: 'cdm',
      studio_version: '0.1.0',
      ua_class: 'Chromium 130'
    });
  });

  it('rejects an event that fails the schema (extra field)', async () => {
    const t = createTelemetryClient({
      endpoint: ENDPOINT,
      enabled: true,
      studioVersion: '0.1.0',
      uaClass: 'Chromium 130'
    });
    // @ts-expect-error — intentional extra field
    await expect(
      t.emit({ event: 'curated_load_attempt', modelId: 'cdm', userId: 'x' })
    ).rejects.toThrow(/schema/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when disabled', async () => {
    const t = createTelemetryClient({
      endpoint: ENDPOINT,
      enabled: false,
      studioVersion: '0.1.0',
      uaClass: 'Chromium 130'
    });
    await t.emit({ event: 'workspace_open_success' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when the endpoint hostname is localhost', async () => {
    const t = createTelemetryClient({
      endpoint: 'http://localhost:8080/v1/event',
      enabled: true,
      studioVersion: '0.1.0',
      uaClass: 'Chromium 130'
    });
    await t.emit({ event: 'workspace_open_success' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows a non-2xx response (telemetry MUST NOT block the user)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const t = createTelemetryClient({
      endpoint: ENDPOINT,
      enabled: true,
      studioVersion: '0.1.0',
      uaClass: 'Chromium 130'
    });
    await expect(t.emit({ event: 'workspace_open_success' })).resolves.toBeUndefined();
  });

  it('swallows a network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    const t = createTelemetryClient({
      endpoint: ENDPOINT,
      enabled: true,
      studioVersion: '0.1.0',
      uaClass: 'Chromium 130'
    });
    await expect(
      t.emit({ event: 'workspace_restore_failure' } satisfies TelemetryEvent)
    ).resolves.toBeUndefined();
  });
});

describe('resolveTelemetryEndpoint (T113)', () => {
  it('returns the production worker URL for the daikonic.dev origin', () => {
    expect(resolveTelemetryEndpoint('https://www.daikonic.dev')).toBe(TELEMETRY_ENDPOINT_PROD);
  });

  it('returns a localhost URL when origin is dev/localhost (no-op path)', () => {
    expect(resolveTelemetryEndpoint('http://localhost:5173')).toBe(
      'http://localhost:5173/rune-studio/api/telemetry/v1/event'
    );
    expect(resolveTelemetryEndpoint('http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/rune-studio/api/telemetry/v1/event'
    );
  });

  it('falls back to production for an unparseable origin', () => {
    expect(resolveTelemetryEndpoint('not a url')).toBe(TELEMETRY_ENDPOINT_PROD);
  });
});
