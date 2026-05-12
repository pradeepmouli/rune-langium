// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '@rune-langium/core';
import { URI, EmptyFileSystem } from 'langium';
import type { WorkerRequest, WorkerResponse } from '../../src/workers/parser-worker.js';
import { dispatchWorkerRequest } from '../../src/workers/parser-worker.js';

export interface ParserWorkerHarness {
  send(msg: WorkerRequest): Promise<WorkerResponse>;
  serializeSample(namespace: string, typeName: string): string;
  dispose(): void;
}

export function createParserWorkerHarness(): ParserWorkerHarness {
  return {
    async send(msg: WorkerRequest): Promise<WorkerResponse> {
      return dispatchWorkerRequest(msg);
    },
    serializeSample(namespace: string, typeName: string): string {
      const services = createRuneDslServices(EmptyFileSystem).RuneDsl;
      const source = `namespace ${namespace}\ntype ${typeName}:\n  x number (1..1)\n`;
      // Must use .rosetta extension — the Langium service registry only handles .rosetta files.
      const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
        source,
        URI.parse(`file:///${namespace.replace(/\./g, '/')}.rosetta`)
      );
      return services.serializer.JsonSerializer.serialize(doc.parseResult.value);
    },
    dispose(): void {
      // Singleton services are reused across tests; callers construct a fresh harness per test for isolation.
    }
  };
}
