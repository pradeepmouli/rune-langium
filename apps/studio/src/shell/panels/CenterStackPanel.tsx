// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Fragment } from 'react';
import type React from 'react';
import { useCenterPanes, type CenterPane } from '../center-panes-context.js';

const PANE_ORDER: CenterPane[] = ['graph', 'source', 'inspector'];

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
    <div className="studio-center-stack" data-count={ordered.length} data-testid="center-stack">
      {ordered.map((pane, i) => (
        <Fragment key={pane}>
          {i > 0 && <div className="studio-center-stack__split" />}
          <div className="studio-center-stack__pane" data-pane={pane}>
            {renderPane(pane)}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
