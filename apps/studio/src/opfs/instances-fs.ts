// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type { InstanceRecord } from '@rune-langium/codegen/instances';
import type { OpfsFs } from './opfs-fs.js';

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

export async function writeInstance(fs: OpfsFs, workspaceRoot: string, record: InstanceRecord): Promise<void> {
  await fs.mkdir(instancesDir(workspaceRoot));
  await fs.writeFile(instancePath(workspaceRoot, record.id), JSON.stringify(record, null, 2));
}

export async function readInstance(fs: OpfsFs, workspaceRoot: string, id: string): Promise<InstanceRecord> {
  const raw = await fs.readFile(instancePath(workspaceRoot, id), 'utf8');
  return JSON.parse(raw as string) as InstanceRecord;
}

export async function deleteInstance(fs: OpfsFs, workspaceRoot: string, id: string): Promise<void> {
  await fs.unlink(instancePath(workspaceRoot, id));
}

export async function readInstanceIndex(fs: OpfsFs, workspaceRoot: string): Promise<InstanceIndexEntry[]> {
  try {
    const raw = await fs.readFile(indexPath(workspaceRoot), 'utf8');
    return JSON.parse(raw as string) as InstanceIndexEntry[];
  } catch {
    return [];
  }
}

export async function writeInstanceIndex(
  fs: OpfsFs,
  workspaceRoot: string,
  entries: InstanceIndexEntry[]
): Promise<void> {
  await fs.mkdir(instancesDir(workspaceRoot));
  await fs.writeFile(indexPath(workspaceRoot), JSON.stringify(entries, null, 2));
}

export async function listInstanceFiles(fs: OpfsFs, workspaceRoot: string): Promise<string[]> {
  try {
    return (await fs.readdir(instancesDir(workspaceRoot))).filter(
      (name) => name.endsWith('.json') && name !== 'index.json'
    );
  } catch {
    return [];
  }
}
