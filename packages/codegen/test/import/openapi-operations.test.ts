// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OpenAPI `paths` → `RosettaFunction` (spec.md Phase 2b Implementation
 * Addendum decision 4's inbound half). Reader-side counterpart of T3's
 * outbound emitter — the two must independently agree on the SAME
 * "METHOD /path" operation-string convention
 * (`operationStringForFunc` in `../../src/emit/openapi-emitter.js`) for the
 * round trip to close (verified directly in this file, not just informally).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readOpenApi } from '../../src/import/sources/openapi-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';
import { operationStringForFunc } from '../../src/emit/openapi-emitter.js';
import {
  OPENAPI_ANNOTATION_NAME,
  OPERATION_ATTRIBUTE_NAME,
  OPERATION_QUALIFIER_NAME
} from '../../src/import/operation-carrier.js';

function importToRune(doc: object, options?: { namespace?: string }): { text: string; diagnostics: unknown[] } {
  const { model, diagnostics: readerDiagnostics } = readOpenApi(doc as never, options);
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  const declarations = [built.synonymSourceDeclaration, built.operationAnnotationDeclaration].filter(
    (d): d is string => d !== undefined
  );
  if (declarations.length > 0) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, ...declarations.flatMap((d) => ['', d]));
  }
  return { text: lines.join('\n'), diagnostics: [...readerDiagnostics, ...built.diagnostics] };
}

async function assertParses(text: string): Promise<void> {
  const result = await parse(text);
  if (result.hasErrors) {
    throw new Error(
      `expected zero parse errors for:\n${text}\ngot: ${JSON.stringify([...result.lexerErrors, ...result.parserErrors])}`
    );
  }
  expect(result.hasErrors).toBe(false);
}

const DOUBLE_OPERATION_DOC: object = {
  openapi: '3.1.0',
  info: { title: 'Func Service', version: '1.0.0' },
  paths: {
    '/functions/Double': {
      post: {
        operationId: 'Double',
        summary: 'Doubles a value',
        'x-rune-operation': 'POST /functions/Double',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['value'],
                properties: { value: { type: 'integer' } }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'result',
            content: { 'application/json': { schema: { type: 'integer' } } }
          }
        }
      }
    }
  },
  components: { schemas: {} }
};

describe('OpenAPI paths → RosettaFunction', () => {
  it('reads operationId → func name, requestBody → inputs, 200 response → output, summary → definition', async () => {
    const { model } = readOpenApi(DOUBLE_OPERATION_DOC as never);
    expect(model.funcs).toHaveLength(1);
    const func = model.funcs[0]!;
    expect(func.name).toBe('Double');
    expect(func.description).toBe('Doubles a value');
    expect(func.inputs).toHaveLength(1);
    expect(func.inputs[0]).toMatchObject({ name: 'value', typeName: 'int', cardinality: { inf: 1, sup: 1 } });
    expect(func.output).toMatchObject({ typeName: 'int', cardinality: { inf: 1, sup: 1 } });
    expect(func.operation).toBe('POST /functions/Double');
  });

  it('emits a real Rune func with the carrier annotation attached, parses with zero errors', async () => {
    const { text, diagnostics } = importToRune(DOUBLE_OPERATION_DOC);
    await assertParses(text);
    expect(text).toContain('func Double:');
    expect(text).toContain(
      `[${OPENAPI_ANNOTATION_NAME} ${OPERATION_ATTRIBUTE_NAME} "${OPERATION_QUALIFIER_NAME}"="POST /functions/Double"]`
    );
    expect(diagnostics.filter((d) => (d as { severity?: string }).severity === 'error')).toHaveLength(0);
  });

  it('inputs without a requestBody `required` entry are optional (0..1) in the reconstructed func', async () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'Maybe Service', version: '1.0.0' },
      paths: {
        '/functions/Maybe': {
          post: {
            operationId: 'Maybe',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['a'],
                    properties: { a: { type: 'integer' }, b: { type: 'integer' } }
                  }
                }
              }
            },
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { type: 'integer' } } } }
            }
          }
        }
      },
      components: { schemas: {} }
    };
    const { model } = readOpenApi(doc as never);
    const func = model.funcs[0]!;
    const a = func.inputs.find((i) => i.name === 'a')!;
    const b = func.inputs.find((i) => i.name === 'b')!;
    expect(a.cardinality).toEqual({ inf: 1, sup: 1 });
    expect(b.cardinality).toEqual({ inf: 0, sup: 1 });
  });

  it('derives the operation string from method+path when x-rune-operation is absent (round-trippable even from a hand-written spec)', async () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'Hand Written', version: '1.0.0' },
      paths: {
        '/functions/Triple': {
          post: {
            operationId: 'Triple',
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { type: 'integer' } } } }
            }
          }
        }
      },
      components: { schemas: {} }
    };
    const { model } = readOpenApi(doc as never);
    expect(model.funcs[0]!.operation).toBe('POST /functions/Triple');
  });

  it('operationStringForFunc (emitter) and the reader derive the identical string for the same func name — the round-trip agreement', () => {
    expect(operationStringForFunc('Triple')).toBe('POST /functions/Triple');
  });

  it('non-2xx-only operations (no 200 response) still produce a func with a diagnosed placeholder output, not a thrown error', async () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'No200', version: '1.0.0' },
      paths: {
        '/functions/NoOutput': {
          post: {
            operationId: 'NoOutput',
            responses: { '204': { description: 'no content' } }
          }
        }
      },
      components: { schemas: {} }
    };
    const { model, diagnostics } = readOpenApi(doc as never);
    expect(model.funcs).toHaveLength(1);
    expect(diagnostics.some((d) => d.code === 'func-no-2xx-response')).toBe(true);
  });
});
