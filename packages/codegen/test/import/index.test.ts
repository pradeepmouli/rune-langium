// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { importModel } from '../../src/import/index.js';

const PARTY_SCHEMA = JSON.stringify({
  $id: 'https://example.com/schemas/party.json',
  $defs: {
    Party: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
        value: { type: 'integer', minimum: 0 }
      },
      required: ['partyId']
    }
  }
});

describe('importModel — public API', () => {
  it('imports JSON Schema end to end and produces zero-error-parsing .rune text (the hard invariant)', async () => {
    const result = await importModel(PARTY_SCHEMA, { from: 'json-schema' });
    expect(result.text).toContain('type Party:');
    expect(result.text).toContain('partyId string (1..1)');
    expect(result.text).toContain('condition ValueRange:');
    expect(result.model.namespace).toBe('com.example.schemas.party');
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
  });

  it('--namespace overrides $id-derived namespace', async () => {
    const result = await importModel(PARTY_SCHEMA, { from: 'json-schema', namespace: 'my.override' });
    expect(result.model.namespace).toBe('my.override');
    expect(result.text).toContain('namespace my.override');
  });

  it('synonyms: false suppresses every synonym annotation', async () => {
    const result = await importModel(PARTY_SCHEMA, { from: 'json-schema', synonyms: false });
    expect(result.text).not.toContain('synonym');
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
  });

  it('conditions: false performs a structural-only import (no Conditions emitted)', async () => {
    const result = await importModel(PARTY_SCHEMA, { from: 'json-schema', conditions: false });
    expect(result.text).not.toContain('condition ');
    expect(result.text).toContain('type Party:');
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
  });

  it('rejects an unsupported --from value with a clear "not yet supported" error', async () => {
    await expect(importModel(PARTY_SCHEMA, { from: 'typescript' })).rejects.toThrow(/not yet supported/);
    await expect(importModel(PARTY_SCHEMA, { from: 'python' })).rejects.toThrow(/not yet supported/);
  });

  it("--from 'sql' is supported (Phase 2c) but requires --namespace", async () => {
    await expect(importModel('CREATE TABLE t (id INT)', { from: 'sql' })).rejects.toThrow(/requires --namespace/);
  });

  it('rejects an unsupported --sql-dialect value with a clear error (found via PR review — the CLI cast it unchecked)', async () => {
    await expect(
      importModel('CREATE TABLE t (id INT)', {
        from: 'sql',
        namespace: 'test.sql',
        sqlDialect: 'mysql' as never
      })
    ).rejects.toThrow(/--sql-dialect 'mysql' is not supported/);
  });

  it('rejects an unimplemented --on-untranslatable value', async () => {
    await expect(importModel(PARTY_SCHEMA, { from: 'json-schema', onUntranslatable: 'skip' })).rejects.toThrow(
      /not yet supported/
    );
    await expect(importModel(PARTY_SCHEMA, { from: 'json-schema', onUntranslatable: 'error' })).rejects.toThrow(
      /not yet supported/
    );
  });

  it('accepts the default on-untranslatable value explicitly', async () => {
    const result = await importModel(PARTY_SCHEMA, { from: 'json-schema', onUntranslatable: 'stub' });
    const parseResult = await parse(result.text);
    expect(parseResult.hasErrors).toBe(false);
  });

  it('rejects malformed JSON input with a clear error', async () => {
    await expect(importModel('{ not valid json', { from: 'json-schema' })).rejects.toThrow(/not valid JSON/);
  });
});
