// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@rune-langium/design-system';

const pane = 'h-full p-3 text-sm';

// J06 structure view: explorer | canvas | inspector three-pane shell.
export const ThreePaneShell = () => (
  <div className="h-[320px] w-[720px] overflow-hidden rounded-lg border border-border">
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="22%" minSize="12%" className="bg-sidebar">
        <div className={pane + ' text-sidebar-foreground'}>
          <div className="mb-2 text-xs uppercase text-muted-foreground">Explorer</div>
          <div className="font-mono text-xs">cdm.base.datetime</div>
          <div className="font-mono text-xs text-muted-foreground">cdm.product.template</div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="52%" className="bg-background">
        <div className={pane}>
          <div className="mb-2 text-xs uppercase text-muted-foreground">Canvas</div>
          <div className="inline-block rounded-md border border-border bg-card px-3 py-2 font-mono text-xs">
            TradeState
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="26%" className="bg-card">
        <div className={pane}>
          <div className="mb-2 text-xs uppercase text-muted-foreground">Inspector</div>
          <div className="text-foreground">Party</div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
);

// J07 source: vertical split of editor above the diagnostics panel.
export const EditorAndProblems = () => (
  <div className="h-[320px] w-[560px] overflow-hidden rounded-lg border border-border">
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="68%" className="bg-background">
        <pre className="p-3 font-mono text-xs text-foreground">{`type Party:
  partyId string (1..*)
  name string (0..1)`}</pre>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="32%" className="bg-card">
        <div className="p-3 text-xs text-muted-foreground">Problems (0 errors, 2 warnings)</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
);
