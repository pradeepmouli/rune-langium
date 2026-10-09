// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input
} from '@rune-langium/design-system';

// J14 git-sync: connect a GitHub repository to the workspace.
export const GitHubConnect = () => (
  <div className="w-[420px]">
    <FieldSet>
      <FieldLegend>Connect repository</FieldLegend>
      <FieldDescription>
        Studio pushes model changes to this branch. Nothing is written until you sync.
      </FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="repo">Repository</FieldLabel>
          <Input id="repo" defaultValue="finos/common-domain-model" />
          <FieldDescription>owner/name on github.com</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="branch">Branch</FieldLabel>
          <Input id="branch" defaultValue="studio/party-refactor" />
        </Field>
      </FieldGroup>
    </FieldSet>
  </div>
);

// Validation state: invalid field with error text (data-invalid drives the destructive tint).
export const ValidationError = () => (
  <div className="w-[420px]">
    <Field data-invalid="true">
      <FieldLabel htmlFor="ns">Namespace</FieldLabel>
      <Input id="ns" aria-invalid="true" defaultValue="Demo Types" />
      <FieldError errors={[{ message: 'Namespaces are dot-separated lowercase segments, e.g. demo.types' }]} />
    </Field>
  </div>
);

// J15 settings: horizontal checkbox fields with title + description.
export const SettingsToggles = () => (
  <div className="w-[460px]">
    <FieldGroup>
      <Field orientation="horizontal">
        <Checkbox id="autosave" defaultChecked />
        <FieldContent>
          <FieldLabel htmlFor="autosave">Autosave to browser storage</FieldLabel>
          <FieldDescription>Keeps the workspace in OPFS so a reload restores it.</FieldDescription>
        </FieldContent>
      </Field>
      <FieldSeparator>Diagnostics</FieldSeparator>
      <Field orientation="horizontal">
        <Checkbox id="telemetry" />
        <FieldContent>
          <FieldLabel htmlFor="telemetry">Share anonymous timing data</FieldLabel>
          <FieldDescription>Operation timings only — never model content.</FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  </div>
);
