// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useState } from 'react';
import { useInstanceStore } from '../../store/instance-store.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Input } from '@rune-langium/design-system/ui/input';

export interface InstanceExplorerPanelProps {
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function InstanceExplorerPanel({ selectedId, onSelect }: InstanceExplorerPanelProps) {
  const instances = useInstanceStore((s) => s.instances);
  const createInstance = useInstanceStore((s) => s.createInstance);
  const [filter, setFilter] = useState('');
  const [newTypeFqn, setNewTypeFqn] = useState('');
  const [newName, setNewName] = useState('');

  const rows = Object.values(instances).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));

  const handleCreate = () => {
    const typeFqn = newTypeFqn.trim();
    const name = newName.trim();
    if (!typeFqn || !name) return;
    const id = createInstance(typeFqn, name);
    setNewTypeFqn('');
    setNewName('');
    onSelect(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1.5 border-b border-border p-2">
        <Input
          aria-label="New instance type"
          placeholder="Type FQN (e.g. test.Party)"
          value={newTypeFqn}
          onChange={(e) => setNewTypeFqn(e.target.value)}
          className="h-7 text-xs"
        />
        <div className="flex gap-1.5">
          <Input
            aria-label="New instance name"
            placeholder="Instance name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="xs"
            disabled={!newTypeFqn.trim() || !newName.trim()}
            onClick={handleCreate}
          >
            Create
          </Button>
        </div>
      </div>
      <input
        placeholder="Search instances"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="border-b border-border bg-transparent px-2 py-1 text-sm outline-none"
      />
      <ul className="flex-1 overflow-auto">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={r.id === selectedId}
              className="w-full truncate px-2 py-1 text-left text-sm hover:bg-accent aria-[current=true]:bg-accent"
            >
              {r.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
