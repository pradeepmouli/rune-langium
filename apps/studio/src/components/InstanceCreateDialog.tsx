// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEffect, useState, type ReactElement } from 'react';
import type { InstanceProvenance } from '@rune-langium/codegen/instances';
import { Button } from '@rune-langium/design-system/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@rune-langium/design-system/ui/dialog';
import { Input } from '@rune-langium/design-system/ui/input';
import { WorkspaceTypePicker } from './WorkspaceTypePicker.js';
import { useInstanceStore } from '../store/instance-store.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

export interface InstanceSeed {
  typeFqn: string;
  data: unknown;
  provenance?: InstanceProvenance;
}

export interface InstanceCreateDialogProps {
  seed?: InstanceSeed;
  open: boolean;
  onClose(): void;
  onCreated(id: string): void;
}

export const InstanceCreateDialog = withInstrumentation(
  function InstanceCreateDialog({ seed, open, onClose, onCreated }: InstanceCreateDialogProps): ReactElement {
    const createInstance = useInstanceStore((state) => state.createInstance);
    const [typeFqn, setTypeFqn] = useState<string | null>(seed?.typeFqn ?? null);
    const [name, setName] = useState('');

    useEffect(() => {
      if (open) {
        setTypeFqn(seed?.typeFqn ?? null);
        const segments = seed?.typeFqn?.split('.') ?? [];
        setName(segments[segments.length - 1] ?? '');
      }
    }, [open, seed]);

    const create = () => {
      if (!typeFqn || !name.trim()) return;
      const id = createInstance(typeFqn, name, {
        ...(seed ? { data: seed.data } : {}),
        ...(seed?.provenance ? { provenance: seed.provenance } : {})
      });
      onCreated(id);
      onClose();
    };

    return (
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New instance</DialogTitle>
            <DialogDescription>Create a persistent instance from a workspace type.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <WorkspaceTypePicker
              label="Instance type"
              value={typeFqn}
              onSelect={setTypeFqn}
              filterKinds={['data', 'choice']}
            />
            <Input aria-label="Instance name" value={name} onChange={(event) => setName(event.target.value)} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={!typeFqn || !name.trim()} onClick={create}>
                Create instance
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
  { op: 'InstanceCreateDialog' }
);
