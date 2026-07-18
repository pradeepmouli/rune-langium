// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Page } from '@playwright/test';
import { BUILTIN_TYPES } from '@rune-langium/visual-editor';

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

// Playwright's page.evaluate callback type-checks against the DOM lib's own
// Window type, which doesn't see apps/studio/src's `declare global`
// augmentation (type-graph-window-bridge.ts) — re-declared locally so this
// module type-checks standalone, same pattern as fixtures.ts's OpLogEntry
// bridge declaration.
declare global {
  interface Window {
    __runeStudioTypeGraph?: { snapshot(): Array<{ id: string; data: unknown }> };
  }
}

const BUILTIN_TYPE_SET: ReadonlySet<string> = new Set(BUILTIN_TYPES);

/**
 * Extracts a node's outgoing type references from its raw domain payload.
 *
 * Verified directly against the generated AST this session (NOT trusted
 * from the plan's own skeleton, which assumed `Choice.options`):
 *   - `Data#attributes: Attribute[]` (packages/visual-editor/src/components/
 *     editors/AttributeRow.tsx's doc comment: canonical path
 *     `attributes[].typeCall.type.$refText`)
 *   - `Choice#attributes: ChoiceOption[]` — Choice's member field is ALSO
 *     named `attributes`, not `options` (packages/core/src/generated/ast.ts;
 *     confirmed by packages/codegen/src/preview-schema.ts's own
 *     `choice.attributes.map(...)` usage). `ChoiceOption` carries the same
 *     `typeCall.type.$refText` shape as `Attribute`.
 *   - `RosettaEnumeration` has no outgoing type refs — just `enumValues`
 *     (RosettaEnumValue[], no typeCall) — returns [] for any other $type.
 *
 * `$type` values are the AST discriminators themselves ('Data' | 'Choice' |
 * 'RosettaEnumeration' | ...), not the lowercase React-Flow node-kind
 * strings (model-helpers.ts's resolveNodeKind maps between the two).
 */
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
 * Walks the transitive attribute-type closure from `rootFqn`, driving the
 * real explorer UI (namespace-search + `ns-type-nav-<fqn>` click) rather
 * than reading the bridge alone — this is what actually triggers on-demand
 * hydration for a never-visited curated namespace (J04b's regression
 * pattern), and it's the mechanism the plan calls for the closure walk to
 * exercise.
 *
 * IMPORTANT deviation from the plan's original skeleton: a member's
 * `typeCall.type.$refText` is the type name AS WRITTEN IN SOURCE, which for
 * both same-namespace and import-qualified cross-namespace references is
 * just the bare/short type name (confirmed against a real cross-namespace
 * fixture, packages/codegen/test/fixtures/choice-typed-attribute-crossns/
 * holder.rune: `asset Asset (0..1)` refers to `Asset` via `import
 * test.ctaxns.base.*`, no namespace prefix). It is NOT a fully-qualified
 * id, so it can't be used directly to build a `ns-type-nav-<fqn>` testid or
 * as a `visited` cycle-guard key. Each queued ref is resolved to a real
 * fully-qualified id via the namespace-search UI's own corpus-wide
 * short-name filtering (which the real app already relies on to resolve a
 * type name to a node — see TypeLink.tsx's `resolveNodeId`, whose
 * exact-match-then-last-segment-match precedence this mirrors), BEFORE it's
 * treated as visited/mapped/unmapped. A ref that resolves to nothing is
 * genuinely unmapped, not merely not-yet-hydrated — the namespace search
 * surfaces every type in the corpus, hydrated or not (proven by J04b: it
 * locates a never-visited curated namespace with no prior navigation).
 */
export async function walkTypeClosure(
  page: Page,
  rootFqn: string,
  namespaceSearchTestId: string
): Promise<TypeClosureResult> {
  const visited = new Set<string>(); // resolved fully-qualified ids only — this is what VISITED_CAP counts
  const attemptedRefs = new Set<string>(); // raw refTexts already queued, resolved or not — de-dupes requeue churn
  const mapped: string[] = [];
  const unmapped: string[] = [];
  let hydrationsTriggered = 0;
  let truncated = false;
  const queue: string[] = [rootFqn];
  attemptedRefs.add(rootFqn);

  const searchBox = page.getByTestId(namespaceSearchTestId);
  const navRows = page.locator(`[data-testid^="${NAV_TESTID_PREFIX}"]`);

  while (queue.length > 0) {
    const ref = queue.shift()!;
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
      .waitForFunction(
        ({ prefix, name }) => {
          const els = Array.from(document.querySelectorAll(`[data-testid^="${prefix}"]`));
          return els.some((el) => el.getAttribute('data-testid')?.endsWith(`.${name}`));
        },
        { prefix: NAV_TESTID_PREFIX, name: shortName },
        { timeout: 10000 }
      )
      .catch(() => {
        /* zero matches is a legitimate outcome — falls through to unmapped below */
      });
    const candidateTestIds = await navRows.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''));

    const resolvedFqn =
      candidateTestIds.find((id) => id === `${NAV_TESTID_PREFIX}${ref}`)?.slice(NAV_TESTID_PREFIX.length) ??
      candidateTestIds.find((id) => id.endsWith(`.${shortName}`))?.slice(NAV_TESTID_PREFIX.length);

    if (!resolvedFqn) {
      unmapped.push(ref);
      continue;
    }
    if (visited.has(resolvedFqn)) continue;
    visited.add(resolvedFqn);

    await page.getByTestId(`${NAV_TESTID_PREFIX}${resolvedFqn}`).click();
    hydrationsTriggered++;
    // Matches J04a/J04b's own proven post-nav wait — confirms selection (and
    // for a never-hydrated curated namespace, hydration) has landed before
    // reading the bridge snapshot.
    await page
      .getByText(resolvedFqn, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        /* best-effort — fall through to the snapshot check below regardless */
      });

    const snapshot = await page.evaluate(() => window.__runeStudioTypeGraph?.snapshot() ?? []);
    const node = snapshot.find((n) => n.id === resolvedFqn);
    if (!node) {
      unmapped.push(resolvedFqn);
      continue;
    }
    mapped.push(resolvedFqn);

    for (const refText of extractTypeRefs(node.data)) {
      if (BUILTIN_TYPE_SET.has(refText)) continue;
      if (attemptedRefs.has(refText)) continue;
      attemptedRefs.add(refText);
      queue.push(refText);
    }
  }

  return { rootFqn, visited: [...visited], mapped, unmapped, hydrationsTriggered, truncated };
}
