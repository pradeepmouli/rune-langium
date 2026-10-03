// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@rune-langium/design-system';

// J06 structure view: Structure / Source / Form view tabs above the editor.
export const ViewTabs = () => (
  <Tabs defaultValue="structure" className="w-[440px]">
    <TabsList>
      <TabsTrigger value="structure">Structure</TabsTrigger>
      <TabsTrigger value="source">Source</TabsTrigger>
      <TabsTrigger value="form">Form</TabsTrigger>
    </TabsList>
    <TabsContent value="structure" className="rounded-lg border border-border bg-card p-4 text-sm text-foreground">
      Party, TradeState and 14 other types in cdm.base.datetime.
    </TabsContent>
    <TabsContent value="source">Source</TabsContent>
    <TabsContent value="form">Form</TabsContent>
  </Tabs>
);

// J11 codegen code tab: Code / Preview tabs, Code active with generated output.
export const CodeAndPreview = () => (
  <Tabs defaultValue="code" className="w-[440px]">
    <TabsList>
      <TabsTrigger value="code">Code</TabsTrigger>
      <TabsTrigger value="preview">Preview</TabsTrigger>
    </TabsList>
    <TabsContent value="code">
      <pre className="studio-scroll rounded-lg border border-border bg-card p-3 font-mono text-xs text-foreground">{`export const PartySchema = z.object({
  partyId: z.array(z.string()).min(1),
  name: z.string().optional()
});`}</pre>
    </TabsContent>
    <TabsContent value="preview">Preview</TabsContent>
  </Tabs>
);

// J05 inspector: compact underline "sm" tabs for Data type form subsections.
export const InspectorSmallTabs = () => (
  <Tabs defaultValue="attributes" className="w-[440px]">
    <TabsList size="sm" className="border-b border-border">
      <TabsTrigger value="attributes">Attributes</TabsTrigger>
      <TabsTrigger value="conditions">Conditions</TabsTrigger>
      <TabsTrigger value="metadata">Metadata</TabsTrigger>
    </TabsList>
    <TabsContent value="attributes" className="p-3 text-sm text-muted-foreground">
      partyId, name, account, person (4 attributes)
    </TabsContent>
    <TabsContent value="conditions">Conditions</TabsContent>
    <TabsContent value="metadata">Metadata</TabsContent>
  </Tabs>
);
