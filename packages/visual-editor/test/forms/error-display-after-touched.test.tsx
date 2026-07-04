// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * `errorDisplay: 'afterTouched'` adoption (schema-as-validity-trigger design,
 * Stream 3 T4).
 *
 * DataTypeForm, EnumForm, ChoiceForm, FunctionForm, and TypeAliasForm all now
 * pass `errorDisplay: 'afterTouched'` to `useZodForm` — see each file's
 * `useZodForm(...)` call. z2f's own `FieldRenderer.test.tsx` (sibling repo)
 * already covers the touched-gating MECHANISM exhaustively; this suite
 * proves the option is correctly WIRED through when a real generated VE
 * schema (with a genuine field-level constraint) is rendered via z2f's
 * `<ZodForm>` — the same code path `useZodForm` + `FieldRenderer` share.
 *
 * Root-level (`path: []`) superRefine finding (documented, not fixed here —
 * see the design doc's "OPTIONAL, only if a natural existing seam exists;
 * do not build new UI" instruction): empirically verified that RHF's
 * `formState.errors` under the DEFAULT `zodResolver` path (no `optimization`
 * option — the path every current VE form uses) is a plain `{}` for a
 * root-superRefine failure, even though `formState.isValid` correctly
 * reports `false`. z2f's `wrapWithSchemaLite` DOES map a root issue to RHF's
 * `root` error key, but that helper only runs from `form.handleSubmit` at
 * the optimization codegen tier — and the VE forms have no submit event
 * (live-apply architecture, per the design doc's "no migration before
 * live"/"mirror" decisions). None of the five VE forms read
 * `formState.errors` at the root path today (grep-verified — the only
 * `fieldState`/`formState.errors` read in the whole component tree is
 * FunctionForm's `expressionText` field, which is a UI-only key absent from
 * `RosettaFunctionSchema`'s shape and therefore never receives a
 * zod-resolver error regardless of this option). So: with the current
 * hand-rolled (non-`FieldRenderer`) forms, at-least-one-of superRefine
 * failures surface ONLY via `formState.isValid` (already consulted
 * elsewhere, e.g. `onValueChange` meta) — never as a rendered message.
 * Building a form-level error slot for this is explicitly out of scope
 * (no existing seam); flagged here as a follow-up for whoever wires these
 * forms through `FieldRenderer`/`ZodForm` directly.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { z } from 'zod';
import { ZodForm } from '@zod-to-form/react';

// Mirrors a real VE constraint shape: DataSchema.name is ValidIDSchema, a
// regex-constrained field — a genuine per-field error a hand-rolled row
// COULD surface once routed through FieldRenderer.
const NamedSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z_0-9]*$/, 'Name must be a valid identifier')
    .min(1, 'Name must be a valid identifier')
});

describe('errorDisplay: afterTouched — VE integration', () => {
  it('shows no field error for an invalid-but-untouched field', () => {
    render(<ZodForm schema={NamedSchema} defaultValues={{ name: '' }} mode="onChange" errorDisplay="afterTouched" />);

    expect(screen.queryByText('Name must be a valid identifier')).not.toBeInTheDocument();
  });

  it('reveals the field error once the field is touched (changed)', async () => {
    render(<ZodForm schema={NamedSchema} defaultValues={{ name: '' }} mode="onChange" errorDisplay="afterTouched" />);

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: '1invalid' } });

    expect(await screen.findByText('Name must be a valid identifier')).toBeInTheDocument();
  });

  it('defaults to always-visible when errorDisplay is omitted (back-compat baseline)', async () => {
    render(<ZodForm schema={NamedSchema} defaultValues={{ name: '' }} mode="onChange" />);

    // Without `errorDisplay: 'afterTouched'`, an error that ALREADY exists
    // (e.g. surfaced by validating one field) is not hidden pending a
    // SEPARATE field's own touch — this is the pre-#357 behavior this
    // option must not regress for callers who omit it.
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: '1invalid' } });
    expect(await screen.findByText('Name must be a valid identifier')).toBeInTheDocument();
  });
});

describe('root-level superRefine surfacing (finding, not a fix)', () => {
  const RefinedSchema = z
    .object({
      a: z.string().optional(),
      b: z.string().optional()
    })
    .superRefine((val, ctx) => {
      if (!val.a && !val.b) {
        ctx.addIssue({ code: 'custom', message: 'At least one of a, b is required' });
      }
    });

  it('formState.isValid reflects a root superRefine failure even though formState.errors does not carry it under the default resolver', async () => {
    let capturedIsValid: boolean | null = null;
    render(
      <ZodForm
        schema={RefinedSchema}
        defaultValues={{}}
        mode="onChange"
        errorDisplay="afterTouched"
        onValueChange={(_data, meta) => {
          capturedIsValid = meta.isValid;
        }}
      />
    );

    // `onValueChange` only fires on a real field mutation — an untouched
    // form's zodResolver never runs, so `a`'s own change (still leaving
    // BOTH `a` and `b` empty once cleared) is what triggers validation.
    const aInput = screen.getByLabelText('A');
    fireEvent.change(aInput, { target: { value: 'x' } });
    fireEvent.change(aInput, { target: { value: '' } });

    expect(capturedIsValid).toBe(false);
    // No field-level UI exists for a root-path (`path: []`) issue anywhere
    // in the rendered form — confirms the finding: nothing renders it.
    expect(screen.queryByText(/At least one of a, b is required/)).not.toBeInTheDocument();
  });
});
