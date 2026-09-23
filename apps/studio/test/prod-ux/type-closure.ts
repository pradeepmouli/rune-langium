// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { waitForHydratedNode } from './readiness.js';
import type { Page } from '@playwright/test';
import { BUILTIN_TYPES, isTypeNodeId, qualifiedNameFromNodeId } from '@rune-langium/visual-editor';

export interface TypeClosureResult {
  rootFqn: string;
  visited: string[];
  mapped: string[];
  unmapped: string[];
  hydrationsTriggered: number;
  truncated: boolean;
}

const VISITED_CAP = 150;
const NAV_TESTID_PREFIX = 'ns-type-nav-';

const BUILTIN_TYPE_SET: ReadonlySet<string> = new Set(BUILTIN_TYPES);

/** Data and Choice members use the same AST type-reference path. */
function extractTypeRefs(nodeData: unknown): string[] {
  const data = nodeData as {
    $type?: string;
    attributes?: Array<{ typeCall?: { type?: { $refText?: string } } }>;
  };
  if (data.$type !== 'Data' && data.$type !== 'Choice') return [];
  const refs: string[] = [];
  for (const member of data.attributes ?? []) {
    const refText = member.typeCall?.type?.$refText;
    if (refText) refs.push(refText);
  }
  return refs;
}

/**
 * Find a visible type declaration by full name, then same namespace, then short name.
 * The last fallback is ambiguous for cross-namespace homonyms, matching the
 * explorer's existing scope limit; function nodes are never candidates.
 */
export function resolveCandidateNodeId(
  candidateTestIds: string[],
  ref: string,
  sourceNamespace: string | undefined,
  navTestIdPrefix: string
): string | undefined {
  const candidates = candidateTestIds
    .filter((testId) => testId.startsWith(navTestIdPrefix))
    .map((testId) => testId.slice(navTestIdPrefix.length))
    .filter(isTypeNodeId);
  const exact = candidates.find((nodeId) => qualifiedNameFromNodeId(nodeId) === ref);
  if (exact) return exact;

  if (sourceNamespace) {
    const qualified = candidates.find((nodeId) => qualifiedNameFromNodeId(nodeId) === `${sourceNamespace}.${ref}`);
    if (qualified) return qualified;
  }

  const shortName = ref.split('.').pop()!;
  return candidates.find((nodeId) => qualifiedNameFromNodeId(nodeId).endsWith(`.${shortName}`));
}

/**
 * Walk attribute references through the explorer so each visit triggers the
 * same on-demand hydration as a user click. References are source spellings,
 * often short names; carry the source namespace until a graph node is found.
 */
export async function walkTypeClosure(
  page: Page,
  rootFqn: string,
  namespaceSearchTestId: string
): Promise<TypeClosureResult> {
  const visited = new Set<string>();
  // A short reference must be attempted separately in each source namespace.
  const attemptedRefsByNamespace = new Map<string, Set<string>>();
  const NO_NAMESPACE = ''; // stand-in map key for the root's undefined sourceNamespace
  const hasAttempted = (sourceNamespace: string | undefined, ref: string): boolean =>
    attemptedRefsByNamespace.get(sourceNamespace ?? NO_NAMESPACE)?.has(ref) ?? false;
  const markAttempted = (sourceNamespace: string | undefined, ref: string): void => {
    const key = sourceNamespace ?? NO_NAMESPACE;
    let refs = attemptedRefsByNamespace.get(key);
    if (!refs) {
      refs = new Set<string>();
      attemptedRefsByNamespace.set(key, refs);
    }
    refs.add(ref);
  };
  const mapped: string[] = [];
  const unmapped: string[] = [];
  let hydrationsTriggered = 0;
  let truncated = false;
  const queue: Array<{ ref: string; sourceNamespace: string | undefined }> = [
    { ref: rootFqn, sourceNamespace: undefined }
  ];
  markAttempted(undefined, rootFqn);

  const searchBox = page.getByTestId(namespaceSearchTestId);
  const navRows = page.locator(`[data-testid^="${NAV_TESTID_PREFIX}"]`);

  while (queue.length > 0) {
    const { ref, sourceNamespace } = queue.shift()!;
    if (visited.size >= VISITED_CAP) {
      truncated = true;
      console.warn(`[type-closure] VISITED_CAP (${VISITED_CAP}) hit walking from ${rootFqn}; truncating.`);
      break;
    }

    const shortName = ref.split('.').pop()!;
    await searchBox.fill(shortName);
    // The filtered result list renders asynchronously (debounced search +
    // virtualized list) — wait for a row matching the CURRENT shortName
    // specifically, not just "any row visible". A row left over from the
    // PREVIOUS iteration's search can still be visible when this check
    // starts (Playwright resolves an already-satisfied waitFor immediately),
    // which would let evaluateAll below read stale previous-query testids
    // and produce a false "unmapped" result for a type that's really mapped.
    await page
      .getByRole('button', { name: `Navigate to ${shortName}`, exact: true })
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {
        /* zero matches is a legitimate outcome — falls through to unmapped below */
      });
    const candidateTestIds = await navRows.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''));

    const resolvedNodeId = resolveCandidateNodeId(candidateTestIds, ref, sourceNamespace, NAV_TESTID_PREFIX);
    if (!resolvedNodeId) {
      unmapped.push(ref);
      continue;
    }
    const resolvedFqn = qualifiedNameFromNodeId(resolvedNodeId);
    if (visited.has(resolvedFqn)) continue;
    visited.add(resolvedFqn);

    await page.getByTestId(`${NAV_TESTID_PREFIX}${resolvedNodeId}`).click();
    hydrationsTriggered++;
    await waitForHydratedNode(page, resolvedNodeId);
    const snapshot = await page.evaluate(() => window.__runeStudioTypeGraph?.snapshot() ?? []);
    const node = snapshot.find((n) => n.id === resolvedNodeId);
    if (!node) {
      unmapped.push(resolvedFqn);
      continue;
    }
    mapped.push(resolvedFqn);

    // The namespace of the node we just resolved — every ref it declares is
    // qualified against THIS namespace first when it's later dequeued.
    const nodeNamespace = resolvedFqn.split('.').slice(0, -1).join('.');

    for (const refText of extractTypeRefs(node.data)) {
      if (BUILTIN_TYPE_SET.has(refText)) continue;
      if (hasAttempted(nodeNamespace, refText)) continue;
      markAttempted(nodeNamespace, refText);
      queue.push({ ref: refText, sourceNamespace: nodeNamespace });
    }
  }

  return { rootFqn, visited: [...visited], mapped, unmapped, hydrationsTriggered, truncated };
}
