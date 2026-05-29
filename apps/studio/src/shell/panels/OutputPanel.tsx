// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { useEffect, useRef } from 'react';
import { SEV, useOutputStore } from '../../store/output-store.js';
import { useUtilityTrayControls } from '../utility-tray-context.js';

const SEVERITY_CLASS: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  success: 'text-green-400',
};

export function OutputPanel(): React.ReactElement {
  const { utilitiesCollapsed, setUtilitiesCollapsed } = useUtilityTrayControls();
  const lines = useOutputStore((s) => s.lines);
  const clearLines = useOutputStore((s) => s.clearLines);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <section aria-label="Messages" data-testid="panel-output" data-component="workspace.output">
      <div className="flex items-center justify-between gap-2">
        <h2>Messages</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-[11px] text-foreground"
            onClick={clearLines}
          >
            Clear
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-[11px] text-foreground"
            onClick={() => setUtilitiesCollapsed(!utilitiesCollapsed)}
          >
            {utilitiesCollapsed ? 'Show utilities' : 'Hide utilities'}
          </button>
        </div>
      </div>
      <div ref={scrollRef} aria-live="polite" className="overflow-auto">
        {lines.map((line) => {
          const prefix = SEV[line.severity];
          const colorClass = SEVERITY_CLASS[line.severity] ?? '';
          return (
            <div key={line.id} className={`font-mono text-xs${colorClass ? ` ${colorClass}` : ''}`}>
              {prefix ? `${prefix} ${line.text}` : line.text}
            </div>
          );
        })}
      </div>
    </section>
  );
}
