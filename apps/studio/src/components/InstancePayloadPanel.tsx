// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useState, type ReactElement } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import type { PayloadView } from './FormPreviewPanel.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

export interface InstancePayloadPanelProps {
  payload: PayloadView;
  onExport(): void;
}

export const InstancePayloadPanel = withInstrumentation(
  function InstancePayloadPanel({ payload, onExport }: InstancePayloadPanelProps): ReactElement {
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const serialized = JSON.stringify(payload.value, null, 2);

    async function copyPayload(): Promise<void> {
      if (!navigator.clipboard?.writeText) {
        setCopyFeedback('Clipboard access is unavailable in this browser.');
        return;
      }
      try {
        await navigator.clipboard.writeText(serialized);
        setCopyFeedback('Payload copied.');
      } catch {
        setCopyFeedback('Copy failed. Check clipboard permissions and try again.');
      }
    }

    return (
      <section aria-label="Instance payload" className="border-t border-border p-3">
        <header className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Payload</h3>
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" size="xs" onClick={() => void copyPayload()}>
              Copy
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={onExport}>
              Export
            </Button>
          </div>
        </header>
        <pre
          className="studio-scroll mt-2 max-h-56 overflow-auto text-2xs leading-5"
          data-testid="instance-payload-output"
        >
          {serialized}
        </pre>
        {copyFeedback ? (
          <p role="status" className="mt-1 text-2xs text-muted-foreground">
            {copyFeedback}
          </p>
        ) : null}
      </section>
    );
  },
  { op: 'InstancePayloadPanel' }
);
