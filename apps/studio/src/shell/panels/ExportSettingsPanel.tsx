// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { IMPLEMENTED_TARGETS, TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen/export';
import { Button } from '@rune-langium/design-system/ui/button';
import type { ExportConfig } from '../../services/export-request.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';
import { TARGET_PANELS } from '../../components/export-target-settings.js';

export interface ExportSettingsPanelProps {
  config: ExportConfig;
  onChange(config: ExportConfig): void;
  onGenerate(): void;
  generating: boolean;
}

/** Target and layout controls for a declaration-scoped export. */
export const ExportSettingsPanel = withInstrumentation(
  function ExportSettingsPanel({ config, onChange, onGenerate, generating }: ExportSettingsPanelProps) {
    const target = config.target;
    const panel = TARGET_PANELS[target];
    const targetOptions = (config.options[target] as Record<string, unknown> | undefined) ?? {};
    const selectionCount = config.selection.namespaces.length + config.selection.declarations.length;
    return (
      <section data-testid="export-settings-panel" className="flex h-full flex-col gap-4 p-3">
        <div>
          <h2 className="text-sm font-semibold">Export settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">Choose a target and generate the selected declarations.</p>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Target
          <select
            aria-label="Export target"
            className="h-8 rounded border border-input bg-background px-2 text-sm font-normal"
            value={target}
            onChange={(event) => onChange({ ...config, target: event.target.value as Target })}
          >
            {IMPLEMENTED_TARGETS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {TARGET_DESCRIPTORS[candidate].label}
              </option>
            ))}
          </select>
        </label>
        {panel && (
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Layout
            <select
              aria-label="Export layout"
              className="h-8 rounded border border-input bg-background px-2 text-sm font-normal"
              value={(targetOptions.layout as string | undefined) ?? panel.defaultLayout ?? ''}
              onChange={(event) =>
                onChange({
                  ...config,
                  options: { ...config.options, [target]: { ...targetOptions, layout: event.target.value } }
                })
              }
            >
              {panel.layouts.map((layout) => (
                <option key={layout.value} value={layout.value}>
                  {layout.label}
                  {layout.hint ? ` — ${layout.hint}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button type="button" className="mt-auto" disabled={selectionCount === 0 || generating} onClick={onGenerate}>
          {generating ? 'Generating…' : `Generate ${selectionCount} selected`}
        </Button>
      </section>
    );
  },
  { op: 'ExportSettingsPanel' }
);
