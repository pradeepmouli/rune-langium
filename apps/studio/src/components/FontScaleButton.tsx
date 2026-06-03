// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useCallback, useEffect, useState } from 'react';
import { CaseSensitive } from 'lucide-react';
import { Button } from '@rune-langium/design-system/ui/button';

export type FontScale = 'sm' | 'md' | 'lg';

const ORDER: readonly FontScale[] = ['sm', 'md', 'lg'] as const;
const LABEL: Record<FontScale, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };
const STORAGE_KEY = 'studio.font-scale';

function readStored(): FontScale {
  if (typeof window === 'undefined') return 'md';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'sm' || v === 'md' || v === 'lg' ? v : 'md';
  } catch {
    return 'md';
  }
}

function applyToRoot(scale: FontScale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.fontScale = scale;
}

/**
 * Cycle button for content-pane font size (Inspector / Structure / Graph
 * / Form). Three steps: sm / md / lg. Persisted in localStorage. Applied
 * by writing `data-font-scale` on the document root; CSS in
 * apps/studio/src/app.css scales the relevant pane containers via
 * the `zoom` property (works under React Flow's internal transform
 * because zoom is applied at the outer container before RF reads layout
 * coordinates).
 */
export function FontScaleButton(): React.ReactElement {
  const [scale, setScale] = useState<FontScale>(readStored);

  useEffect(() => {
    applyToRoot(scale);
    try {
      window.localStorage.setItem(STORAGE_KEY, scale);
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
  }, [scale]);

  const cycle = useCallback(() => {
    setScale((cur) => {
      const i = ORDER.indexOf(cur);
      return ORDER[(i + 1) % ORDER.length] ?? 'md';
    });
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={cycle}
      aria-label={`Pane font size: ${LABEL[scale]} (click to cycle)`}
      title={`Pane font size: ${LABEL[scale]} (click to cycle)`}
      data-font-scale-current={scale}
    >
      <CaseSensitive />
    </Button>
  );
}
