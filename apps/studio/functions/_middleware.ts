// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pages Functions middleware. Currently a no-op pass-through;
 * placeholder so the functions/ directory is non-empty and version-controlled.
 *
 * Add cross-cutting concerns (error envelopes, request logging) here as needed.
 */

export const onRequest: PagesFunction = ({ next }) => next();
