// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Corpus-stable type/namespace anchors, shared across prod-ux journeys.
 * Each anchor records WHY it's expected to survive curated corpus rebuilds.
 * If a journey fails because one of these no longer exists in the live
 * curated manifest, the harness itself only surfaces a plain FAIL (see
 * fixtures.ts) — it does not distinguish corpus-drift from a regression.
 * It's the reviewing agent's job (per .agents/skills/prod-ux-review/SKILL.md)
 * to recognize this pattern and classify it as corpus-drift rather than a
 * code regression; see
 * docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md §3.
 */

/**
 * Anchors must be corpus-stable: BusinessCenterEnum was migrated upstream to
 * the codelist pattern (cdm.base.staticdata.codelist.BusinessCenter) in the
 * 2026-07-02 curated build. Both anchors below match the single 'Business'
 * search and live in cdm.base.datetime.
 */
export const ANCHOR_ENUM = 'cdm.base.datetime.BusinessDayConventionEnum';

/**
 * cdm.base.datetime — same rebuild, unaffected by the BusinessCenterEnum migration.
 * Matches the single 'Business' search with ANCHOR_ENUM.
 */
export const ANCHOR_DATA = 'cdm.base.datetime.BusinessCenters';

/**
 * Regression: cdm.base.staticdata.party is never pre-hydrated at load time.
 * First navigation to it must populate Inspector members (resolveNodeFileRef fix, commit f6a64029).
 * The canonical never-hydrated-on-first-nav anchor.
 */
export const ANCHOR_NEVER_HYDRATED_DATA = 'cdm.base.staticdata.party.Counterparty';
