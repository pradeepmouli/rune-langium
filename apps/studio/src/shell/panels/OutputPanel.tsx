// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useUtilityHeaderActions } from '../utility-header-actions-context.js';
import { SEV, useOutputStore } from '../../store/output-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

const SEVERITY_CLASS: Record<string, string> = {
  error: 'text-destructive',
  warn: 'text-warning',
  success: 'text-teal-400',
  info: 'text-muted-foreground/60'
};

export const OutputPanel = withInstrumentation(
  function OutputPanel(): React.ReactElement {
    const lines = useOutputStore((s) => s.lines);
    const clearLines = useOutputStore((s) => s.clearLines);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [lines]);

    // Clear lives in the dockview group header (first row) so it stays
    // visible while the utility tray is collapsed to header height.
    const headerActions = useMemo(
      () => (
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
          onClick={clearLines}
        >
          Clear
        </button>
      ),
      [clearLines]
    );
    useUtilityHeaderActions('workspace.output', headerActions);

    return (
      <section
        aria-label="Output"
        data-testid="panel-output"
        data-component="workspace.output"
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <div ref={scrollRef} aria-live="polite" className="studio-scroll flex-1 overflow-auto px-3 py-1.5">
          {lines.length === 0 ? (
            <p className="font-mono text-2xs text-muted-foreground/60">No output yet.</p>
          ) : (
            lines.map((line) => {
              const prefix = SEV[line.severity];
              const colorClass = SEVERITY_CLASS[line.severity] ?? 'text-muted-foreground/60';
              return (
                <div key={line.id} className={`font-mono text-xs leading-5 ${colorClass}`}>
                  {prefix ? `${prefix} ${line.text}` : line.text}
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  },
  { op: 'OutputPanel' }
);
