// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * InteractiveDialog — shared shell for Studio's single-screen confirm/cancel
 * dialogs (ExportDialog, DownloadConfigDialog, ImportDialog). Standardizes
 * sizing, header, scrollable body, and an optional footer bar; each
 * consumer keeps its own phase state machine and error rendering — see
 * docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md's
 * 2026-07-09 addendum for why this stays shell-only.
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Separator } from './separator';
import { cn } from '../utils';

export interface InteractiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Rendered as a visually-hidden DialogDescription (a11y only). */
  description: React.ReactNode;
  /** Tailwind width class, e.g. "w-[720px]" — combined with the shared max-w-[92vw] max-h-[80vh] sizing. */
  width: string;
  /** data-testid on the rendered DialogContent. */
  testId: string;
  /** Forwarded to DialogContent's overlayProps, e.g. { 'data-testid': 'export-dialog-overlay' }. */
  overlayProps?: React.ComponentProps<typeof DialogContent>['overlayProps'];
  /** Extra classes merged onto the scrollable body div (default: 'flex-1 min-h-0 flex flex-col'). */
  bodyClassName?: string;
  /** Footer content, rendered after a Separator in a standard button-bar. Omit for dialogs whose actions live inline in the body. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function InteractiveDialog({
  open,
  onOpenChange,
  title,
  description,
  width,
  testId,
  overlayProps,
  bodyClassName,
  footer,
  children
}: InteractiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('max-w-[92vw] max-h-[80vh] flex flex-col gap-0 p-0', width)}
        data-testid={testId}
        overlayProps={overlayProps}
      >
        <DialogHeader className="px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <Separator />

        <div className={cn('flex-1 min-h-0 flex flex-col', bodyClassName)}>{children}</div>

        {footer && (
          <>
            <Separator />
            <div className="flex justify-end gap-2 px-4 py-3">{footer}</div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
