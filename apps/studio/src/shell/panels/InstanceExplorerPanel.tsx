// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useState } from 'react';
import { useInstanceStore } from '../../store/instance-store.js';

export interface InstanceExplorerPanelProps {
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function InstanceExplorerPanel({ selectedId, onSelect }: InstanceExplorerPanelProps) {
  const instances = useInstanceStore((s) => s.instances);
  const [filter, setFilter] = useState('');

  const rows = Object.values(instances).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
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
