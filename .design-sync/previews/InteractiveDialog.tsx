// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Button, InteractiveDialog, RadioGroup, RadioGroupItem, Checkbox } from '@rune-langium/design-system';

// J11 codegen: the per-target "Generate" dialog (Studio's DownloadConfigDialog).
export const GenerateCode = () => (
  <InteractiveDialog
    open
    onOpenChange={() => {}}
    title="Generate TypeScript"
    description="Choose layout and namespace subset, then generate TypeScript output."
    width="w-[480px]"
    testId="download-config-dialog"
    bodyClassName="studio-scroll overflow-auto p-4 gap-5"
    footer={
      <>
        <Button variant="secondary" size="sm">
          Cancel
        </Button>
        <Button size="sm">Generate</Button>
      </>
    }
  >
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Layout</span>
      <RadioGroup defaultValue="per-namespace">
        <div className="flex items-center gap-2 text-sm">
          <RadioGroupItem id="layout-ns" value="per-namespace" />
          <label htmlFor="layout-ns" className="flex items-center gap-2">
            <span className="font-medium text-foreground">One file per namespace</span>
            <span className="text-muted-foreground">(recommended)</span>
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <RadioGroupItem id="layout-single" value="single" />
          <label htmlFor="layout-single" className="font-medium text-foreground">
            Single bundled module
          </label>
        </div>
      </RadioGroup>
    </div>
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Namespaces (3 selected, 5 total)
      </span>
      {['cdm.base.datetime', 'cdm.base.math', 'cdm.event.common', 'cdm.product.template', 'cdm.legaldocumentation'].map(
        (ns, i) => (
          <label key={ns} className="flex items-center gap-2 font-mono text-xs text-foreground">
            <Checkbox defaultChecked={i < 3} /> {ns}
          </label>
        )
      )}
    </div>
  </InteractiveDialog>
);

// J12 import dialog: body-only actions (no footer bar), confirm lives inline.
export const ImportInlineActions = () => (
  <InteractiveDialog
    open
    onOpenChange={() => {}}
    title="Import JSON Schema"
    description="Paste or upload a JSON Schema to convert into Rune types."
    width="w-[560px]"
    testId="import-dialog"
    bodyClassName="p-4 gap-4"
  >
    <p className="text-sm text-muted-foreground">
      3 types will be created in <span className="font-mono text-foreground">demo.imported</span>. 1 property could not
      be mapped and will be skipped.
    </p>
    <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
      type Party:
      <br />
      &nbsp;&nbsp;partyId string (1..1)
      <br />
      &nbsp;&nbsp;name string (0..1)
    </div>
    <div className="flex justify-end gap-2">
      <Button variant="secondary" size="sm">
        Back
      </Button>
      <Button size="sm">Merge into workspace</Button>
    </div>
  </InteractiveDialog>
);
