// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared types for the codegen Worker (feature 011-export-code-cf).
 */

import type { DurableObjectNamespace, KVNamespace } from '@cloudflare/workers-types';

/**
 * Typed Container binding. The real runtime type is provided by CF; until
 * `@cloudflare/workers-types` ships `Container`, we model it as a `fetcher`.
 */
export interface ContainerBinding {
  fetch(request: Request): Promise<Response>;
}

/**
 * Environment bindings declared in apps/codegen-worker/wrangler.toml.
 */
export interface WorkerEnv {
  /** Codegen container binding — see T010 wrangler.toml [[containers]] block. */
  CODEGEN: ContainerBinding;
  /** Rate-limit DO namespace — T012 implements the `RateLimiter` class. */
  RATE_LIMITER: DurableObjectNamespace;
  /** KV for cached language list + short-lived Turnstile verify cache. */
  LANG_CACHE: KVNamespace;
  /** Turnstile secret (Worker secret, never shipped to browser). */
  TURNSTILE_SECRET: string;
  /** Turnstile public site key (mirrored in Studio build env for widget rendering). */
  TURNSTILE_SITE_KEY: string;
  /** HMAC key used to sign session cookies after successful Turnstile verify. */
  SESSION_SIGNING_KEY: string;
}
