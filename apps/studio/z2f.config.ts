// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * zod-to-form Vite plugin configuration (auto-discovered from the Vite root).
 *
 * NOTE: @zod-to-form/core is NOT a direct dependency of @rune-langium/studio —
 * it's a transitive dep of @zod-to-form/vite. The plugin's ssrLoadModule cannot
 * resolve it from apps/studio/. For that reason the actual config is passed
 * inline via `configOverride` in vite.config.ts, and this file serves only
 * as documentation of the intended shape.
 *
 * This file MUST NOT import from @zod-to-form/core.
 *
 * Effective config (set via vite.config.ts configOverride):
 *   components.source  : './src/codegen-forms/z2f-components'
 *   components.preset  : 'shadcn'
 *   defaults.mode      : 'auto-save'
 *   defaults.ui        : 'shadcn'
 */

// Plain object — no import from @zod-to-form/core needed.
export default {
  components: {
    source: './src/codegen-forms/z2f-components',
    preset: 'shadcn'
  },
  defaults: {
    mode: 'auto-save',
    ui: 'shadcn'
  }
};
