// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { ReactElement } from 'react';
import { Input } from '@rune-langium/design-system/ui/input';
import { Button } from '@rune-langium/design-system/ui/button';
import { WorkspaceTypePicker } from '../../components/WorkspaceTypePicker.js';
import { useInstanceStore } from '../../store/instance-store.js';
import { filterInstances, usePrototypeViewStore } from '../../store/prototype-view-store.js';
import { withInstrumentation } from '../../services/instrumentation/core.js';

export const InstanceGridPanel = withInstrumentation(
  function InstanceGridPanel(): ReactElement {
    const instances = useInstanceStore((state) => state.instances);
    const validationStatus = useInstanceStore((state) => state.validationStatus);
    const saveStates = useInstanceStore((state) => state.saveStates);
    const duplicateInstance = useInstanceStore((state) => state.duplicateInstance);
    const removeInstance = useInstanceStore((state) => state.removeInstance);
    const view = usePrototypeViewStore((state) => state.state);
    const patch = usePrototypeViewStore((state) => state.patch);
    const rows = filterInstances(Object.values(instances), view.query, view.typeFqn);
    const selectedOutsideFilter = view.selectedId && !rows.some((record) => record.id === view.selectedId);

    return (
      <section data-testid="prototype-grid" className="flex h-full min-h-0 flex-col" aria-label="Instances">
        <div className="flex flex-wrap gap-2 border-b border-border p-2">
          <Input
            aria-label="Search instances"
            value={view.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="Search name or type"
            className="h-8 min-w-48 flex-1"
          />
          <div className="w-64 max-w-full">
            <WorkspaceTypePicker
              label="Filter instance type"
              value={view.typeFqn}
              onSelect={(typeFqn) => patch({ typeFqn })}
              filterKinds={['data', 'choice']}
              allowClear
            />
          </div>
        </div>
        {selectedOutsideFilter && (
          <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
            Selected instance is outside this filter.
          </p>
        )}
        <div className="studio-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Type</th>
                <th className="p-2">Validation</th>
                <th className="p-2">Save</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr
                  key={record.id}
                  role="row"
                  tabIndex={0}
                  aria-selected={record.id === view.selectedId}
                  className="cursor-pointer border-t border-border/60 hover:bg-accent aria-[selected=true]:bg-accent"
                  onClick={() => patch({ selectedId: record.id })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      patch({ selectedId: record.id });
                    }
                  }}
                >
                  <td className="p-2 font-medium">{record.name}</td>
                  <td className="p-2 text-muted-foreground">{record.typeFqn}</td>
                  <td className="p-2 capitalize">{validationStatus[record.id] ?? 'pending'}</td>
                  <td className="p-2 capitalize">{saveStates[record.id]?.state ?? 'unsaved'}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          patch({ selectedId: duplicateInstance(record.id), inspectorTab: 'form' });
                        }}
                      >
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeInstance(record.id).then(() => {
                            if (
                              useInstanceStore.getState().instances[record.id] === undefined &&
                              view.selectedId === record.id
                            ) {
                              patch({ selectedId: null });
                            }
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  },
  { op: 'InstanceGridPanel' }
);
