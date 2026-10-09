// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input
} from '@rune-langium/design-system';
import { TriangleAlert } from 'lucide-react';

// J02 workspace lifecycle: confirm before deleting a saved workspace.
export const ConfirmDeleteWorkspace = () => (
  <Dialog open>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Delete workspace "cdm-trade-model"?</DialogTitle>
        <DialogDescription>
          This removes the local copy of 14 files across 6 namespaces. Unpushed changes on branch{' '}
          <span className="font-mono text-foreground">feat/settlement-date</span> will be lost.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />2 files have uncommitted edits
        (TradeState.rosetta, Party.rosetta).
      </div>
      <DialogFooter>
        <Button variant="secondary" size="sm">
          Cancel
        </Button>
        <Button variant="destructive" size="sm">
          Delete workspace
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// J02 workspace lifecycle: create a new workspace.
export const NewWorkspace = () => (
  <Dialog open>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>New workspace</DialogTitle>
        <DialogDescription>Name your workspace and pick where it is stored.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <label htmlFor="ws-name" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Workspace name
        </label>
        <Input id="ws-name" defaultValue="fx-derivatives" />
        <p className="text-xs text-muted-foreground">
          Stored in this browser. Connect GitHub later to sync to <span className="font-mono">main</span>.
        </p>
      </div>
      <DialogFooter>
        <Button variant="secondary" size="sm">
          Cancel
        </Button>
        <Button size="sm">Create workspace</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
