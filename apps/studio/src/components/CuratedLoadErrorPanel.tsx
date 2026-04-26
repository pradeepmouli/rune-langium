// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * CuratedLoadErrorPanel — surfaces a distinct, actionable message for each
 * FR-002 error category. Feature 012, T038.
 *
 * Never shows a generic "unknown error" or "something went wrong" string —
 * even the catch-all `unknown` category gets a category-specific paragraph.
 */

import { Button } from '@rune-langium/design-system/ui/button';
import type { ErrorCategory } from '../services/curated-loader.js';

interface ErrorCopy {
  title: string;
  body: string;
  hint?: string;
}

const COPY: Record<ErrorCategory, ErrorCopy> = {
  network: {
    title: 'Network connection problem',
    body: 'We couldn’t reach the model archive. Check your connection (or whether you’re offline) and try again.'
  },
  archive_not_found: {
    title: 'Archive is not yet available',
    body: 'The mirrored archive for this model couldn’t be found. The nightly mirror may not have completed yet — please retry in a few minutes.'
  },
  archive_decode: {
    title: 'The downloaded archive is corrupt',
    body: 'The archive failed to decode (invalid gzip or tar entries). The mirror likely has a partial upload; please retry.'
  },
  storage_quota: {
    title: 'Browser storage is full',
    body: 'Your browser denied additional storage for Studio. Free up some space — try removing other workspaces or clearing site data — and retry.',
    hint: 'On Chrome / Edge: Settings → Privacy → Site Settings → daikonic.dev → Clear data.'
  },
  permission_denied: {
    title: 'Storage permission was denied',
    body: 'The browser refused permission to write to the workspace area. Please allow storage access in your browser’s site settings and retry.'
  },
  cancelled: {
    title: 'Load cancelled',
    body: 'You cancelled the load before it finished. No partial files were kept. You can start it again whenever you’re ready.'
  },
  unknown: {
    title: 'An unexpected condition stopped the load',
    body: 'Something went wrong outside the documented failure modes. Retrying often resolves it; if it persists, please file an issue with the URL and the steps you took.'
  }
};

export interface CuratedLoadErrorPanelProps {
  category: ErrorCategory;
  modelName: string;
  onRetry: () => void;
  className?: string;
}

export function CuratedLoadErrorPanel({
  category,
  modelName,
  onRetry,
  className
}: CuratedLoadErrorPanelProps): React.ReactElement {
  const copy = COPY[category];
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="curated-load-error"
      data-category={category}
      className={className}
    >
      <h3>
        Loading {modelName} failed: {copy.title}
      </h3>
      <p>{copy.body}</p>
      {copy.hint ? <p>{copy.hint}</p> : null}
      <Button onClick={onRetry} type="button">
        Retry
      </Button>
    </div>
  );
}
