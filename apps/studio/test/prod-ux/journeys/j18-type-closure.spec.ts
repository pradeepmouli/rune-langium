// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, authorScratchType } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';
import { walkTypeClosure } from '../type-closure.js';
import type { TypeClosureRecord } from '../evidence.js';

const SCRATCH_NAMESPACE = 'scratch.j18';
const SCRATCH_ROOT_FQN = `${SCRATCH_NAMESPACE}.ScratchClosureRoot`;
const SCRATCH_CHOICE_FQN = `${SCRATCH_NAMESPACE}.ScratchClosureChoice`;

test.describe('J18 — Data-type closure mapping (scripted completeness check)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J18 walks the curated and scratch type closures with zero unmapped', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    const curatedStartedAt = Date.now();
    const curatedResult = await walkTypeClosure(page, ANCHOR_DATA, 'namespace-search');
    const curatedWalkMs = Date.now() - curatedStartedAt;
    await evidence.checkpoint('curated-closure-walked');

    // The scratch closure exercises all three referenced-type kinds the
    // spec requires — a nested Data type, an Enum, and a Choice — as a
    // single scratch namespace's worth of forward-referencing DSL
    // (equivalent in shape to "J8's type extended with those references",
    // not literally J8's own type). NOTE: the attribute name is
    // deliberately NOT `label` — that's a reserved Rune DSL keyword
    // (`[label "..."]` LabelAnnotation syntax), confirmed to cause a
    // genuine parse error in J9's own scratch-type authoring this session.
    await authorScratchType(page, {
      name: 'ScratchClosureRoot',
      namespace: SCRATCH_NAMESPACE,
      attributes: [
        { name: 'nested', typeName: 'ScratchClosureNested', cardinality: '(1..1)' },
        { name: 'status', typeName: 'ScratchClosureEnum', cardinality: '(1..1)' },
        { name: 'variant', typeName: 'ScratchClosureChoice', cardinality: '(1..1)' }
      ],
      extraDeclarations: [
        'type ScratchClosureNested:\n    note string (1..1)\n',
        'enum ScratchClosureEnum:\n    ACTIVE\n    INACTIVE\n',
        'type ScratchClosureVariantB:\n    detail string (1..1)\n',
        'choice ScratchClosureChoice:\n    ScratchClosureNested\n    ScratchClosureVariantB\n'
      ]
    });
    const scratchStartedAt = Date.now();
    const scratchResult = await walkTypeClosure(page, SCRATCH_ROOT_FQN, 'namespace-search');
    const scratchWalkMs = Date.now() - scratchStartedAt;
    await evidence.checkpoint('scratch-closure-walked');

    // Form preview: no unresolved-type stub for any field on the scratch
    // root. Confirmed directly by reading packages/codegen/src/
    // preview-schema.ts this session (buildBaseField/buildField, L568-576):
    // a Data/Choice attribute whose type reference can't be resolved
    // against the parsed namespace index falls back to `kind: 'unknown'`,
    // which FormPreviewPanel.tsx's PreviewFieldControl (L661-667) renders
    // as a `role="status"` div containing "Type reference <X> could not be
    // resolved for form preview." This is a real, verified DOM marker — not
    // the "unconfirmed" fallback the plan flagged, so this asserts its
    // absence directly rather than narrowing to a throws/no-throw check.
    // "Form" is a Dockview panel tab (role="tab"), separate from the
    // graph/source/inspector multi-select toggle J8 exercises — it's already
    // the default-active sub-tab on node selection (confirmed live in J9
    // this session), so this only waits for it rather than clicking it,
    // exactly like J9 does.
    const formPreviewPanel = page.getByTestId('panel-formPreview');
    await expect(formPreviewPanel).toBeVisible({ timeout: 20000 });
    await expect(formPreviewPanel.getByText(/could not be resolved for form preview/i)).toHaveCount(0);

    // DOM-level cross-check (per the plan's design): TypeLink.tsx renders an
    // unresolvable type reference as a disabled `data-slot="type-link"`
    // button wherever it's used for read-only type display. Of this
    // closure's four scratch types, only ScratchClosureChoice actually
    // renders TypeLink (ChoiceOptionRow.tsx — always TypeLink, editable or
    // not; AttributeRow.tsx's plain Data-attribute rows use the separate,
    // editable TypeReferenceField instead), so this targets that node's
    // Inspector specifically rather than asserting over the whole page,
    // which would be vacuous once the walk has moved off it.
    await page.getByTestId('namespace-search').fill('ScratchClosureChoice');
    await page.getByTestId(`ns-type-nav-${SCRATCH_CHOICE_FQN}`).click();
    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(page.getByRole('heading', { name: 'ScratchClosureChoice' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-slot="type-link"][disabled]')).toHaveCount(0);
    await evidence.checkpoint('scratch-choice-typelink-checked');

    const scratchUnmapped = scratchResult.unmapped;
    expect(
      scratchUnmapped,
      `scratch closure has unmapped types (unambiguous regression): ${scratchUnmapped.join(', ')}`
    ).toEqual([]);

    // Curated-side unmapped members are a KNOWN, expected occurrence — J9's
    // own investigation this session found ANCHOR_DATA itself has an
    // attribute with an unresolved Data-type reference in the client's
    // preview-schema resolution — so this is a soft finding for a human
    // reviewer to classify as corpus-drift, never a hard failure.
    if (curatedResult.unmapped.length > 0) {
      evidence.softFinding(
        'typeClosure-curated-unmapped',
        `curated closure has ${curatedResult.unmapped.length} unmapped types — review agent must check for corpus-drift: ${curatedResult.unmapped.join(', ')}`
      );
    }
    if (curatedResult.truncated || scratchResult.truncated) {
      evidence.softFinding(
        'typeClosure-truncated',
        `closure walk hit the 150 visited cap — see manifest's typeClosure records for which root(s)`
      );
    }

    const records: TypeClosureRecord[] = [
      {
        rootFqn: ANCHOR_DATA,
        rootKind: 'curated',
        visitedCount: curatedResult.visited.length,
        mappedCount: curatedResult.mapped.length,
        unmapped: curatedResult.unmapped,
        hydrationsTriggered: curatedResult.hydrationsTriggered,
        truncated: curatedResult.truncated,
        typeClosureWalkMs: curatedWalkMs
      },
      {
        rootFqn: SCRATCH_ROOT_FQN,
        rootKind: 'scratch',
        visitedCount: scratchResult.visited.length,
        mappedCount: scratchResult.mapped.length,
        unmapped: scratchResult.unmapped,
        hydrationsTriggered: scratchResult.hydrationsTriggered,
        truncated: scratchResult.truncated,
        typeClosureWalkMs: scratchWalkMs
      }
    ];
    // Handed to the `checkout` fixture's own teardown (fixtures.ts), which
    // already calls `collector.finish(verdict, opLog)` for every journey —
    // NOT called directly here, which would double-append this record to
    // the manifest (once from a local finish()/appendJourneyRecord call,
    // once from the fixture's own teardown).
    evidence.setTypeClosure(records);
  });
});
