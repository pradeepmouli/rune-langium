// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState } from 'react';
import type React from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { NumberChiclet } from '@rune-langium/design-system/ui/number-chiclet';
import { withInstrumentation } from '../services/instrumentation/core.js';

export interface StudioDockTabParams {
  count?: number;
}

/** Shared Dockview tab chrome for every Studio workbench. */
export const StudioDockTab = withInstrumentation(
  function StudioDockTab({ api, params }: IDockviewPanelHeaderProps<StudioDockTabParams>): React.ReactElement {
    const [count, setCount] = useState<number | undefined>(
      params?.count ?? api.getParameters<StudioDockTabParams>()?.count
    );

    useEffect(() => {
      setCount(params?.count);
    }, [params?.count]);

    useEffect(() => {
      setCount(api.getParameters<StudioDockTabParams>()?.count);
      const disposable = api.onDidParametersChange((next) => {
        setCount((next as StudioDockTabParams | undefined)?.count);
      });
      return () => disposable.dispose();
    }, [api]);

    return (
      <div className="studio-dock-tab" data-count={count === undefined ? undefined : String(count)}>
        <span className="studio-dock-tab__label">{api.title ?? ''}</span>
        {count !== undefined ? (
          <NumberChiclet className="studio-dock-tab__count" title={`${count} item${count === 1 ? '' : 's'}`}>
            {count}
          </NumberChiclet>
        ) : null}
      </div>
    );
  },
  { op: 'StudioDockTab' }
);
