// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { mergeConfigLayers, prepareValidationSchema, resolveFormConfig } from '@zod-to-form/core';
import { z } from 'zod';
import studioConfig from '../../z2f.config.js';
import editorConfig from '../../../../packages/visual-editor/z2f.config.js';
import { ExcelOptionsSchema } from '../../src/codegen-forms/excel-options.schema.js';

describe('canonical z2f consumer configuration', () => {
  for (const compileZod of [false, true]) {
    it(`preserves Excel option defaults and rejected messages with compilation=${compileZod}`, () => {
      const schema = prepareValidationSchema(ExcelOptionsSchema, { compileZod });
      expect(schema.safeParse({})).toEqual(ExcelOptionsSchema.safeParse({}));
      const invalid = { sheets: { types: 'yes' } };
      expect(schema.safeParse(invalid)).toEqual(ExcelOptionsSchema.safeParse(invalid));
    });
  }
  it('resolves Studio auto-save and sibling component imports', () => {
    const resolved = resolveFormConfig({ config: studioConfig, exportName: 'ExcelOptionsSchema' });
    expect(resolved).toMatchObject({ mode: 'auto-save', ui: 'shadcn', optimization: { compileZod: false } });
    expect(resolved.componentConfig.components.source).toBe('./z2f-components');
    expect(resolved.componentConfig.components.overrides?.Checkbox).toMatchObject({
      controlled: true,
      props: { checked: 'field.value', onCheckedChange: 'field.onChange' }
    });
    expect(resolved.componentConfig.components.overrides?.Select).toMatchObject({ controlled: true });
  });
  it('preserves visual-editor domain metadata and adapter contracts', () => {
    const resolved = resolveFormConfig({ config: editorConfig, exportName: 'DataSchema' });
    expect(resolved.componentConfig.components.fieldTemplate).toBe('@/components/zod-field-template');
    expect(resolved.componentConfig.components.overrides?.TypeSelector).toMatchObject({
      controlled: true,
      props: { value: 'field.value', onChange: 'field.onChange' }
    });
    expect(resolved.componentConfig.components.overrides?.Select?.props).toMatchObject({ onChange: 'field.onChange' });
    expect(resolved.fields.$type).toMatchObject({ hidden: true });
    expect(resolved.fields.definition).toMatchObject({ section: 'MetadataSection' });
    expect(resolved.fields.attributes).toMatchObject({ arrayConfig: { reorder: true } });
    expect(resolved.fields['attributes[].typeCall.type']).toMatchObject({ component: 'TypeSelector', order: 2 });
  });
  for (const compileZod of [false, true]) {
    it(`supports compile-only=${compileZod} with unchanged component resolution and parsed output`, () => {
      const config = mergeConfigLayers(studioConfig, { defaults: { optimization: { compileZod } } });
      const resolved = resolveFormConfig({ config, exportName: 'ExcelOptionsSchema' });
      expect(resolved.componentConfig.components.source).toBe('./z2f-components');
      expect(resolved.optimization.level).toBeUndefined();
      const schema = z.object({ count: z.coerce.number().min(1) });
      const prepared = prepareValidationSchema(schema, resolved.optimization);
      expect(prepared.safeParse({ count: '2' })).toEqual(schema.safeParse({ count: '2' }));
      expect(prepared.safeParse({ count: '0' }).success).toBe(false);
    });
  }
});
