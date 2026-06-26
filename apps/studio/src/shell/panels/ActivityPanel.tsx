// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useRef } from 'react';
import { cn } from '@rune-langium/design-system/utils';
import { useActivityStore } from '../../store/activity-store.js';

export function ActivityPanel(): React.ReactElement {
  const entries = useActivityStore((s) => s.entries);
  const clearEntries = useActivityStore((s) => s.clearEntries);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <section
      aria-label="Activity"
      data-testid="panel-activity"
      data-component="workspace.activity"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-1.5">
        <span className="text-xs font-medium text-foreground">Activity</span>
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
          onClick={clearEntries}
        >
          Clear
        </button>
      </div>
      <div ref={scrollRef} aria-live="polite" className="studio-scroll flex-1 overflow-auto px-1 py-1">
        {entries.length === 0 ? (
          <p className="px-2 py-3 font-mono text-2xs text-muted-foreground/60">No activity yet.</p>
        ) : (
          <div className="flex flex-col gap-0.5 font-mono text-xs">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="grid items-center gap-2.5 rounded px-1.5 py-1 text-foreground/70 hover:bg-accent"
                style={{ gridTemplateColumns: '48px 80px 1fr' }}
              >
                <span className="text-muted-foreground/60">{entry.time}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-center text-3xs font-semibold uppercase tracking-[0.04em]',
                    entry.ok ? 'bg-teal-400/10 text-teal-400' : 'bg-destructive/15 text-destructive'
                  )}
                >
                  {entry.tag}
                </span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
