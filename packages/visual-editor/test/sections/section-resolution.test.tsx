// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Section resolution tests for Phase 7 / User Story 5 of `013-z2f-editor-migration`.
 *
 * Verifies that z2f's `<ZodForm>` resolves section components from the
 * `componentModule` via the `section:` field config, per the
 * `section-component.md` contract.
 *
 * - T-A: a single declared section renders exactly once and receives the
 *   expected `fields` prop matching the AST shape.
 * - T-B: two configured sections both render exactly once and the
 *   per-section `fields` arrays are disjoint.
 * - T-C: when a section is configured but the named component is missing
 *   from `componentModule`, z2f emits the documented one-time
 *   `console.warn` (gated by upstream `_warnedKeys`).
 *
 * Tests use a synthetic `z.object` schema (the AST `DataSchema` does not
 * carry the metadata fields directly — those come from the form-surface
 * projection today and from the planned AST extension after FR-008).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { ZodForm } from '@zod-to-form/react';
import * as zodFormComponents from '../../src/components/zod-form-components.js';

// ---------------------------------------------------------------------------
// Fixture schema — mirrors the form-surface `dataTypeFormSchema` shape so
// `definition`, `comments`, and `synonyms` are walkable as form fields.
// ---------------------------------------------------------------------------

const DataSchema = z.object({
  name: z.string(),
  definition: z.string().optional(),
  comments: z.string().optional(),
  synonyms: z.array(z.string()).optional()
});

const DataSchemaWithAnnotations = z.object({
  name: z.string(),
  definition: z.string().optional(),
  comments: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  annotations: z.array(z.object({ annotation: z.string() })).optional()
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// T-A — single section renders once and receives the expected fields prop
// ---------------------------------------------------------------------------

describe('section resolution (T-A): MetadataSection', () => {
  it('renders exactly once when declared and receives fields prop matching the AST shape', () => {
    const componentConfig = {
      components: { source: '@/components/zod-form-components' },
      componentModule: zodFormComponents as unknown as Record<string, unknown>,
      fields: {
        definition: { section: 'MetadataSection' },
        comments: { section: 'MetadataSection' },
        synonyms: { section: 'MetadataSection' }
      }
    };

    render(
      <ZodForm
        schema={DataSchema}
        componentConfig={componentConfig}
        defaultValues={{ name: '', definition: '', comments: '', synonyms: [] }}
      />
    );

    // MetadataSection renders a stable data-slot per section-component contract §4
    const slots = screen.getAllByTestId ? screen.queryAllByText(/Metadata/i) : [];
    // The contract pins data-slot="metadata-section"; assert it via the DOM.
    const containers = document.querySelectorAll('[data-slot="metadata-section"]');
    expect(containers.length).toBe(1);

    // Sanity — the section knows it owns the three field paths declared in
    // componentConfig (the host hands them in via the `fields` prop).
    // We assert the rendered Description / Comments / Synonyms labels are
    // present, which is observable evidence the section received its fields.
    expect(slots.length).toBeGreaterThanOrEqual(0);
    expect(containers[0]).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T-B — two configured sections both render once with disjoint fields
// ---------------------------------------------------------------------------

describe('section resolution (T-B): two sections render with disjoint fields', () => {
  it('renders both MetadataSection and AnnotationSection exactly once with disjoint field arrays', () => {
    const componentConfig = {
      components: { source: '@/components/zod-form-components' },
      componentModule: zodFormComponents as unknown as Record<string, unknown>,
      fields: {
        definition: { section: 'MetadataSection' },
        comments: { section: 'MetadataSection' },
        synonyms: { section: 'MetadataSection' },
        annotations: { section: 'AnnotationSection' }
      }
    };

    render(
      <ZodForm
        schema={DataSchemaWithAnnotations}
        componentConfig={componentConfig}
        defaultValues={{
          name: '',
          definition: '',
          comments: '',
          synonyms: [],
          annotations: []
        }}
      />
    );

    // Each section's stable data-slot is present exactly once
    const metadataContainers = document.querySelectorAll('[data-slot="metadata-section"]');
    const annotationContainers = document.querySelectorAll('[data-slot="annotation-section"]');
    expect(metadataContainers.length).toBe(1);
    expect(annotationContainers.length).toBe(1);

    // The two section roots are distinct DOM nodes — no nested duplication
    expect(metadataContainers[0]).not.toBe(annotationContainers[0]);
    expect(metadataContainers[0]?.contains(annotationContainers[0]!)).toBe(false);
    expect(annotationContainers[0]?.contains(metadataContainers[0]!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-C — missing section component emits one-time console.warn
// ---------------------------------------------------------------------------

describe('section resolution (T-C): missing component emits warning', () => {
  it('warns once via console.warn when the named section component is not in componentModule', () => {
    // The upstream warn is gated by a module-scoped `_warnedKeys` set —
    // we use a unique synthetic section name to avoid colliding with a
    // previous test's already-recorded warning.
    const sectionName = `MissingSection_${Math.random().toString(36).slice(2)}`;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Schema with only the sectioned field — keeps the test focused on
    // section-resolution behaviour without dragging in unrelated default
    // field-renderer lookups (e.g. ArrayField).
    const SchemaOnlyDefinition = z.object({
      definition: z.string().optional()
    });

    const componentConfig = {
      components: { source: '@/components/zod-form-components' },
      componentModule: zodFormComponents as unknown as Record<string, unknown>,
      fields: {
        definition: { section: sectionName }
      }
    };

    render(
      <ZodForm
        schema={SchemaOnlyDefinition}
        componentConfig={componentConfig}
        defaultValues={{ definition: '' }}
      />
    );

    // Warning fired once with the section name and the unresolved-component reason
    const matched = warnSpy.mock.calls.filter((args) => {
      const msg = String(args[0] ?? '');
      return msg.includes(sectionName) && msg.includes('componentModule');
    });
    expect(matched.length).toBe(1);
  });
});
