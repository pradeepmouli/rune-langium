// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Fragment, useCallback, useRef, useState } from 'react';
import type React from 'react';
import { useCenterPanes, type CenterPane } from '../center-panes-context.js';

const PANE_ORDER: CenterPane[] = ['graph', 'source', 'inspector'];
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
  const activePanes = useCenterPanes();
  const ordered = PANE_ORDER.filter((p) => activePanes.has(p));
  const containerRef = useRef<HTMLDivElement>(null);

  // Fractional widths per pane — reset to equal when pane set changes.
  const [fractions, setFractions] = useState<number[]>(() => ordered.map(() => 1 / ordered.length));

  // Keep fractions in sync with pane count.
  const prevCountRef = useRef(ordered.length);
  if (ordered.length !== prevCountRef.current) {
    prevCountRef.current = ordered.length;
    // Reset to equal split — can't preserve fractions across pane add/remove
    // because the mapping shifts.
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

        // splitIndex is between pane[splitIndex] and pane[splitIndex+1]
        const left = splitIndex;
        const right = splitIndex + 1;
        const minFrac = MIN_PANE_PX / totalWidth;

        next[left] = Math.max(minFrac, startFractions[left]! + dFrac);
        next[right] = Math.max(minFrac, startFractions[right]! - dFrac);

        // Normalize so they sum to 1
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
  );
}
