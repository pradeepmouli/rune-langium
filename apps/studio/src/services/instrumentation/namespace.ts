// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * A small, fixed set of app subsystems — the gate for Toast/Activity
 * visibility (see docs/superpowers/specs/
 * 2026-08-02-instrumentation-multi-sink-design.md). Deliberately NOT the
 * Rune DSL "namespace" concept (user/model-defined strings like
 * cdm.base.staticdata.party) — same word, different, much narrower thing.
 */
export type InstrumentationNamespace =
  | 'codegen' // codegen-service.ts, codegen-worker.ts, download/export flows
  | 'lsp' // lsp-client.ts, lsp-session.ts, lsp-auth.ts, transport-provider.ts
  | 'workspace' // workspace.ts, persistence.ts, folder-backing.ts, model-loader/cache/registry
  | 'git' // git-backing.ts, git-sync.ts, github-auth.ts
  | 'form-preview' // preview-validator.ts, FormPreviewPanel, codegen-forms/*
  | 'curated' // curated-fetch.ts, curated-closure.ts (curated-bundle hydration)
  | 'instrumentation'; // the telemetry system's own self-diagnostics (rare)
