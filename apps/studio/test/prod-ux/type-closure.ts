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
 * Resolves a queued bare/short type ref to a real fully-qualified testid,
 * given the set of currently-rendered `ns-type-nav-<fqn>` candidate testids.
 *
 * Precedence (mirrors the same one heuristic the REAL production resolver
 * commits to — `packages/visual-editor/src/adapters/ast-to-model.ts`'s edge
 * construction, documented in
 * `docs/superpowers/specs/2026-06-18-domain-substrate-phase4-domain-repository-design.md`'s
 * "Cross-namespace bare refs (explicit scope boundary)" section — NOT a
 * fuller reimplementation of it):
 *
 *   1. Exact match on the raw `ref` itself against a full testid. In
 *      practice this only ever fires for the root, which callers pass in as
 *      an already-fully-qualified id.
 *   2. Same-namespace-qualify: try `${sourceNamespace}.${ref}` as an exact
 *      testid match, when `sourceNamespace` is known. This is the ONE
 *      heuristic production itself applies to a bare ref — qualify with the
 *      referencing node's own namespace first.
 *   3. Corpus-wide short-name fallback (`id.endsWith('.' + shortName)`) —
 *      kept for genuine cross-namespace imports. Per the design doc, this
 *      remains a pre-existing, accepted ambiguity in production too (it can
 *      match the wrong homonym); walking further to resolve real
 *      cross-namespace imports would require reimplementing Langium's scope
 *      provider, which is explicitly out of scope both here and in the
 *      cited design doc's own "Out of scope" section.
 *
 * Pure/no-DOM so it's unit-testable without mocking Playwright.
 */
export function resolveCandidateFqn(
  candidateTestIds: string[],
  ref: string,
  sourceNamespace: string | undefined,
  navTestIdPrefix: string
): string | undefined {
  const exact = candidateTestIds.find((id) => id === `${navTestIdPrefix}${ref}`);
  if (exact) return exact.slice(navTestIdPrefix.length);

  if (sourceNamespace) {
    const qualifiedTestId = `${navTestIdPrefix}${sourceNamespace}.${ref}`;
    const qualified = candidateTestIds.find((id) => id === qualifiedTestId);
    if (qualified) return qualified.slice(navTestIdPrefix.length);
  }

  const shortName = ref.split('.').pop()!;
  const shortMatch = candidateTestIds.find((id) => id.endsWith(`.${shortName}`));
  return shortMatch?.slice(navTestIdPrefix.length);
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
 * as a `visited` cycle-guard key.
 *
 * Each queued ref carries its SOURCE NAMESPACE (the namespace of the node
 * that referenced it, derived from that node's own resolved FQN) alongside
 * the bare ref text, and `attemptedRefsByNamespace` dedupes on the pair
 * (`sourceNamespace`, `ref`), not on the bare ref alone — two different
 * nodes in different namespaces referencing the same short type name (e.g.
 * both `Foo`) are each attempted and resolved independently, rather than
 * the second silently colliding with the first in a bare-refText Set.
 * Resolution of each (ref, sourceNamespace) pair to a real fully-qualified
 * id is delegated to `resolveCandidateFqn` above (same-namespace-qualify
 * first, corpus-wide shortname fallback second) BEFORE it's treated as
 * visited/mapped/unmapped. A ref that resolves to nothing is genuinely
 * unmapped, not merely not-yet-hydrated — the namespace search surfaces
 * every type in the corpus, hydrated or not (proven by J04b: it locates a
 * never-visited curated namespace with no prior navigation).
 *
 * Going further — walking `import` statements to fully resolve genuine
 * cross-namespace bare refs — is explicitly OUT OF SCOPE: it would require
 * reimplementing Langium's scope provider, which production itself does not
 * do at this seam either (see the cited design doc's "Out of scope"
 * section: "Cross-namespace bare-ref resolution beyond same-namespace
 * qualify (pre-existing ambiguity; not regressed)").
 */
export async function walkTypeClosure(
  page: Page,
  rootFqn: string,
  namespaceSearchTestId: string
): Promise<TypeClosureResult> {
  const visited = new Set<string>(); // resolved fully-qualified ids only — this is what VISITED_CAP counts
  // (sourceNamespace -> refTexts already queued from that namespace, resolved
  // or not) — de-dupes requeue churn WITHOUT collapsing two different nodes'
  // same-named-but-different-namespace refs into one attempt. Keyed by a Map
  // of Sets (not a composite string key) to sidestep the retired raw-id `::`
  // construction pattern (rune/no-raw-node-id) — this isn't a node id, but
  // the lint rule matches the syntax either way. See the
  // resolveCandidateFqn/walkTypeClosure doc comments above.
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

    const resolvedFqn = resolveCandidateFqn(candidateTestIds, ref, sourceNamespace, NAV_TESTID_PREFIX);

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
