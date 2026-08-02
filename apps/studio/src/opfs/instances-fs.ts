// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { InstanceRecord } from '@rune-langium/codegen/instances';
import type { OpfsFs } from './opfs-fs.js';
import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

export interface InstanceIndexEntry {
  id: string;
  name: string;
  typeFqn: string;
  modifiedAt: number;
}

function instancesDir(workspaceRoot: string): string {
  return `${workspaceRoot}/.studio/instances`;
}

function instancePath(workspaceRoot: string, id: string): string {
  return `${instancesDir(workspaceRoot)}/${id}.json`;
}

function indexPath(workspaceRoot: string): string {
  return `${instancesDir(workspaceRoot)}/index.json`;
}

// `record` carries actual user-entered instance field values — never
// captured; `workspaceRoot`/`record.id` are safe structural identifiers.
export const writeInstance = withInstrumentation(
  async function writeInstance(fs: OpfsFs, workspaceRoot: string, record: InstanceRecord): Promise<void> {
    await fs.mkdir(instancesDir(workspaceRoot));
    await fs.writeFile(instancePath(workspaceRoot, record.id), JSON.stringify(record, null, 2));
  },
  {
    op: 'writeInstance',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, workspaceRoot, record] = value as [OpfsFs, string, InstanceRecord];
      return { workspaceRoot, id: record.id };
    }
  }
);

// Output carries real instance field values — never captured.
export const readInstance = withInstrumentation(
  async function readInstance(fs: OpfsFs, workspaceRoot: string, id: string): Promise<InstanceRecord> {
    const raw = await fs.readFile(instancePath(workspaceRoot, id), 'utf8');
    return JSON.parse(raw as string) as InstanceRecord;
  },
  {
    op: 'readInstance',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, workspaceRoot, id] = value as [OpfsFs, string, string];
      return { workspaceRoot, id };
    }
  }
);

export const deleteInstance = withInstrumentation(
  async function deleteInstance(fs: OpfsFs, workspaceRoot: string, id: string): Promise<void> {
    await fs.unlink(instancePath(workspaceRoot, id));
  },
  {
    op: 'deleteInstance',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, workspaceRoot, id] = value as [OpfsFs, string, string];
      return { workspaceRoot, id };
    }
  }
);

// Entries carry `name`/`typeFqn` — user-defined, not confidently curated —
// never captured; only a count.
export const readInstanceIndex = withInstrumentation(
  async function readInstanceIndex(fs: OpfsFs, workspaceRoot: string): Promise<InstanceIndexEntry[]> {
    try {
      const raw = await fs.readFile(indexPath(workspaceRoot), 'utf8');
      return JSON.parse(raw as string) as InstanceIndexEntry[];
    } catch {
      return [];
    }
  },
  {
    op: 'readInstanceIndex',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' && Array.isArray(value) ? { count: value.length } : undefined)
  }
);

export const writeInstanceIndex = withInstrumentation(
  async function writeInstanceIndex(fs: OpfsFs, workspaceRoot: string, entries: InstanceIndexEntry[]): Promise<void> {
    await fs.mkdir(instancesDir(workspaceRoot));
    await fs.writeFile(indexPath(workspaceRoot), JSON.stringify(entries, null, 2));
  },
  {
    op: 'writeInstanceIndex',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, , entries] = value as [OpfsFs, string, InstanceIndexEntry[]];
      return { count: entries.length };
    }
  }
);

// Filenames are `<ulid>.json` — structural ids, safe.
export const listInstanceFiles = withInstrumentation(
  async function listInstanceFiles(fs: OpfsFs, workspaceRoot: string): Promise<string[]> {
    try {
      return (await fs.readdir(instancesDir(workspaceRoot))).filter(
        (name) => name.endsWith('.json') && name !== 'index.json'
      );
    } catch {
      return [];
    }
  },
  {
    op: 'listInstanceFiles',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);
