// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Fragment, useCallback, useRef, useState } from 'react';
import type React from 'react';
import { Network, FileCode2, Info } from 'lucide-react';
import { useCenterPanes, type CenterPane } from '../center-panes-context.js';

const PANE_ORDER: CenterPane[] = ['graph', 'source', 'inspector'];
const PANE_LABELS: Record<CenterPane, string> = {
  graph: 'Graph',
  source: 'Source',
  inspector: 'Inspector'
};
const PANE_ICONS: Record<CenterPane, React.FC<React.SVGProps<SVGSVGElement>>> = {
  graph: Network,
  source: FileCode2,
  inspector: Info
};
const MIN_PANE_PX = 120;

interface CenterStackPanelProps {
  renderGraph: () => React.ReactElement | null;
  renderSource: () => React.ReactElement | null;
  renderInspector: () => React.ReactElement | null;
}

export function CenterStackPanel({
  renderGraph,
  renderSource,
  renderInspector
}: CenterStackPanelProps): React.ReactElement {
  const { activePanes, toggle } = useCenterPanes();
  const ordered = PANE_ORDER.filter((p) => activePanes.has(p));
  const containerRef = useRef<HTMLDivElement>(null);

  const [fractions, setFractions] = useState<number[]>(() => ordered.map(() => 1 / ordered.length));

  const prevCountRef = useRef(ordered.length);
  if (ordered.length !== prevCountRef.current) {
    prevCountRef.current = ordered.length;
    const equal = ordered.map(() => 1 / ordered.length);
    if (JSON.stringify(equal) !== JSON.stringify(fractions)) {
      setFractions(equal);
    }
  }

  const handleDragStart = useCallback(
    (splitIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const totalWidth = container.offsetWidth;
      const startX = e.clientX;
      const startFractions = [...fractions];

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dFrac = dx / totalWidth;
        const next = [...startFractions];
        const left = splitIndex;
        const right = splitIndex + 1;
        const minFrac = MIN_PANE_PX / totalWidth;
        next[left] = Math.max(minFrac, startFractions[left]! + dFrac);
        next[right] = Math.max(minFrac, startFractions[right]! - dFrac);
        const sum = next.reduce((a, b) => a + b, 0);
        setFractions(next.map((f) => f / sum));
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [fractions]
  );

  const renderPane = (pane: CenterPane): React.ReactElement | null => {
    switch (pane) {
      case 'graph':
        return renderGraph();
      case 'source':
        return renderSource();
      case 'inspector':
        return renderInspector();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Paneswitch pill — sits below the dockview tab strip */}
      <div
        className="studio-center-stack__bar"
        role="toolbar"
        aria-label="Center pane selector"
        data-testid="studio-paneswitch"
      >
        <div className="studio-paneswitch" role="group">
          {PANE_ORDER.map((pane) => {
            const isActive = activePanes.has(pane);
            const Icon = PANE_ICONS[pane];
            return (
              <button
                key={pane}
                type="button"
                aria-pressed={isActive}
                className={isActive ? 'studio-paneswitch__seg is-active' : 'studio-paneswitch__seg'}
                onClick={() => toggle(pane)}
              >
                <Icon className="size-3.5" aria-hidden />
                {PANE_LABELS[pane]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pane body — active panes split side-by-side */}
      <div
        ref={containerRef}
        className="studio-center-stack"
        data-count={ordered.length}
        data-testid="center-stack"
      >
        {ordered.map((pane, i) => (
          <Fragment key={pane}>
            {i > 0 && (
              <div
                className="studio-center-stack__split"
                onMouseDown={(e) => handleDragStart(i - 1, e)}
              />
            )}
            <div
              className="studio-center-stack__pane"
              data-pane={pane}
              style={{ flex: `${fractions[i] ?? 1 / ordered.length} 1 0%` }}
            >
              {renderPane(pane)}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
