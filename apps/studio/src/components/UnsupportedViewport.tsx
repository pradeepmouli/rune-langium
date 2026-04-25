// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export function UnsupportedViewport(): React.ReactElement {
  return (
    <div role="alert" data-testid="unsupported-viewport">
      <h1>Studio is built for laptops and larger</h1>
      <p>
        Open this page on a screen at least 768 pixels wide. The dockable editor needs more
        horizontal space than a portrait phone provides.
      </p>
    </div>
  );
}
