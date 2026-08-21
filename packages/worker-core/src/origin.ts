// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared origin-allowlist matching for rune-langium's plain Cloudflare
 * Workers (lsp-worker, telemetry-worker — see `@rune-langium/worker-core`'s
 * package description for the full fleet list).
 *
 * This restores and generalizes wildcard-origin support that briefly
 * existed only in the now-deleted `apps/studio/functions/lib/lsp-auth.ts`
 * Pages Function (spec 019, commit a82c184a, "wildcard origin matching for
 * CF Pages preview deploys"): when that Pages Function proxy layer was
 * removed in favor of routing straight to `apps/lsp-worker`, the wildcard
 * capability was dropped along with it rather than ported — this module is
 * that fix, done once, shared by every Worker instead of duplicated again.
 */

/**
 * Test whether `origin` is on the comma-separated allowlist.
 *
 * Match semantics:
 *  - `*`                        — allow any origin (escape hatch).
 *  - `https://example.com`      — exact match.
 *  - `https://*.example.com`    — single leading-wildcard for the subdomain
 *                                  label. Matches `https://a.example.com` and
 *                                  `https://b.c.example.com` but not the bare
 *                                  `https://example.com`.
 *
 * The wildcard form exists so Cloudflare Pages preview deployments
 * (subdomains like `https://<hash>.daikonic-dev.pages.dev`) can be granted
 * access via one allowlist entry, without updating the allowlist per preview
 * build.
 */
export function isOriginAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  if (allowed === '*') return true;
  return allowed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .some((pattern) => matchesOriginPattern(origin, pattern));
}

function matchesOriginPattern(origin: string, pattern: string): boolean {
  if (pattern === origin) return true;
  // Wildcard form: protocol + "*." + suffix. Compare suffix only.
  const wildcardPrefixMatch = pattern.match(/^([a-z]+:\/\/)\*\.(.+)$/);
  if (!wildcardPrefixMatch) return false;
  const [, scheme, suffix] = wildcardPrefixMatch;
  if (!origin.startsWith(scheme!)) return false;
  const host = origin.slice(scheme!.length);
  // Require an actual subdomain — `*.example.com` must NOT match `example.com`.
  return host.endsWith(`.${suffix}`) && host !== suffix;
}
