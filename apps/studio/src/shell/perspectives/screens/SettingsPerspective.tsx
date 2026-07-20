// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { Checkbox } from '@rune-langium/design-system/ui/checkbox';
import { FontScaleButton } from '../../../components/FontScaleButton.js';
import { useTelemetrySettingsStore } from '../../../store/telemetry-settings.js';

/**
 * SettingsPerspective — per-machine studio settings scaffold.
 *
 * Sections:
 *  1. Appearance — font scale (FontScaleButton, self-contained). Theme is
 *     currently fixed at dark; no toggle is available.
 *  2. Privacy — anonymous diagnostics opt-in (telemetry).
 *  3. Project configuration — forward-looking placeholder describing the
 *     .runestudio/config.json feature (git-backed shared project config).
 *     Nothing here is persisted or functional yet.
 */
export function SettingsPerspective(): React.ReactElement {
  const telemetryEnabled = useTelemetrySettingsStore((s) => s.enabled);
  const setTelemetryEnabled = useTelemetrySettingsStore((s) => s.setEnabled);

  return (
    <section data-testid="settings-perspective" className="h-full overflow-auto p-6 space-y-8">
      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Appearance</h2>

        <div className="flex items-center gap-3">
          <span className="text-sm">Pane font size</span>
          <FontScaleButton />
        </div>

        <p className="text-xs text-muted-foreground">
          Theme is currently fixed (dark). A theme toggle will be added in a future release.
        </p>
      </section>

      {/* ── Privacy ─────────────────────────────────────────────────────── */}
      <section data-testid="settings-privacy-section" className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Privacy</h2>

        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            data-testid="settings-telemetry-toggle"
            checked={telemetryEnabled}
            onCheckedChange={setTelemetryEnabled}
          />
          Send anonymous diagnostics
        </label>

        <p className="text-xs text-muted-foreground">
          Shares anonymised error/warning signatures and operation timings to help us find and fix issues. Never
          includes your model's source content — only curated type names, never scratch workspace text. Off by default;
          disabled entirely on localhost regardless of this setting.
        </p>
      </section>

      {/* ── Project configuration ────────────────────────────────────────── */}
      <section data-testid="settings-project-section" className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Project configuration</h2>

        <p className="text-xs text-muted-foreground">
          The following settings will be configurable per-project via{' '}
          <code className="font-mono">.runestudio/config.json</code> once git-backed shared project config ships. They
          are <strong>not editable yet</strong>.
        </p>

        <ul className="space-y-1 text-xs text-muted-foreground opacity-50 list-disc list-inside">
          <li>
            <span className="font-medium">Project</span> — name, description
          </li>
          <li>
            <span className="font-medium">Curated models</span> — model ID + version list
          </li>
          <li>
            <span className="font-medium">Sync</span> — auto-sync enabled, debounce interval (ms), branch
          </li>
          <li>
            <span className="font-medium">Codegen</span> — target, layout, namespaces, options
          </li>
        </ul>
      </section>
    </section>
  );
}
